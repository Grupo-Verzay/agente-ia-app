import { randomUUID } from 'crypto';
import { minioClient } from '@/lib/minio';

/**
 * Los adjuntos que salen de la App (una nota de voz grabada, una imagen del
 * selector) llegan como `data:` URL o base64 pelado. Para Evolution eso da
 * igual: su servidor conserva el archivo y lo devuelve al releer el chat. Para
 * WhatsApp Mensajeria (WAHA) no hay nadie que lo guarde: nuestra copia ES la
 * que salio del navegador. Si no se sube a S3, la burbuja queda vacia -la
 * fila decia "Nota de voz" y la conversacion no ensenaba nada, 2026-09-07-.
 *
 * Se sube a S3 (el mismo bucket que las grabaciones de llamadas) y se devuelve
 * la URL publica, que sirve para las dos cosas: mandarla a WAHA (que la
 * descarga) y guardarla en el mensaje (que la App reproduce). Una URL http se
 * devuelve tal cual. Nunca lanza: sin subida, quien llama decide.
 */
export async function subirAdjuntoSaliente(params: {
  userId: string;
  mediaUrl: string;
  mimetype?: string | null;
  fileName?: string | null;
}): Promise<string | null> {
  const { mediaUrl } = params;
  if (!mediaUrl) return null;
  if (/^https?:\/\//i.test(mediaUrl)) return mediaUrl;

  const dataUrl = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(mediaUrl);
  const base64 = dataUrl ? dataUrl[3] : mediaUrl;
  const mimetype = (params.mimetype || dataUrl?.[1] || 'application/octet-stream').split(';')[0].trim();

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return null;
  }
  if (!buffer.length) return null;

  try {
    const bucket = process.env.S3_BUCKET_NAME || 'verzay-media';
    const ruta = `chats/${params.userId}/${randomUUID()}.${extensionPara(mimetype, params.fileName)}`;
    await minioClient.putObject(bucket, ruta, buffer, buffer.length, { 'Content-Type': mimetype });
    const base = (process.env.S3_PUBLIC_URL ?? '').replace(/\/+$/, '');
    if (!base) {
      console.warn('[adjuntos] S3_PUBLIC_URL no esta configurada: el adjunto se subio pero no hay URL publica');
      return null;
    }
    return `${base}/${bucket}/${ruta}`;
  } catch (error) {
    console.warn('[adjuntos] no se pudo subir el adjunto saliente', {
      mimetype,
      bytes: buffer.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function extensionPara(mimetype: string, fileName?: string | null): string {
  const delNombre = (fileName ?? '').split('.').pop()?.toLowerCase();
  if (delNombre && /^[a-z0-9]{2,5}$/.test(delNombre) && delNombre !== fileName?.toLowerCase()) return delNombre;
  const m = mimetype.toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a')) return m.startsWith('video') ? 'mp4' : 'm4a';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('pdf')) return 'pdf';
  return 'bin';
}
