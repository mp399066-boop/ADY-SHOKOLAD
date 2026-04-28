export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const formData = await req.formData();

  const file = formData.get('file') as File;
  const entityType = formData.get('entity_type') as string;
  const entityId = formData.get('entity_id') as string;
  const bucket = formData.get('bucket') as string || 'orders-files';

  if (!file) return NextResponse.json({ error: 'чебх ма роца' }, { status: 400 });

  const ext = file.name.split('.').pop();
  const fileName = `${entityType}/${entityId}/${uuidv4()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);

  // Save file record
  const { data: fileRecord, error: dbError } = await supabase.from('uploaded_files').insert({
    entity_type: entityType,
    entity_id: entityId,
    file_name: file.name,
    file_url: publicUrl,
    file_type: file.type,
    bucket: bucket,
  }).select().single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ data: fileRecord }, { status: 201 });
}

