import "server-only";

// M2 del item "grabación + transcripción + resumen".
// Tras una llamada, descarga el WAV grabado por AstraCalls, lo transcribe y lo
// resume con la IA del usuario, y guarda el resultado en chat_messages.raw.call.
// Reutiliza la config de IA del usuario (igual que el lead scoring).

/**
 * ## Por que esto vive aqui y no en `actions/calls-recording-actions.ts`
 *
 * Porque **una accion es un endpoint**. Aquel fichero tiene pantalla detras
 * —`CallDialog` pide procesar la grabacion al colgar—, asi que sigue siendo
 * `'use server'`; pero mientras `processCallRecordingForUser` estuviera
 * exportada desde alli, aceptaba el `userId` que le mandaran: con el de otra
 * cuenta y un `chatMessageId` suyo se le **gastaban sus creditos de IA**
 * transcribiendo y resumiendo una llamada ajena, y se le escribia el resultado
 * en su propia fila.
 *
 * Ponerle la guarda de siempre no valia: su otro llamador es
 * `/api/calls/process-bot-recording`, que lo pide el BACKEND cuando detecta que
 * la grabacion del bot esta lista, y **ahi no hay sesion** —`currentUser()`
 * devuelve vacio—. Eso es lo que dejo los avisos de Waha callados durante dias
 * sin un solo error en los registros.
 *
 * Asi que el reparto es el de siempre: aqui la funcion que recibe la cuenta
 * **ya resuelta**, y en el fichero de acciones el envoltorio que la resuelve
 * con `currentUser()`. Quien pone el id es quien ya comprobo quien llama.
 */


import { Prisma } from '@prisma/client';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { minioClient } from '@/lib/minio';
import { laFamiliaDeLaCuenta } from '@/lib/familia-de-cuentas';
import { laCuentaQuePagaLaTranscripcion } from '@/lib/nota-de-voz-del-equipo';
import { descontarLaTranscripcion, losCreditosQueQuedan } from '@/lib/creditos-de-transcripcion';
import { porQueNoSeTranscribio, queHacerConLaGrabacion } from '@/lib/transcripcion-de-la-llamada';
import { PISTA_DE_VOCABULARIO, conElNombreDeLaMarca } from '@/lib/nombres-de-la-marca';

const BASE = (process.env.ASTRACALLS_URL || '').replace(/\/+$/, '');
const KEY = process.env.ASTRACALLS_API_KEY || '';

/**
 * Cuanto se espera a que una grabacion este lista, y cuantas veces.
 *
 * Treinta segundos por vuelta y sesenta vueltas: **media hora** contada desde
 * que la llamada se lanza. No es generosidad — la grabacion no existe hasta
 * que alguien cuelga, asi que la ventana tiene que cubrir la conversacion
 * entera. Con los 200 s de antes, una llamada de cinco minutos se quedaba sin
 * texto por haber durado lo normal.
 */
// Exportadas para que el banco las LEA en vez de escribirlas a mano: copiado,
// probaria que su numero coincide con el del banco y no con el que corre.
export const ESPERA_ENTRE_INTENTOS_MS = 30_000;
export const INTENTOS_DE_GRABACION = 60;

interface AiCfg {
  apiKey: string;
  providerName: string;
  modelName: string;
}

/**
 * La clave con la que se transcribe y se resume.
 *
 * **Se elige igual que la elige `laClaveDeOpenAi`** —su proveedor por defecto
 * activo, luego cualquiera activo, luego la primera—, que es el mismo criterio
 * con el que `pagaElClienteSuIa` decide quién paga. Antes esto se rendía en su
 * primera línea cuando la cuenta no tenía `defaultProviderId` puesto, y eso no
 * se veía como un fallo: la llamada se quedaba sin Resumen IA y el único
 * rastro era un `success: false` que nadie leía.
 *
 * Decidir el cobro sobre una clave y transcribir con otra sería cobrarle a
 * quien no gasta, así que las dos preguntas miran la misma lista.
 */
