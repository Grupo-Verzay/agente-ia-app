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
import { descontarLaTranscripcion, losCreditosQueQuedan } from '@/lib/creditos-de-transcripcion';
import {
  TOPE_DE_BYTES_DE_AUDIO,
  porQueNoSeTranscribio,
  queHacerConLaGrabacion,
} from '@/lib/transcripcion-de-la-llamada';
import { segundosDelWav, trozosDeWav } from '@/lib/wav-en-trozos';
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
 * Quien PAGA la transcripcion de una llamada: **la cuenta bajo la que quedo la
 * fila**, que es la DUENA de la conversacion desde la que se llamo.
 *
 * **La cuenta, nunca la persona**: `ia_credits` tiene una fila por cuenta, y
 * cobrarle a una persona seria cobrarle a una fila que no existe.
 *
 * Y **no sube a la madre de la familia**, a proposito y distinto de las notas
 * del chat de equipo: una llamada con IA la lanza, la configura y la gasta la
 * cuenta de la linea de la conversacion (Ventas por Ventas, Atencion por
 * Atencion). Cobrarsela a la madre es exactamente el fallo de «la llamada queda
 * en la cuenta de quien mira», movido de la fila a la bolsa de creditos.
 */
async function laCuentaQuePagaLaLlamada(cuentaId: string): Promise<string> {
  return cuentaId;
}

/**
 * Se baja el WAV. **Devuelve el Buffer, no su base64.**
 *
 * Lo devolvía en base64 y quien llamaba lo volvía a convertir, así que de una
 * llamada de media hora —que son ~115 MB de WAV— había tres copias vivas a la
 * vez: el buffer, su base64 (un tercio más) y el buffer de vuelta. Aquí eso no
 * es una micro-optimización: es lo que decide si el proceso aguanta la llamada
 * larga, que es justamente la que esto vino a arreglar.
 */
