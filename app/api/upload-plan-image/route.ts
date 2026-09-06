import { NextResponse } from "next/server";
import { currentUser } from '@/lib/auth';
import { assertCanAccessTargetUser } from '@/actions/billing/helpers/app-access-guard';
import { Readable } from 'stream';
import { minioClient } from "@/lib/minio";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  // Sin esto, cualquiera -con o sin sesion- podia subir archivos al bucket.
  // Estas rutas solo confiaban en el middleware, y el middleware se pudo
  // saltar hasta #505 (H02/H03 de la auditoria del 2026-09-06).
  const quien = await currentUser();
  if (!quien) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No se proporcionó archivo." }, { status: 400 });
  }

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Tipo de archivo no permitido." }, { status: 400 });
  }

  try {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const bucketName = process.env.S3_BUCKET_NAME || "verzay-media";
    const filePath = `plan-images/${randomUUID()}.${ext}`;

    await minioClient.putObject(bucketName, filePath, Readable.fromWeb(file.stream() as never), file.size, {
      "Content-Type": file.type,
    });

    const url = `${process.env.S3_PUBLIC_URL}/${bucketName}/${filePath}`;
    return NextResponse.json({ url });
  } catch (error) {
    console.error("[upload-plan-image]", error);
    return NextResponse.json({ error: "Error al subir imagen." }, { status: 500 });
  }
}
