import { NextResponse } from "next/server";
import { minioClient } from "@/lib/minio";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
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
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const bucketName = process.env.S3_BUCKET_NAME || "verzay-media";
    const filePath = `plan-images/${randomUUID()}.${ext}`;

    await minioClient.putObject(bucketName, filePath, buffer, buffer.length, {
      "Content-Type": file.type,
    });

    const url = `${process.env.S3_PUBLIC_URL}/${bucketName}/${filePath}`;
    return NextResponse.json({ url });
  } catch (error) {
    console.error("[upload-plan-image]", error);
    return NextResponse.json({ error: "Error al subir imagen." }, { status: 500 });
  }
}