async function getUserAiConfig(userId: string): Promise<AiCfg | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      defaultProviderId: true,
      defaultAiModelId: true,
      aiConfigs: { select: { providerId: true, apiKey: true, isActive: true } },
    },
  });
  if (!user) return null;

  const elegida =
    (user.defaultProviderId
      ? user.aiConfigs.find((c) => c.providerId === user.defaultProviderId && c.isActive) ??
        user.aiConfigs.find((c) => c.providerId === user.defaultProviderId)
      : undefined) ??
    user.aiConfigs.find((c) => c.isActive) ??
    user.aiConfigs[0];

  const apiKey = elegida?.apiKey?.trim();
  if (!apiKey || !elegida) return null;

  const [provider, model] = await Promise.all([
    db.aiProvider.findUnique({ where: { id: elegida.providerId }, select: { name: true } }),
    user.defaultAiModelId
      ? db.aiModel.findUnique({ where: { id: user.defaultAiModelId }, select: { name: true } })
      : null,
  ]);
  if (!provider?.name) return null;

  // El modelo por defecto de la cuenta solo vale si es del MISMO proveedor que
  // la clave elegida: con la clave de OpenAI y un modelo de Gemini escrito al
  // lado, la transcripcion se pediria con un nombre de modelo que esa API no
  // conoce y volveria vacia sin decir por que.
  const modeloDeLaCuenta =
    elegida.providerId === user.defaultProviderId ? model?.name ?? null : null;

  return {
    apiKey,
    providerName: provider.name,
    modelName: modeloDeLaCuenta ?? (provider.name === 'google' ? 'gemini-2.0-flash' : 'gpt-4o-mini'),
  };
}

/**
 * Quien PAGA la transcripcion de una llamada.
 *
 * **La cuenta, nunca la persona**, y dentro de una familia la **madre** — que
 * es exactamente la misma regla, y la misma funcion, con la que se cobran las
 * notas de voz de Chats y las del chat del equipo. `ia_credits` tiene una fila
 * por cuenta: cobrarle a una persona seria cobrarle a una fila que no existe,
 * y entonces `losCreditosQueQuedan` devolveria 0 y no se transcribiria nada.
 *
 * Un fallo al resolver la familia **no deja la llamada sin texto**: se sigue
 * con la cuenta suelta, que es el lado seguro, y se dice.
 */
