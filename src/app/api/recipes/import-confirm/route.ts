export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { logActivity, userActor } from '@/lib/activity-log';
import { parseRecipeWorkbook, type ParseResult } from '@/lib/recipe-import';

// POST /api/recipes/import-confirm
// Re-parses the uploaded workbook (we never trust client-supplied parsed
// rows) and persists:
//   1. Auto-create raw materials that don't already exist (matched by
//      normalized שם_חומר_גלם).
//   2. Upsert recipes by מזהה_לובהבל (= recipe code).
//   3. For updated recipes, replace existing רכיבי_מתכון rows.
//
// Refuses to write if there are any blocking parse errors. Warnings only
// → import proceeds. Returns a summary of what landed.
export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  // 1. Parse
  const form = await req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'יש לצרף קובץ Excel' }, { status: 400 });
  }
  const fileObj = file as File;

  let parsed: ParseResult;
  try {
    const buf = await fileObj.arrayBuffer();
    parsed = parseRecipeWorkbook(buf);
  } catch (err) {
    return NextResponse.json({ error: `שגיאה בקריאת הקובץ: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 });
  }

  // Block if any errors. Warnings are OK.
  if (parsed.errors.length > 0) {
    return NextResponse.json({
      error: `לא ניתן לייבא — נמצאו ${parsed.errors.length} שגיאות בקובץ. תקנו את הקובץ והעלו מחדש.`,
      errors: parsed.errors,
    }, { status: 400 });
  }

  // ── 2. Resolve raw materials (lookup → create as needed) ──────────────────
  const normalize = (s: string) => s
    .replace(/[״"׳']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const { data: existingRawData } = await supabase
    .from('מלאי_חומרי_גלם')
    .select('id, שם_חומר_גלם, יחידת_מידה');

  const rawByKey = new Map<string, { id: string; unit: string | null }>();
  for (const r of (existingRawData || []) as Array<{ id: string; שם_חומר_גלם: string; יחידת_מידה: string | null }>) {
    const key = normalize(String(r.שם_חומר_גלם || ''));
    if (key && !rawByKey.has(key)) rawByKey.set(key, { id: r.id, unit: r.יחידת_מידה });
  }

  let rawMaterialsCreated = 0;
  let rawMaterialsReused  = 0;

  for (const raw of parsed.rawMaterials) {
    if (!raw.nameKey) continue;
    if (rawByKey.has(raw.nameKey)) {
      rawMaterialsReused += 1;
      continue;
    }
    // Create. NEVER include price (per spec: no financial fields on auto-created
    // raw materials). Auto-created note tells the operator where it came from.
    const { data: created, error: createErr } = await supabase
      .from('מלאי_חומרי_גלם')
      .insert({
        שם_חומר_גלם:    raw.name,
        כמות_במלאי:     raw.initialStock || 0,
        יחידת_מידה:     raw.unit || '',
        סף_מלאי_נמוך:   raw.minThreshold ?? null,
        הערות:          raw.notes,
      })
      .select('id')
      .single();
    if (createErr || !created) {
      return NextResponse.json({
        error: `שגיאה ביצירת חומר גלם "${raw.name}": ${createErr?.message ?? 'unknown'}`,
      }, { status: 500 });
    }
    rawByKey.set(raw.nameKey, { id: created.id as string, unit: raw.unit || null });
    rawMaterialsCreated += 1;

    // Audit each new raw material so the operator can later see what
    // was auto-created vs what they entered manually.
    await logActivity({
      actor: userActor(auth),
      module: 'inventory',
      action: 'raw_material_created_from_recipe_import',
      title:  `חומר גלם נוצר אוטומטית: ${raw.name}`,
      description: `נוצר מייבוא מתכונים — יחידה: ${raw.unit || '—'}, כמות התחלתית: ${raw.initialStock || 0}.`,
      entityType: 'מלאי_חומרי_גלם',
      entityId:   created.id as string,
      entityLabel: raw.name,
      metadata: { source: 'recipe_import', fileName: fileObj.name },
    });
  }

  // ── 3. Recipes: upsert by מזהה_לובהבל ─────────────────────────────────────
  const recipeCodes = parsed.recipes.map(r => r.code).filter(Boolean);
  let recipeMap = new Map<string, string>(); // code → id
  if (recipeCodes.length > 0) {
    const { data: existing } = await supabase
      .from('מתכונים')
      .select('id, מזהה_לובהבל')
      .in('מזהה_לובהבל', recipeCodes);
    recipeMap = new Map(
      ((existing || []) as Array<{ id: string; מזהה_לובהבל: string }>).map(r => [r.מזהה_לובהבל, r.id]),
    );
  }

  let recipesCreated  = 0;
  let recipesUpdated  = 0;
  const recipeIdByCode = new Map<string, string>();

  for (const rec of parsed.recipes) {
    const baseFields = {
      מזהה_לובהבל:  rec.code,
      שם_מתכון:     rec.name,
      כמות_תוצר:    rec.yieldQty,
      יחידת_תפוקה:  rec.yieldUnit,
      הערות:        rec.notes,
    };

    const existingId = recipeMap.get(rec.code);
    if (existingId) {
      const { error: updErr } = await supabase
        .from('מתכונים')
        .update(baseFields)
        .eq('id', existingId);
      if (updErr) {
        return NextResponse.json({
          error: `שגיאה בעדכון מתכון "${rec.name}" (${rec.code}): ${updErr.message}`,
        }, { status: 500 });
      }
      recipeIdByCode.set(rec.code, existingId);
      recipesUpdated += 1;

      await logActivity({
        actor: userActor(auth),
        module: 'inventory',
        action: 'recipe_updated_from_import',
        title:  `מתכון עודכן מייבוא: ${rec.name}`,
        description: `קוד מתכון: ${rec.code}. רכיבים יוחלפו לפי הקובץ.`,
        entityType: 'מתכונים',
        entityId:   existingId,
        entityLabel: rec.name,
        metadata: { source: 'recipe_import', fileName: fileObj.name },
      });
    } else {
      const { data: ins, error: insErr } = await supabase
        .from('מתכונים')
        .insert(baseFields)
        .select('id')
        .single();
      if (insErr || !ins) {
        return NextResponse.json({
          error: `שגיאה ביצירת מתכון "${rec.name}" (${rec.code}): ${insErr?.message ?? 'unknown'}`,
        }, { status: 500 });
      }
      recipeIdByCode.set(rec.code, ins.id as string);
      recipesCreated += 1;

      await logActivity({
        actor: userActor(auth),
        module: 'inventory',
        action: 'recipe_created_from_import',
        title:  `מתכון נוצר מייבוא: ${rec.name}`,
        description: `קוד מתכון: ${rec.code}.`,
        entityType: 'מתכונים',
        entityId:   ins.id as string,
        entityLabel: rec.name,
        metadata: { source: 'recipe_import', fileName: fileObj.name },
      });
    }
  }

  // ── 4. Recipe ingredients: REPLACE for every recipe in the file ───────────
  // For each recipe touched by the import, delete its ingredients and
  // re-insert from the file. This matches the operator's mental model
  // ("the file is the new source of truth for these recipes") and avoids
  // ambiguous merges.
  const allRecipeIds = Array.from(recipeIdByCode.values());
  if (allRecipeIds.length > 0) {
    const { error: delErr } = await supabase
      .from('רכיבי_מתכון')
      .delete()
      .in('מתכון_id', allRecipeIds);
    if (delErr) {
      return NextResponse.json({
        error: `שגיאה במחיקת רכיבים קיימים: ${delErr.message}`,
      }, { status: 500 });
    }
  }

  const ingredientRows: Array<{
    מתכון_id: string; חומר_גלם_id: string; כמות_נדרשת: number; יחידת_מידה: string;
  }> = [];
  for (const ing of parsed.ingredients) {
    const recipeId = recipeIdByCode.get(ing.recipeCode);
    const rawHit   = rawByKey.get(ing.rawNameKey);
    if (!recipeId || !rawHit) continue; // shouldn't happen — validated above
    ingredientRows.push({
      מתכון_id:   recipeId,
      חומר_גלם_id: rawHit.id,
      כמות_נדרשת:  ing.qty,
      יחידת_מידה:  ing.unit,
    });
  }

  if (ingredientRows.length > 0) {
    const { error: insErr } = await supabase
      .from('רכיבי_מתכון')
      .insert(ingredientRows);
    if (insErr) {
      return NextResponse.json({
        error: `שגיאה בהוספת רכיבי מתכון: ${insErr.message}`,
      }, { status: 500 });
    }
  }

  const summary = {
    recipesCreated,
    recipesUpdated,
    ingredientsImported: ingredientRows.length,
    rawMaterialsCreated,
    rawMaterialsReused,
    warningsCount: parsed.warnings.length,
  };

  await logActivity({
    actor: userActor(auth),
    module: 'inventory',
    action: 'recipe_import_confirmed',
    title:  `ייבוא מתכונים בוצע — ${recipesCreated + recipesUpdated} מתכונים`,
    description: `קובץ "${fileObj.name}": ${recipesCreated} חדשים, ${recipesUpdated} עדכונים, ${rawMaterialsCreated} חומרי גלם חדשים, ${ingredientRows.length} שורות רכיבים.`,
    metadata: { fileName: fileObj.name, summary },
    request: req,
  });

  return NextResponse.json({ success: true, summary });
}
