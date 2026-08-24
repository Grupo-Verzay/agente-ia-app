'use server';

// M2 del item "grabación + transcripción + resumen".
// Tras una llamada, descarga el WAV grabado por AstraCalls, lo transcribe y lo
// resume con la IA del usuario, y guarda el resultado en chat_messages.raw.call.
// Reutiliza la config de IA del usuario (igual que el lead scoring).

import { Prisma } from '@prisma/client';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { minioClient } from '@/lib/minio';

const BASE = (process.env.ASTRACALLS_URL || '').replace(/\/+$/, '');
const KEY = process.env.ASTRACALLS_API_KEY || '';

interface AiCfg {
  apiKey: string;
  providerName: string;
  modelName: string;
}

async function getUserAiConfig(userId: string): Promise<AiCfg | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { defaultProviderId: true, defaultAiModelId: true },
  });
  if (!user?.defaultProviderId) return null;

  const [config, provider, model] = await Promise.all([
    db.userAiConfig.findFirst({
      where: { userId, providerId: user.defaultProviderId, isActive: true },
      select: { apiKey: true },
    }),
    db.aiProvider.findUnique({ where: { id: user.defaultProviderId }, select: { name: true } }),
    user.defaultAiModelId
      ? db.aiModel.findUnique({ where: { id: user.defaultAiModelId }, select: { name: true } })
      : null,
  ]);
  if (!config?.apiKey || !provider?.name) return null;
  return {
    apiKey: config.apiKey,
    providerName: provider.name,
    modelName: model?.name ?? (provider.name === 'google' ? 'gemini-2.0-flash' : 'gpt-4o-mini'),
  };
}

async function fetchRecordingBase64(sid: string, callId: string): Promise<string | null> {
  if (!BASE || !KEY) return null;
  try {
    const r = await fetch(`${BASE}/api/sessions/${sid}/calls/${callId}/recording`, {
      headers: { 'X-API-Key': KEY },
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 64) return null; // WAV vacío
    return buf.toString('base64');
  } catch {
    return null;
  }
}

async function transcribe(
  audioBase64: string,
  cfg: AiCfg,
  opts: { filename?: string; mimeType?: string } = {},
): Promise<string> {
  const buffer = Buffer.from(audioBase64, 'base64');
  const filename = opts.filename || 'call.wav';
  const mimeType = opts.mimeType || 'audio/wav';

  if (cfg.providerName === 'google') {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: cfg.apiKey });
    const res = await ai.models.generateContent({
      model: cfg.modelName || 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Transcribe esta llamada palabra por palabra. Marca cada turno con "Operador:" o "Cliente:" según quién habla.' },
            { inlineData: { mimeType, data: audioBase64 } },
          ],
        },
      ],
    });
    return (res.text ?? '').trim();
  }

  // OpenAI: intenta el modelo de mayor calidad y cae a whisper-1 si falla.
  // Cada intento recrea el stream (se consume al subirlo). El nombre del archivo
  // le indica el formato a OpenAI (wav para Astra, webm para las grabadas en el
  // navegador de las llamadas Meta).
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: cfg.apiKey });
  for (const model of ['gpt-4o-transcribe', 'whisper-1']) {
    try {
      const stream = Readable.from(buffer);
      (stream as any).path = filename;
      const tr = await openai.audio.transcriptions.create({ file: stream as any, model });
      const text = (tr.text ?? '').trim();
      if (text) return text;
    } catch {
      // siguiente modelo
    }
  }
  return '';
}

const SUMMARY_SYSTEM = `Eres un asistente de ventas. Resume en español la siguiente transcripción de una llamada, en este formato:
- 1 a 5 puntos clave (viñetas breves), según el contenido disponible.
- Una línea final "Próximo paso:" con la acción recomendada (si no hay datos claros, sugiere "Hacer seguimiento").
Resume SIEMPRE que haya texto, aunque la llamada sea corta o informal. Solo responde exactamente "Sin contenido" si la transcripción está completamente vacía.`;