async function laCuentaQuePagaLaLlamada(cuentaId: string): Promise<string> {
  try {
    const familia = await laFamiliaDeLaCuenta(cuentaId);
    return laCuentaQuePagaLaTranscripcion({ cuentaId, raizDeLaFamilia: familia.raiz });
  } catch (error) {
    console.warn('[llamadas] no se pudo resolver la familia para cobrar la transcripcion', {
      cuentaId,
      error: error instanceof Error ? error.message : String(error),
    });
    return cuentaId;
  }
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
            {
              text:
                'Transcribe esta llamada palabra por palabra. Marca cada turno con "Operador:" o "Cliente:" según quién habla. ' +
                `Nombres propios que aparecen y se escriben así: ${PISTA_DE_VOCABULARIO}`,
            },
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
      // El vocabulario de la marca, para que acierte de entrada: «Verzay» y
      // «Verzy» no están en el vocabulario de Whisper y «Versailles» y «Bersi»
      // sí, así que sin esta pista el nombre propio de la casa sale mal.
      // Arreglarlo aquí es la mitad barata; la de abajo, al guardar, es la red.
      const tr = await openai.audio.transcriptions.create({
        file: stream as any,
        model,
        prompt: PISTA_DE_VOCABULARIO,
      });
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
  } catch (error) {
    // Nunca mudo: sin esto, una llamada queda con su Transcripcion y sin
    // Resumen IA y no hay forma de saber si fallo el modelo, la clave o la
    // red. La transcripcion se guarda igual — media entrega es mejor que
    // ninguna cuando la mitad que sale ya esta pagada.
    console.warn('[llamadas] el resumen no salio', {
      proveedor: cfg.providerName,
      modelo: cfg.modelName,
      error: error instanceof Error ? error.message : String(error),
    });
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
  if (!wavBase64) {
    console.info('[llamadas] la grabacion todavia no esta lista', {
      chatMessageId: input.chatMessageId,
      astraCallId: input.astraCallId,
    });
    return { success: false, message: 'Grabación no disponible aún.' };
  }

  const audio = Buffer.from(wavBase64, 'base64');

  // La duración solo se recalcula si aún no hay una (p.ej. la llamada del
  // asesor ya la trae medida en vivo desde el navegador; la del bot llega en 0
  // porque nadie la midió, así que aquí se completa con la del audio).
  const duracion = Number(callObj.durationSecs ?? 0) || duracionDelWav(audio);

  // Quien paga: la CUENTA de la llamada, y la madre dentro de una familia.
  const paga = await laCuentaQuePagaLaLlamada(input.userId);
  const que = queHacerConLaGrabacion({
    segundos: duracion,
    bytes: audio.length,
    creditosDisponibles: await losCreditosQueQuedan(paga),
  });
  if (que.hacer !== 'transcribir') {
    const motivo = porQueNoSeTranscribio(que) ?? 'No se pudo transcribir.';
    console.warn('[llamadas] no se transcribe la grabacion', {
      chatMessageId: input.chatMessageId,
      cuentaQuePaga: paga,
      motivo,
    });
    return { success: false, message: motivo };
  }

  const cfg = await getUserAiConfig(input.userId);
  if (!cfg) {
    console.warn('[llamadas] la cuenta no tiene ninguna clave de IA activa', {
      chatMessageId: input.chatMessageId,
      userId: input.userId,
    });
    return { success: false, message: 'Sin configuración de IA activa.' };
  }

  // El nombre de la marca se corrige al GUARDAR, no en la voz: ver
  // `lib/nombres-de-la-marca.ts`.
  const transcript = conElNombreDeLaMarca(await transcribe(wavBase64, cfg));
  if (!transcript) {
    console.warn('[llamadas] la transcripcion volvio vacia', {
      chatMessageId: input.chatMessageId,
      proveedor: cfg.providerName,
      bytes: audio.length,
      segundos: duracion,
    });
  }
  // Y también en el resumen: sale de la transcripción ya corregida, pero el
  // modelo puede volver a escribirlo a su manera.
  const summary = transcript ? conElNombreDeLaMarca(await summarize(transcript, cfg)) : '';

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

  await guardarYCobrar({
    id,
    nextRaw,
    cuentaQuePaga: paga,
    tokens: transcript ? que.costo.tokens : 0,
  });
  return { success: true };
}

/**
 * Escribe el resultado y **cobra solo si de verdad lo escribió esta vuelta**.
 *
 * El `UPDATE` va condicionado a que la fila siga sin transcripción, igual que
 * el de las notas de voz: dos vueltas a la vez —el reintento del navegador y
 * el sondeo del servidor pueden coincidir— escriben una sola vez, y **solo esa
 * descuenta**. Con un `update` por id a secas las dos escribirían y las dos
 * cobrarían, y eso no se ve: se nota en la factura.
 *
 * Y se cobra **después** de tener el texto, nunca antes: cobrar y que la
 * llamada a OpenAI falle sería cobrar por algo que no se entregó. Por eso una
 * transcripción vacía llega aquí con `tokens: 0`.
 */
async function guardarYCobrar(input: {
  id: bigint;
  nextRaw: Record<string, unknown>;
  cuentaQuePaga: string;
  tokens: number;
}): Promise<void> {
  const filas = await db.$executeRaw`
    UPDATE "chat_messages"
       SET "raw" = ${input.nextRaw as Prisma.InputJsonValue}
     WHERE "id" = ${input.id}
       AND ("raw" -> 'call' ->> 'transcript') IS NULL
  `;
  if (filas < 1) {
    console.info('[llamadas] otra vuelta ya habia guardado la transcripcion; no se cobra', {
      chatMessageId: String(input.id),
    });
    return;
  }
  if (input.tokens > 0) await descontarLaTranscripcion(input.cuentaQuePaga, input.tokens);
}

