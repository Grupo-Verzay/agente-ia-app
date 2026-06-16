import { NextRequest, NextResponse } from 'next/server';
import { minioClient } from '@/lib/minio';
import { nanoid } from 'nanoid';
import path from 'path';

const BUCKET = process.env.S3_BUCKET_NAME || 'verzay-media';
const PUBLIC_URL = (process.env.S3_PUBLIC_URL || '').replace(/\/$/, '');

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-rar-compressed',
];

const MAX_SIZE_MB = 10;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ success: false, error: 'No se recibió ningún archivo' }, { status: 400 });

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ success: false, error: `El archivo supera el límite de ${MAX_SIZE_MB}MB` }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, error: 'Tipo de archivo no permitido' }, { status: 400 });
    }

    const ext = path.extname(file.name) || '';
    const safeName = `formularios/${nanoid()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await minioClient.putObject(BUCKET, safeName, buffer, buffer.length, {
      'Content-Type': file.type,
    });

    const url = `${PUBLIC_URL}/${BUCKET}/${safeName}`;
    return NextResponse.json({ success: true, url, name: file.name });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
