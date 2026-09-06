import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { assertCanAccessTargetUser } from '@/actions/billing/helpers/app-access-guard';
import { Readable } from 'stream';
import { minioClient } from '@/lib/minio';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // Sin esto, cualquiera -con o sin sesion- podia subir archivos al bucket.
  // Estas rutas solo confiaban en el middleware, y el middleware se pudo
  // saltar hasta #505 (H02/H03 de la auditoria del 2026-09-06).
  const quien = await currentUser();
  if (!quien) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const formData = await req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'No se proporcionó un archivo.' }, { status: 400 });
  }

  const nameFormatted = file.name.replaceAll(' ', '_');
  const bucketName = process.env.S3_BUCKET_NAME || 'verzay-media';

  //  carpeta dedicada a recibos
  const filePath = `finance/receipts/${randomUUID()}-${nameFormatted}`;


  try {
    await minioClient.putObject(
      bucketName,
      filePath,
      Readable.fromWeb(file.stream() as never),
      file.size,
      { 'Content-Type': file.type }
    );

    const fileUrl = `${process.env.S3_PUBLIC_URL}/${bucketName}/${filePath}`;

    return NextResponse.json({
      message: 'Archivo subido con éxito.',
      url: fileUrl,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
  } catch (error) {
    console.error('Error al subir el archivo:', error);
    return NextResponse.json({ error: 'Error al subir el archivo.' }, { status: 500 });
  }
}
