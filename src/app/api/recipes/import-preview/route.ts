export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { logActivity, userActor } from '@/lib/activity-log';
import { parseRecipeWorkbook, type ParseResult } from '@/lib/recipe-import';

// POST /api/recipes/import-preview
// Multipart file upload → parses the workbook in-memory and returns the
// full ParseResult enriched with "exists in DB?" status. NEVER writes to
// the DB. The confirm route re-parses the same file, so the client may
// not edit the parsed payload between preview and confirm.
export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  // 1. Read uploaded file
  const form = await req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'יש לצרף קובץ Excel' }, { status: 400 });
  }
  const fileObj = file as File;
  if (!fileObj.name.toLowerCase().match(/\.xlsx?$/)) {
    return NextResponse.json({ error: 'סוג קובץ לא נתמך — נדרש .xlsx או .xls' }, { status: 400 });
  }

  console.log('[recipe-import-preview] called — file:', fileObj.name, fileObj.size, 'bytes');

  let parsed: ParseResult;
  try {
    const buf = await fileObj.arrayBuffer();
    parsed = parseRecipeWorkbook(buf);
  } catch (err) {
    console.error('[recipe-import-preview] parse failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: `שגיאה בקריאת הקובץ: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 });
  }

  console.log('[recipe-import-preview] sheets found:', parsed.sheetsFound);
  console.log('[recipe-import-preview] recipes:', parsed.recipes.length);
  console.log('[recipe-import-preview] ingredients:', parsed.ingredients.length);
  console.log('[recipe-import-preview] raw materials:', parsed.rawMaterials.length);
  console.log('[recipe-import-preview] errors:', parsed.errors.length, '| warnings:', parsed.warnings.length);

  // 2. Enrich with DB-existence flags. Only run lookups if there's
  //    something usable in the file.
  const recipeCodes      = parsed.recipes
    .filter(r => r.status !== 'error' && r.code)
    .map(r => r.code);
  const rawNameKeys      = parsed.rawMaterials.map(r => r.nameKey);

  // Existing recipes by מזהה_לובהבל (= recipe code)
  if (recipeCodes.length > 0) {
    const { data: existing } = await supabase
      .from('מתכונים')
      .select('id, מזהה_לובהבל')
      .in('מזהה_לובהבל', recipeCodes);
    const existingMap = new Map<string, string>(
      (existing || []).map((r: { id: string; מזהה_לובהבל: string }) => [r.מזהה_לובהבל, r.id]),
    );
    for (const rec of parsed.recipes) {
      if (rec.status === 'error') continue;
      if (existingMap.has(rec.code)) rec.status = 'update';
    }
  }

  // Existing raw materials by normalized name
  if (rawNameKeys.length > 0) {
    const { data: existingRaw } = await supabase
      .from('מלאי_חומרי_גלם')
      .select('id, שם_חומר_גלם, יחידת_מידה');
    const byKey = new Map<string, { id: string; unit: string | null }>();
    for (const r of (existingRaw || []) as Array<{ id: string; שם_חומר_גלם: string; יחידת_מידה: string | null }>) {
      const key = String(r.שם_חומר_גלם || '')
        .replace(/[״"׳']/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (key && !byKey.has(key)) byKey.set(key, { id: r.id, unit: r.יחידת_מידה });
    }
    for (const raw of parsed.rawMaterials) {
      const hit = byKey.get(raw.nameKey);
      if (!hit) continue;
      raw.status = 'existing';
      // Surface unit-mismatch between file and DB so the operator sees
      // it before confirming. Not a blocker — just a warning.
      if (hit.unit && raw.unit && hit.unit.trim().toLowerCase() !== raw.unit.trim().toLowerCase()) {
        raw.status = 'warning';
        raw.warnings.push(`יחידה במלאי הקיים: "${hit.unit}" — בקובץ: "${raw.unit}". לא יעודכן ללא אישור ידני.`);
      }
    }
  }

  // 3. Summary counts (the UI shows these in the header)
  const summary = {
    totalRecipes:      parsed.recipes.length,
    newRecipes:        parsed.recipes.filter(r => r.status === 'new').length,
    updatedRecipes:    parsed.recipes.filter(r => r.status === 'update').length,
    erroredRecipes:    parsed.recipes.filter(r => r.status === 'error').length,
    totalIngredients:  parsed.ingredients.length,
    erroredIngredients: parsed.ingredients.filter(i => i.status === 'error').length,
    totalRawMaterials:    parsed.rawMaterials.length,
    newRawMaterials:      parsed.rawMaterials.filter(r => r.status === 'new').length,
    existingRawMaterials: parsed.rawMaterials.filter(r => r.status === 'existing').length,
    warningRawMaterials:  parsed.rawMaterials.filter(r => r.status === 'warning').length,
    errors:   parsed.errors.length,
    warnings: parsed.warnings.length,
    canImport: parsed.errors.length === 0,
  };

  // 4. Audit
  await logActivity({
    actor: userActor(auth),
    module: 'inventory',
    action: 'recipe_import_preview',
    status: parsed.errors.length > 0 ? 'warning' : 'success',
    title: `תצוגה מקדימה לייבוא מתכונים — ${summary.totalRecipes} מתכונים`,
    description: `קובץ "${fileObj.name}" נסרק: ${summary.newRecipes} חדשים, ${summary.updatedRecipes} עדכונים, ${summary.errors} שגיאות.`,
    metadata: { fileName: fileObj.name, summary },
    request: req,
  });

  return NextResponse.json({ ...parsed, summary });
}