async function bajarLaGrabacion(sid: string, callId: string): Promise<Buffer | null> {
  if (!BASE || !KEY) return null;
  try {
    const r = await fetch(`${BASE}/api/sessions/${sid}/calls/${callId}/recording`, {
      headers: { 'X-API-Key': KEY },
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 64) return null; // WAV vacío
    return buf;
  } catch {
    return null;
  }
}

/**
 * Le pide el texto a la IA de la cuenta. **Por trozos si hace falta.**
 *
 * El WAV de una llamada pesa 64 kB por segundo, así que a partir de 6 minutos
 * y 49 segundos ya no cabe en una transcripción de OpenAI. Antes eso era el
 * final del camino: la llamada se quedaba sin texto, sin resumen y —peor— sin
 * duración, que es justo lo que una llamada con IA de varios minutos produce
 * siempre. Ahora el audio se corta (`trozosDeWav`, puro) y los textos se pegan
 * en orden.
 *
 * **Un trozo que falla no se lleva a los demás.** Media transcripción es peor
 * que ninguna solo cuando no se sabe que está a medias: por eso se dice en el
 * registro, con cuál falló y cuántos había.
 */
async function transcribe(
  audio: Buffer,
  cfg: AiCfg,
  opts: { filename?: string; mimeType?: string } = {},
): Promise<string> {
  // `trozosDeWav` devuelve el audio TAL CUAL cuando ya cabe o cuando no es un
  // WAV que sepa leer (una grabación de Meta es webm y no se corta por bytes).
  const trozos = trozosDeWav(audio, TOPE_DE_BYTES_DE_AUDIO);
  if (trozos.length > 1) {
    console.info('[llamadas] la grabacion va por trozos', {
      bytes: audio.length,
      trozos: trozos.length,
    });
  }

  const textos: string[] = [];
  for (let i = 0; i < trozos.length; i++) {
    const texto = await transcribirUnTrozo(trozos[i], cfg, opts);
    if (texto) {
      textos.push(texto);
      continue;
    }
    console.warn('[llamadas] un trozo de la grabacion volvio sin texto', {
      trozo: i + 1,
      de: trozos.length,
      bytes: trozos[i].length,
      proveedor: cfg.providerName,
    });
  }
  return textos.join('\n').trim();
}

async function transcribirUnTrozo(
  audio: Buffer,
  cfg: AiCfg,
  opts: { filename?: string; mimeType?: string } = {},
): Promise<string> {
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
            { inlineData: { mimeType, data: audio.toString('base64') } },
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
      const stream = Readable.from(audio);
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
    } catch (error) {
      console.warn('[llamadas] un modelo no pudo transcribir', {
        model,
        bytes: audio.length,
        error: error instanceof Error ? error.message : String(error),
      });
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

  const audio = await bajarLaGrabacion(input.astraSid, input.astraCallId);
  if (!audio) {
    console.info('[llamadas] la grabacion todavia no esta lista', {
      chatMessageId: input.chatMessageId,
      astraCallId: input.astraCallId,
    });
    return { success: false, message: 'Grabación no disponible aún.' };
  }

  // La duración solo se recalcula si aún no hay una (p.ej. la llamada del
  // asesor ya la trae medida en vivo desde el navegador; la del bot llega en 0
  // porque nadie la midió, así que aquí se completa con la del audio).
  const duracion = Number(callObj.durationSecs ?? 0) || segundosDelWav(audio);

  // La duracion se escribe YA, antes de decidir si se transcribe.
  //
  // Es el fallo que se reporto como «la columna Duracion queda en guion»: el
  // WAV ya estaba descargado y la duracion ya estaba calculada, pero el UNICO
  // `UPDATE` de esta funcion estaba al final, en el camino de transcribir. Asi
  // que cualquier abandono —sin creditos, sin clave de IA, demasiado grande,
  // una transcripcion vacia— se llevaba por delante un dato que ya se tenia en
  // la mano y que no cuesta nada. Y el mas comun de esos abandonos era
  // justamente el de una llamada con IA de varios minutos.
  //
  // **Lo que se sabe se guarda cuando se sabe.** Lo que depende de la IA
  // —transcripcion y resumen— sigue mas abajo y puede no llegar; la duracion no
  // depende de nadie.
  await anotarQueHayGrabacion({
    id,
    durationSecs: duracion,
    astraSid: input.astraSid,
    astraCallId: input.astraCallId,
  });

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
  const transcript = conElNombreDeLaMarca(await transcribe(audio, cfg));
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
 * Deja escrito lo que ya se sabe de la llamada **sin esperar a la IA**.
 *
 * La duracion, que hay grabacion y el par de ids con el que se le puede volver
 * a pedir el audio a AstraCalls. Nada de esto depende de que haya creditos, de
 * que el audio quepa en una transcripcion ni de que OpenAI conteste, asi que
 * ponerlo detras de esas tres cosas era lo que dejaba la fila **igual que
 * nacio** en el caso mas comun.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Es un MERGE de JSONB, nunca una escritura del objeto entero.** Esta fila
 *    la tocan tres sitios —la App, el webhook del backend y el chat-store— y
 *    escribir `raw` completo se llevaria por delante lo que hubiera dentro. Es
 *    la misma decision, y la misma forma, que `guardarLaTranscripcion`.
 * 2. **NO pisa una duracion que ya valga algo.** La llamada en vivo del asesor
 *    la mide en el navegador y es mas exacta que la del WAV; el `GREATEST` se
 *    queda con la mayor, que ademas es la unica que puede crecer al reprocesar.
 *    Un `0` que llegue de fuera no borra lo que ya estaba.
 * 3. **No lanza.** Esto se llama desde caminos que continuan despues: un fallo
 *    aqui no puede dejar la llamada sin transcribir. Pero **no es mudo**, que
 *    es justo lo que convirtio este hueco en «no queda ni duracion».
 */
async function anotarQueHayGrabacion(input: {
  id: bigint;
  durationSecs: number;
  hasRecording?: boolean;
  astraSid?: string;
  astraCallId?: string;
}): Promise<void> {
  const segundos = Number.isFinite(input.durationSecs) ? Math.max(0, Math.round(input.durationSecs)) : 0;
  const campos: Record<string, unknown> = { hasRecording: input.hasRecording !== false };
  if (input.astraSid) campos.astraSid = input.astraSid;
  if (input.astraCallId) campos.astraCallId = input.astraCallId;

  try {
    await db.$executeRaw`
      UPDATE "chat_messages"
         SET "raw" = COALESCE("raw", '{}'::jsonb)
                  || jsonb_build_object(
                       'call',
                       COALESCE("raw" -> 'call', '{}'::jsonb)
                       || ${JSON.stringify(campos)}::jsonb
                       || jsonb_build_object(
                            'durationSecs',
                            GREATEST(
                              COALESCE(("raw" -> 'call' ->> 'durationSecs')::numeric, 0),
                              ${segundos}::numeric
                            )
                          )
                     ),
             "updatedAt" = NOW()
       WHERE "id" = ${input.id}
    `;
  } catch (error) {
    console.warn('[llamadas] no se pudo anotar la duracion de la llamada', {
      chatMessageId: String(input.id),
      segundos,
      error: error instanceof Error ? error.message : String(error),
    });
  }
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

/**
 * Cuantos dias atras se busca una llamada por su par de ids de AstraCalls.
 *
 * El aviso de fin llega segundos despues de colgar, asi que **dos dias sobran**
 * incluso con un reintento del dia siguiente. Y el numero no es cosmetico: es
 * lo que deja entrar por el BRIN de `messageTimestamp` en vez de recorrer
 * `chat_messages` entera, que es la tabla mas grande de la plataforma.
 */
const DIAS_PARA_BUSCAR_LA_LLAMADA = 2;

/**
 * La fila de una llamada a partir de lo UNICO que sabe el servidor de llamadas:
 * su sesion y su id de llamada.
 *
 * El aviso de fin no trae cuenta, ni linea, ni `messageId` —AstraCalls no los
 * conoce—, asi que esta es la unica forma de volver a la fila. El par se
 * escribe al registrar la llamada y **tambien** cada vez que se procesa la
 * grabacion (`anotarQueHayGrabacion`), o sea que no se pierde.
 *
 * Dos cosas de la consulta:
 *
 * 1. **Acotada por fecha**, para entrar por el BRIN. Sin esa condicion los
 *    cinco indices de `chat_messages` empiezan por `userId` y aqui no hay
 *    ninguno que dar, asi que se barreria la tabla entera — el caso exacto que
 *    describe la regla del BRIN.
 * 2. **El parametro de dias va MOLDEADO** (`make_interval(days => $1::int)`):
 *    Prisma lo manda sin tipo y `make_interval` solo acepta `int`; sin el molde
 *    la consulta cae con «no existe la funcion».
 */
async function laLlamadaDeEseId(
  astraSid: string,
  astraCallId: string,
): Promise<{ id: bigint; userId: string } | null> {
  const filas = await db.$queryRaw<{ id: bigint; userId: string }[]>`
    SELECT "id", "userId"
      FROM "chat_messages"
     WHERE "messageType" = 'call'
       AND "messageTimestamp" > NOW() - make_interval(days => ${DIAS_PARA_BUSCAR_LA_LLAMADA}::int)
       AND "raw" -> 'call' ->> 'astraCallId' = ${astraCallId}
       AND "raw" -> 'call' ->> 'astraSid' = ${astraSid}
     ORDER BY "messageTimestamp" DESC
     LIMIT 1
  `;
  return filas[0] ?? null;
}

/**
 * La llamada termino: lo dice el servidor de llamadas, no un reloj nuestro.
 *
 * **Esta es la mitad que no existia.** Hasta ahora la plataforma no se enteraba
 * nunca de que una llamada habia colgado: lanzaba y se ponia a sondear a
 * ciegas, y ese sondeo es una promesa suelta dentro de una peticion — un
 * despliegue (y aqui hay decenas al dia) se la lleva y no queda ni rastro. De
 * ahi el sintoma reportado: la llamada sale, se habla varios minutos, y la fila
 * se queda **igual que nacio**, sin duracion siquiera.
 *
 * El aviso entra por el unico canal que AstraCalls ya tiene configurado hacia
 * la plataforma —el del voicebot— y el backend lo relaya aqui.
 *
 * El orden de las dos cosas que hace **no es intercambiable**:
 *
 * 1. **Primero se escribe la duracion**, con `await`. Es lo unico que el aviso
 *    trae y que no depende de nada mas; dejarlo para despues de la grabacion
 *    seria volver al fallo por otra puerta.
 * 2. **Y solo despues se va a por el audio**, de fondo. Que la transcripcion no
 *    llegue —sin creditos, sin clave, un audio imposible— ya no puede borrar el
 *    dato de arriba.
 *
 * Y que haya dos esperas corriendo sobre la misma llamada —la que arranco al
 * lanzarla y esta— no cobra dos veces: `guardarYCobrar` escribe con
 * `WHERE transcript IS NULL`, asi que la segunda toca cero filas, lo dice y se
 * para. Ese candado existe justo para esto.
 */
export async function procesarElFinDeLaLlamada(input: {
  astraSid: string;
  astraCallId: string;
  durationSecs?: number;
  hasRecording?: boolean;
}): Promise<{ success: boolean; message?: string }> {
  const fila = await laLlamadaDeEseId(input.astraSid, input.astraCallId);
  if (!fila) {
    // Nunca mudo: pasa cuando la llamada se registro bajo otra cuenta, cuando
    // el registro no llego a guardar su par de ids, o cuando el aviso llega de
    // una llamada que no lanzamos nosotros. Las tres se leen desde fuera como
    // «la llamada no deja nada».
    console.warn('[llamadas] llego el fin de una llamada que no esta en la base', {
      astraSid: input.astraSid,
      astraCallId: input.astraCallId,
    });
    return { success: false, message: 'Llamada no encontrada.' };
  }

  const segundos = Number.isFinite(input.durationSecs) ? Number(input.durationSecs) : 0;
  await anotarQueHayGrabacion({
    id: fila.id,
    durationSecs: segundos,
    hasRecording: input.hasRecording !== false,
    astraSid: input.astraSid,
    astraCallId: input.astraCallId,
  });
  console.info('[llamadas] fin de llamada anotado', {
    chatMessageId: String(fila.id),
    segundos,
    hayGrabacion: input.hasRecording !== false,
  });

  if (input.hasRecording === false) {
    // Sin audio no hay nada que transcribir, y sondear media hora una grabacion
    // que AstraCalls ya dijo que no existe es tener el bucle vivo para nada.
    return { success: true, message: 'Sin grabación.' };
  }

  const trabajo = {
    userId: fila.userId,
    chatMessageId: String(fila.id),
    astraSid: input.astraSid,
    astraCallId: input.astraCallId,
  };

  // La grabacion suele estar lista en el momento —acaban de colgar—, asi que se
  // intenta UNA vez sin esperar: el bucle compartido duerme 30 s antes de su
  // primer intento, que ahi es correcto (se lanza al empezar la llamada) y aqui
  // seria media vuelta de retraso sobre algo que ya esta.
  void (async () => {
    try {
      const res = await processCallRecordingForUser(trabajo);
      if (res.success) {
        console.info('[llamadas] grabacion procesada al colgar', {
          chatMessageId: trabajo.chatMessageId,
        });
        return;
      }
      if (res.message !== 'Grabación no disponible aún.') return;
    } catch (error) {
      console.warn('[llamadas] fallo el primer intento al colgar', {
        chatMessageId: trabajo.chatMessageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await esperarYProcesarLaGrabacion(trabajo);
  })();

  return { success: true };
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
      await transcribe(buffer, cfg, {
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