async function summarize(transcript: string, cfg: AiCfg): Promise<string> {
  if (!transcript.trim()) return '';
  try {
    if (cfg.providerName === 'google') {
      const { GoogleAiClient } = await import('@/actions/open-ai-actions');
      const res = await new GoogleAiClient().complete({
        apiKey: cfg.apiKey,
        model: cfg.modelName || 'gemini-2.0-flash',
        system: SUMMARY_SYSTEM,
        messages: [{ role: 'user', content: transcript }],
      });
      return res.content;
    }
    const { OpenAiClient } = await import('@/actions/open-ai-actions');
    const res = await new OpenAiClient().complete({
      apiKey: cfg.apiKey,
      model: cfg.modelName || 'gpt-4o-mini',
      system: SUMMARY_SYSTEM,
      messages: [{ role: 'user', content: transcript }],
    });
    return res.content;
  } catch {
    return '';
  }
}

/**
 * Procesa la grabación de una llamada: descarga el WAV de AstraCalls, transcribe,
 * resume y guarda en chat_messages.raw.call. Best-effort e idempotente (si ya hay
 * transcripción, no rehace). Se llama desde el cliente tras colgar.
 */
/**
 * Duración de un WAV a partir de su propio encabezado (sampleRate/canales/bits),
 * sin depender de que AstraCalls informe la duración de la llamada. Astra no da
 * ese dato en la respuesta de lanzar la llamada del bot, y la grabación es lo
 * único fiable que hay: su duración es, en la práctica, la de la llamada.
 */
