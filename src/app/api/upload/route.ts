export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { v4 as uuidv4 } from 'uuid';

// Server-decided bucket per entity_type. The client used to send `bucket`
// directly, which let any authenticated employee write to arbitrary
// Supabase storage buckets (and learn their existence). The mapping is
// authoritative — unknown entity_type → reject.
const BUCKET_BY_ENTITY_TYPE: Record<string, string> = {
  business: 'brand-assets',
  order:    'orders-files',
  customer: 'orders-files',
  employee: 'orders-files',
  supplier: 'orders-files',
};

// MIME + extension allowlists. SVG is intentionally excluded — it can carry
// inline <script> and would execute against the Supabase storage origin if
// a manager opened the file URL in a browser tab.
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf']);

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// entity_id may be a UUID, a numeric id, or a slug like 'default'. The
// regex forbids slashes and dots, which is what blocks path traversal
// (`../../other-bucket/x`) when we build the storage key.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const formData = await req.formData();

  const file = formData.get('file');
  const entityType = String(formData.get('entity_type') ?? '');
  const entityId = String(formData.get('entity_id') ?? '');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'קובץ לא נמצא' }, { status: 400 });
  }

  const bucket = BUCKET_BY_ENTITY_TYPE[entityType];
  if (!bucket) {
    return NextResponse.json({ error: 'entity_type לא תקין' }, { status: 400 });
  }
  if (!SAFE_ID.test(entityId)) {
    return NextResponse.json({ error: 'entity_id לא תקין' }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'קובץ ריק' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'הקובץ גדול מהמותר (עד 10MB)' }, { status: 413 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'סוג קובץ לא נתמך' }, { status: 415 });
  }

  const rawExt = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!ALLOWED_EXT.has(rawExt)) {
    return NextResponse.json({ error: 'סיומת קובץ לא נתמכת' }, { status: 415 });
  }

  const fileName = `${entityType}/${entityId}/${uuidv4()}.${rawExt}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error('[upload] storage upload failed:', uploadError.message);
    return NextResponse.json({ error: 'העלאה נכשלה' }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);

  const { data: fileRecord, error: dbError } = await supabase.from('uploaded_files').insert({
    entity_type: entityType,
    entity_id: entityId,
    file_name: file.name,
    file_url: publicUrl,
    file_type: file.type,
    bucket: bucket,
  }).select().single();

  if (dbError) {
    console.error('[upload] DB insert failed:', dbError.message);
    return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 });
  }

  return NextResponse.json({ data: fileRecord }, { status: 201 });
}
