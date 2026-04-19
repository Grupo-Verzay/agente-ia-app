import { NextResponse } from 'next/server';
import { minioClient } from '@/lib/minio';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'No se proporcionó un archivo.' }, { status: 400 });
  }

  const nameFormatted = file.name.replaceAll(' ', '_');
  const bucketName = process.env.S3_BUCKET_NAME || 'verzay-media';

  //  carpeta dedicada a recibos
  const filePath = `finance/receipts/${randomUUID()}-${nameFormatted}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  try {
    await minioClient.putObject(
      bucketName,
      filePath,
      buffer,
      buffer.length,
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
