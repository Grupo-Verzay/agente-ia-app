import { NextResponse } from 'next/server';
import { minioClient } from '@/lib/minio';
import { randomUUID } from 'crypto';

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const userID = formData.get('userID') as string;
  const workflowID = formData.get('workflowID') as string;

  if (!file) {
    return NextResponse.json({ error: 'No se proporcionó un archivo.' }, { status: 400 });
  }

  if (!userID || !workflowID) {
    return NextResponse.json({ error: 'UserID y workflowID son obligatorios.' }, { status: 400 });
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const nameFormatted = file.name.replaceAll(' ', '_');
    const bucketName = process.env.S3_BUCKET_NAME || 'verzay-media';
    
    // Estructura: userID/workflowID/UUID-filename.ext
    const filePath = `${userID}/${workflowID}/${randomUUID()}-${nameFormatted}`;

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
    });
  } catch (error) {
    console.error('Error subiendo el archivo a MinIO:', error);
    return NextResponse.json({ error: 'API UPLOAD - error al subir el archivo.' }, { status: 500 });
  }
}
