export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { buildRecipeImportTemplate } from '@/lib/recipe-import';

// GET /api/recipes/import-template
// Streams the multi-sheet recipe import template (.xlsx) for the operator
// to fill in. Same generator that the parser is paired with — keeping the
// template in code (not a static file) means the headers can never drift
// from the alias maps in src/lib/recipe-import.ts.
export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const buf = buildRecipeImportTemplate();
  return new NextResponse(Buffer.from(buf), {
    status: 200,
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="recipe-import-template.xlsx"',
      'Cache-Control':       'no-store',
    },
  });
}
