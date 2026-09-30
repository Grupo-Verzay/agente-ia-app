import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { minioClient } from '@/lib/minio';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { laCarpetaDelFormulario, laExtensionDelArchivo } from '@/lib/formularios';
import { BUCKET_DE_FORMULARIOS, laUrlDelArchivo } from '@/lib/archivos-de-formularios.server';

/**
 * Los archivos que adjunta quien llena un formulario PÚBLICO (`/f/...`).
 *
 * Es pública a propósito —quien llena el formulario no tiene cuenta— y estaba
 * en el middleware SIN su prefijo: a un visitante lo mandaba al login y el
 * campo «Archivo» no subía nada (medido en producción: `307 -> /login`).
 *
 * Ser pública no la abre: la puerta es el FORMULARIO. Tiene que existir, estar
 * activo y tener un campo de archivo; sin eso cualquiera podría usar esta ruta
 * para subir lo que quisiera al bucket. Y lo que se sube cae en la carpeta de
 * ESE formulario (`formularios/<id>/...`), que es lo único que el envío acepta
 * después: un archivo subido a otro formulario, o una dirección cualquiera, no
 * se guarda en un registro.
 */

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
    const formId = String(formData.get('formId') ?? '').trim();

    const form = formId
      ? await db.form.findUnique({
          where: { id: formId },
          select: { id: true, isActive: true, fields: { where: { type: 'file' }, select: { id: true } } },
        })
      : null;
    if (!form || !form.isActive || form.fields.length === 0) {
      return NextResponse.json({ success: false, error: 'Este formulario no recibe archivos' }, { status: 404 });
    }

    if (!file || typeof file === 'string') {
      return NextResponse.json({ success: false, error: 'No se recibió ningún archivo' }, { status: 400 });
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ success: false, error: `El archivo supera el límite de ${MAX_SIZE_MB}MB` }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, error: 'Tipo de archivo no permitido' }, { status: 400 });
    }

    const llave = `${laCarpetaDelFormulario(form.id)}${nanoid()}${laExtensionDelArchivo(file.name)}`;

    await minioClient.putObject(BUCKET_DE_FORMULARIOS, llave, Readable.fromWeb(file.stream() as never), file.size, {
      'Content-Type': file.type,
    });

    return NextResponse.json({ success: true, url: laUrlDelArchivo(llave), name: file.name });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[formularios] no se pudo subir un archivo', msg);
    return NextResponse.json({ success: false, error: 'No se pudo subir el archivo' }, { status: 500 });
  }
}