/**
 * Espera a que la grabación esté lista y la procesa. **Uno solo, para los dos
 * caminos del bot**: el botón «Llamar con IA» del CRM y la automatización del
 * flujo (`AI_CALL`), que llega por `/api/calls/process-bot-recording`.
 *
 * Antes cada uno tenía lo suyo, y eso se pagó entero: el manual **no esperaba
 * nada** —ni siquiera guardaba el `astraCallId`, así que la grabación no se
 * podía ni pedir— y el del flujo esperaba 10 vueltas de 20 s, o sea **200
 * segundos contados desde que la llamada se LANZA**. Una llamada de cinco
 * minutos agotaba las diez vueltas estando todavía en curso, y la grabación
 * quedaba lista justo después de que nadie la mirara.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **La ventana se cuenta desde que se lanza la llamada, así que tiene que
 *    cubrir la llamada ENTERA más lo que Astra tarde en cerrar el WAV.** La
 *    grabación no existe hasta que se cuelga: rendirse antes es rendirse
 *    mientras la gente sigue hablando.
 * 2. **`ya procesada` es un final, no un reintento.** El proceso es idempotente
 *    y contesta `success` sin escribir; seguir sondeando después sería tener el
 *    bucle vivo media hora para no hacer nada.
 * 3. **Rendirse NO es mudo.** Un `void` que se apaga en silencio es justo lo
 *    que hizo que esto se leyera como «la llamada no deja resumen» durante
 *    semanas, sin un solo error donde mirar.
 */
export async function esperarYProcesarLaGrabacion(input: {
  userId: string;
  chatMessageId: string;
  astraSid: string;
  astraCallId: string;
}): Promise<void> {
  if (!BASE || !KEY) return;

  for (let intento = 1; intento <= INTENTOS_DE_GRABACION; intento++) {
    await new Promise((resolve) => setTimeout(resolve, ESPERA_ENTRE_INTENTOS_MS));
    try {
      const res = await processCallRecordingForUser(input);
      if (res.success) {
        console.info('[llamadas] grabacion procesada', {
          chatMessageId: input.chatMessageId,
          intento,
        });
        return;
      }
      // Lo que no es «todavía no está» es firme —sin créditos, demasiado
      // grande, sin clave de IA— y no mejora sondeando: se para aquí, que ya
      // lo dijo `processCallRecordingForUser`.
      if (res.message !== 'Grabación no disponible aún.') return;
    } catch (error) {
      console.warn('[llamadas] fallo una vuelta esperando la grabacion', {
        chatMessageId: input.chatMessageId,
        intento,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.warn('[llamadas] la grabacion nunca quedo lista', {
    chatMessageId: input.chatMessageId,
    astraCallId: input.astraCallId,
    intentos: INTENTOS_DE_GRABACION,
    ventanaMin: Math.round((INTENTOS_DE_GRABACION * ESPERA_ENTRE_INTENTOS_MS) / 60000),
  });
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
export async function processMetaCallRecordingForUser(input: {
  userId: string;
  chatMessageId: string;
  audioBase64: string;
  mimeType?: string;
}): Promise<{ success: boolean; message?: string }> {
  const { userId } = input;
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

  // 2) Transcribir + resumir con la IA del usuario (mismo pipeline que Astra),
  //    y **cobrarlo igual**. Es el mismo Whisper sobre el mismo audio: dejar
  //    gratis una de las dos mitades es la familia de «a una hermana se le
  //    pasa», y no se ve — se nota en la factura de quien paga la clave.
  const paga = await laCuentaQuePagaLaLlamada(userId);
  const que = queHacerConLaGrabacion({
    segundos: Number(callObj.durationSecs ?? 0),
    bytes: buffer.length,
    creditosDisponibles: await losCreditosQueQuedan(paga),
  });

  const cfg = que.hacer === 'transcribir' ? await getUserAiConfig(userId) : null;
  if (que.hacer !== 'transcribir') {
    console.warn('[llamadas] no se transcribe la grabacion de Meta', {
      chatMessageId: input.chatMessageId,
      cuentaQuePaga: paga,
      motivo: porQueNoSeTranscribio(que),
    });
  }

  let transcript = '';
  let summary = '';
  if (cfg) {
    transcript = conElNombreDeLaMarca(
      await transcribe(input.audioBase64, cfg, {
        filename: `call.${ext}`,
        mimeType,
      }),
    );
    summary = transcript ? conElNombreDeLaMarca(await summarize(transcript, cfg)) : '';
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

  await guardarYCobrar({
    id,
    nextRaw,
    cuentaQuePaga: paga,
    tokens: transcript && que.hacer === 'transcribir' ? que.costo.tokens : 0,
  });
  return { success: true };
}
