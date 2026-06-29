'use server';

// M2 del item "grabación + transcripción + resumen".
// Tras una llamada, descarga el WAV grabado por AstraCalls, lo transcribe y lo
// resume con la IA del usuario, y guarda el resultado en chat_messages.raw.call.
// Reutiliza la config de IA del usuario (igual que el lead scoring).

import { Prisma } from '@prisma/client';
import { Readable } from 'stream';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';

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

async function transcribe(wavBase64: string, cfg: AiCfg): Promise<string> {
  const buffer = Buffer.from(wavBase64, 'base64');

  if (cfg.providerName === 'google') {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: cfg.apiKey });
    const res = await ai.models.generateContent({
      model: cfg.modelName || 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Transcribe esta llamada palabra por palabra. Marca cada turno con "Operador:" o "Cliente:" según el canal estéreo (izquierda=operador, derecha=cliente).' },
            { inlineData: { mimeType: 'audio/wav', data: wavBase64 } },
          ],
        },
      ],
    });
    return (res.text ?? '').trim();
  }

  // OpenAI: intenta el modelo de mayor calidad y cae a whisper-1 si falla.
  // Cada intento recrea el stream (se consume al subirlo).
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: cfg.apiKey });
  for (const model of ['gpt-4o-transcribe', 'whisper-1']) {
    try {
      const stream = Readable.from(buffer);
      (stream as any).path = 'call.wav';
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
export async function processCallRecordingAction(input: {
  chatMessageId: string;
  astraSid: string;
  astraCallId: string;
}): Promise<{ success: boolean; message?: string }> {
  const me = await currentUser();
  const userId = me?.effectiveId ?? me?.ownerId ?? me?.id;
  if (!userId) return { success: false, message: 'No autorizado.' };
  if (!BASE || !KEY) return { success: false, message: 'Llamadas no configuradas.' };

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

  const wav = await fetchRecordingBase64(input.astraSid, input.astraCallId);
  if (!wav) return { success: false, message: 'Grabación no disponible aún.' };

  const cfg = await getUserAiConfig(userId);
  if (!cfg) return { success: false, message: 'Sin configuración de IA activa.' };

  const transcript = await transcribe(wav, cfg);
  const summary = transcript ? await summarize(transcript, cfg) : '';

  const nextRaw = {
    ...rawObj,
    call: {
      ...callObj,
      hasRecording: true,
      astraSid: input.astraSid,
      astraCallId: input.astraCallId,
      transcript: transcript || null,
      summary: summary || null,
    },
  };

  await db.chatMessage.update({ where: { id }, data: { raw: nextRaw as Prisma.InputJsonValue } });
  return { success: true };
}