function duracionDelWav(buffer: Buffer): number {
  try {
    if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') return 0;
    const canales = buffer.readUInt16LE(22);
    const sampleRate = buffer.readUInt32LE(24);
    const bitsPorMuestra = buffer.readUInt16LE(34);
    if (!canales || !sampleRate || !bitsPorMuestra) return 0;

    // Busca el chunk "data" (puede no estar justo después del header fmt fijo).
    let offset = 12;
    while (offset + 8 <= buffer.length) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      if (chunkId === 'data') {
        const bytesPorMuestra = (bitsPorMuestra / 8) * canales;
        if (!bytesPorMuestra) return 0;
        return Math.round(chunkSize / bytesPorMuestra / sampleRate);
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Descarga la grabación, transcribe, resume y guarda todo en chat_messages.raw.
 * Best-effort e idempotente (si ya hay transcripción, no rehace).
 *
 * Compartida por las dos llamadas que pueden pedir este proceso: la del asesor
 * en vivo (processCallRecordingAction, autenticada por sesión) y la del bot
 * lanzado por una automatización (sin sesión de navegador: la pide el backend
 * por su cuenta cuando detecta que la grabación ya está lista).
 */
export async function processCallRecordingForUser(input: {
  userId: string;
  chatMessageId: string;
  astraSid: string;
  astraCallId: string;
}): Promise<{ success: boolean; message?: string }> {
  if (!BASE || !KEY) return { success: false, message: 'Llamadas no configuradas.' };

  let id: bigint;
  try {
    id = BigInt(input.chatMessageId);
  } catch {
    return { success: false, message: 'ID inválido.' };
  }

  const row = await db.chatMessage.findFirst({
    where: { id, userId: input.userId, messageType: 'call' },
    select: { raw: true },
  });
  if (!row) return { success: false, message: 'Llamada no encontrada.' };

  const rawObj = row.raw && typeof row.raw === 'object' && !Array.isArray(row.raw)
    ? (row.raw as Record<string, unknown>)
    : {};
  const callObj = rawObj.call && typeof rawObj.call === 'object' && !Array.isArray(rawObj.call)
    ? (rawObj.call as Record<string, unknown>)
    : {};
  if (callObj.transcript) return { success: true }; // ya procesada

  const wavBase64 = await fetchRecordingBase64(input.astraSid, input.astraCallId);
  if (!wavBase64) return { success: false, message: 'Grabación no disponible aún.' };

  const cfg = await getUserAiConfig(input.userId);
  if (!cfg) return { success: false, message: 'Sin configuración de IA activa.' };

  const transcript = await transcribe(wavBase64, cfg);
  const summary = transcript ? await summarize(transcript, cfg) : '';

  // La duración solo se recalcula si aún no hay una (p.ej. la llamada del
  // asesor ya la trae medida en vivo desde el navegador; la del bot llega en 0
  // porque nadie la midió, así que aquí se completa con la del audio).
  const duracion = Number(callObj.durationSecs ?? 0) || duracionDelWav(Buffer.from(wavBase64, 'base64'));

  const nextRaw = {
    ...rawObj,
    call: {
      ...callObj,
      hasRecording: true,
      astraSid: input.astraSid,
      astraCallId: input.astraCallId,
      transcript: transcript || null,
      summary: summary || null,
      durationSecs: duracion,
    },
  };

  await db.chatMessage.update({ where: { id }, data: { raw: nextRaw as Prisma.InputJsonValue } });
  return { success: true };
}

export async function processCallRecordingAction(input: {
  chatMessageId: string;
  astraSid: string;
  astraCallId: string;
}): Promise<{ success: boolean; message?: string }> {
  const me = await currentUser();
  const userId = me?.effectiveId ?? me?.ownerId ?? me?.id;
  if (!userId) return { success: false, message: 'No autorizado.' };
  return processCallRecordingForUser({ ...input, userId });
}

function extFromMime(mime: string): string {
  const m = (mime || '').toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  return 'webm';
}

async function uploadRecording(userId: string, buffer: Buffer, mimeType: string): Promise<string | null> {
  try {
    const bucket = process.env.S3_BUCKET_NAME || 'verzay-media';
    const ext = extFromMime(mimeType);
    const path = `calls/${userId}/${randomUUID()}.${ext}`;
    await minioClient.putObject(bucket, path, buffer, buffer.length, { 'Content-Type': mimeType });
    return `${process.env.S3_PUBLIC_URL}/${bucket}/${path}`;
  } catch (e) {
    console.error('[calls-recording] error subiendo grabación Meta:', e);
    return null;
  }
}

/**
 * Procesa la grabación de una llamada META grabada en el navegador (Meta no ofrece
 * grabación por su API WebRTC, así que se captura el audio local+remoto en el
 * cliente). Sube el audio a S3 (para reproducirlo), lo transcribe y lo resume, y
 * guarda recordingUrl/transcript/summary en chat_messages.raw.call — el mismo
 * formato que consume CallDetailDialog. Best-effort e idempotente.
 */
export async function processMetaCallRecordingAction(input: {
  chatMessageId: string;
  audioBase64: string;
  mimeType?: string;
}): Promise<{ success: boolean; message?: string }> {
  const me = await currentUser();
  const userId = me?.effectiveId ?? me?.ownerId ?? me?.id;
  if (!userId) return { success: false, message: 'No autorizado.' };
  if (!input.audioBase64 || input.audioBase64.length < 128) {
    return { success: false, message: 'Grabación vacía.' };
  }

  let id: bigint;
  try {
    id = BigInt(input.chatMessageId);
  } catch {
    return { success: false, message: 'ID inválido.' };
  }

  const row = await db.chatMessage.findFirst({
    where: { id, userId, messageType: 'call' },
    select: { raw: true },
  });
  if (!row) return { success: false, message: 'Llamada no encontrada.' };

  const rawObj = row.raw && typeof row.raw === 'object' && !Array.isArray(row.raw)
    ? (row.raw as Record<string, unknown>)
    : {};
  const callObj = rawObj.call && typeof rawObj.call === 'object' && !Array.isArray(rawObj.call)
    ? (rawObj.call as Record<string, unknown>)
    : {};
  if (callObj.transcript) return { success: true }; // ya procesada

  const mimeType = input.mimeType || 'audio/webm';
  const buffer = Buffer.from(input.audioBase64, 'base64');
  const ext = extFromMime(mimeType);

  // 1) Subir la grabación para poder reproducirla en el detalle.
  const recordingUrl = await uploadRecording(userId, buffer, mimeType);

  // 2) Transcribir + resumir con la IA del usuario (mismo pipeline que Astra).
  const cfg = await getUserAiConfig(userId);
  let transcript = '';
  let summary = '';
  if (cfg) {
    transcript = await transcribe(input.audioBase64, cfg, {
      filename: `call.${ext}`,
      mimeType,
    });
    summary = transcript ? await summarize(transcript, cfg) : '';
  }

  const nextRaw = {
    ...rawObj,
    call: {
      ...callObj,
      hasRecording: Boolean(recordingUrl),
      recordingUrl: recordingUrl || null,
      transcript: transcript || null,
      summary: summary || null,
    },
  };

  await db.chatMessage.update({ where: { id }, data: { raw: nextRaw as Prisma.InputJsonValue } });
  return { success: true };
}
