import { db } from '@/lib/db';

/**
 * Cliente de WAHA (WhatsApp HTTP API) — SOLO servidor.
 *
 * No importar desde un componente de cliente. Se usa unicamente desde los
 * route handlers de /app/api/waha/* y desde acciones 'use server'.
 *
 * La API key no puede salir al navegador nunca: todo lo que necesite la tarjeta
 * de "WhatsApp Mensajeria" pasa por las rutas de /app/api/waha/*, que llaman aqui y
 * devuelven solo lo justo.
 */

export interface WahaConfig {
  baseUrl: string;
  apiKey: string;
}

/** Estados que devuelve WAHA en `SessionDTO.status`. */
export type WahaSessionStatus =
  | 'STOPPED'
  | 'STARTING'
  | 'SCAN_QR_CODE'
  | 'PASSKEY_REQUIRED'
  | 'PASSKEY_CONFIRMATION_REQUIRED'
  | 'WORKING'
  | 'FAILED';

export interface WahaSession {
  name: string;
  status: WahaSessionStatus;
  /** `null` mientras la sesion no esta conectada. */
  me?: { id?: string | null; pushName?: string | null } | null;
  config?: unknown;
}

/**
 * El servidor de WAHA sale de la BD (Panel > Conexion), NO del entorno. Es el
 * mismo trato que Evolution, cuya url y key viven en la tabla `ApiKey` desde
 * siempre: cambiar una credencial no puede costar un redespliegue.
 *
 * Devuelve `null` si no esta configurado. Sin configurar, la App tiene que
 * seguir funcionando igual que hoy, solo sin la tarjeta de WhatsApp Mensajeria.
 */
export async function getWahaConfig(): Promise<WahaConfig | null> {
  try {
    const config = await db.siteConfig.findFirst({
      select: { wahaUrl: true, wahaApiKey: true },
    });
    const baseUrl = config?.wahaUrl?.trim().replace(/\/+$/, '');
    const apiKey = config?.wahaApiKey?.trim();
    if (!baseUrl || !apiKey) return null;
    return { baseUrl, apiKey };
  } catch (error) {
    // Un fallo de BD aqui no puede ser mudo: desde fuera se veria como una
    // tarjeta que "no hace nada", que es mucho peor de diagnosticar.
    console.error('[waha] no se pudo leer la configuracion del servidor', error);
    return null;
  }
}

export async function isWahaConfigured(): Promise<boolean> {
  return (await getWahaConfig()) !== null;
}

/**
 * Plazo por defecto. NINGUNA llamada a WAHA puede ir sin uno: medido contra el
 * servidor, pedir el QR con la sesion en FAILED tarda 10,02 s en contestar 422.
 * Sin plazo eso deja la pantalla girando y el navegador esperando, que es
 * exactamente el fallo mudo del que habla el CLAUDE.md.
 */
const PLAZO_NORMAL_MS = 15000;
/** El QR tarda 0,06 s cuando la sesion esta lista y ~10 s cuando no lo esta. */
const PLAZO_DEL_QR_MS = 20000;

async function wahaFetch(
  cfg: WahaConfig,
  path: string,
  init: RequestInit = {},
  plazoMs: number = PLAZO_NORMAL_MS,
): Promise<Response> {
  return fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      'X-Api-Key': cfg.apiKey,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(plazoMs),
  });
}

/**
 * Los eventos que el backend atiende. `message` son los mensajes nuevos;
 * los otros tres son los acuses (el ✓✓), los borrados del cliente y la
 * presencia (escribiendo / grabando). Si se anade uno aqui, hay que atenderlo
 * en el backend (`WahaEventsService`), o llegara y se tirara.
 */
export const EVENTOS_DEL_WEBHOOK = ['message', 'message.ack', 'message.revoked', 'presence.update'] as const;

const sesionesRevisadas = new Map<string, number>();
const REVISAR_EVENTOS_CADA_MS = 10 * 60 * 1000;

/**
 * Pone al dia los eventos del webhook de una sesion ya creada.
 *
 * Las sesiones anteriores se crearon solo con `message`; sin esto seguirian
 * sin acuses ni presencia hasta que alguien las borrara y volviera a escanear.
 * Se mira una vez cada 10 minutos por sesion (lo llama la tarjeta al pedir el
 * estado) y solo se escribe si falta algo. Nunca lanza.
 */
export async function ensureWahaSessionEvents(session: string): Promise<void> {
  const ahora = Date.now();
  const ultima = sesionesRevisadas.get(session) ?? 0;
  if (ahora - ultima < REVISAR_EVENTOS_CADA_MS) return;
  sesionesRevisadas.set(session, ahora);

  const cfg = await getWahaConfig();
  if (!cfg) return;
  try {
    const actual = await getWahaSession(session);
    const config = (actual?.config ?? null) as { webhooks?: Array<Record<string, unknown>> } | null;
    const webhooks = Array.isArray(config?.webhooks) ? config!.webhooks : [];
    const primero = webhooks[0];
    if (!primero || typeof primero.url !== 'string') return;

    const eventos = Array.isArray(primero.events) ? (primero.events as string[]) : [];
    const faltan = EVENTOS_DEL_WEBHOOK.filter((e) => !eventos.includes(e));
    if (!faltan.length) return;

    const res = await wahaFetch(cfg, `/api/sessions/${encodeURIComponent(session)}`, {
      method: 'PUT',
      body: JSON.stringify({
        config: {
          ...config,
          webhooks: [{ ...primero, events: [...EVENTOS_DEL_WEBHOOK] }, ...webhooks.slice(1)],
        },
      }),
    });
    if (!res.ok) {
      console.warn('[waha] no se pudieron actualizar los eventos del webhook', {
        session,
        status: res.status,
        detalle: (await res.text()).slice(0, 200),
      });
      return;
    }
    console.warn('[waha] eventos del webhook actualizados', { session, faltaban: faltan });
  } catch (error) {
    console.warn('[waha] no se pudo revisar el webhook de la sesión', { session, error: String(error) });
  }
}

export type PresenciaWaha = {
  estado: 'escribiendo' | 'grabando' | 'en_linea' | 'desconectado' | 'nada';
  /** Segundos, si WhatsApp lo comparte (depende de la privacidad del contacto). */
  lastSeen: number | null;
};

function traducirPresencia(valor: unknown): PresenciaWaha['estado'] {
  const v = String(valor ?? '').toLowerCase();
  if (v === 'typing' || v === 'composing') return 'escribiendo';
  if (v === 'recording') return 'grabando';
  if (v === 'online') return 'en_linea';
  if (v === 'offline') return 'desconectado';
  return 'nada';
}

/**
 * La presencia ACTUAL de un chat, para pintar "en linea" o "ult. vez…" al
 * abrir la conversacion sin esperar al primer cambio. Segun el codigo de
 * WAHA, `GET /api/{session}/presence/{chatId}` ademas SUSCRIBE el chat si no
 * lo estaba, asi que esta llamada deja tambien el tiempo real encendido.
 * Nunca lanza: sin dato, la cabecera no ensena conexion.
 */
export async function getWahaPresence(session: string, chatId: string): Promise<PresenciaWaha | null> {
  if (!session || !chatId) return null;
  const cfg = await getWahaConfig();
  if (!cfg) return null;
  try {
    const res = await wahaFetch(
      cfg,
      `/api/${encodeURIComponent(session)}/presence/${encodeURIComponent(chatId)}`,
      {},
      5000,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { presences?: Array<{ lastKnownPresence?: unknown; lastSeen?: unknown }> } | null;
    const entrada = Array.isArray(j?.presences) ? j!.presences[0] : undefined;
    if (!entrada) return null;
    const lastSeen = Number(entrada.lastSeen);
    presenciasSuscritas.set(`${session}|${chatId}`, Date.now());
    return {
      estado: traducirPresencia(entrada.lastKnownPresence),
      lastSeen: Number.isFinite(lastSeen) && lastSeen > 0 ? lastSeen : null,
    };
  } catch {
    return null;
  }
}

const presenciasSuscritas = new Map<string, number>();
const RESUSCRIBIR_PRESENCIA_CADA_MS = 10 * 60 * 1000;

/**
 * Pide a WAHA que mande la presencia (escribiendo / grabando) de un chat.
 * WAHA solo la envia para los chats suscritos, asi que se hace al abrir la
 * conversacion; se recuerda 10 minutos para no repetirlo en cada vuelta del
 * sondeo. Nunca lanza: sin presencia la conversacion funciona igual.
 */
export async function subscribeWahaPresence(session: string, chatId: string): Promise<void> {
  if (!session || !chatId) return;
  const clave = `${session}|${chatId}`;
  const ahora = Date.now();
  if (ahora - (presenciasSuscritas.get(clave) ?? 0) < RESUSCRIBIR_PRESENCIA_CADA_MS) return;
  presenciasSuscritas.set(clave, ahora);

  const cfg = await getWahaConfig();
  if (!cfg) return;
  try {
    const res = await wahaFetch(
      cfg,
      `/api/${encodeURIComponent(session)}/presence/${encodeURIComponent(chatId)}/subscribe`,
      { method: 'POST', body: JSON.stringify({}) },
      5000,
    );
    if (!res.ok) {
      console.warn('[waha] no se pudo suscribir la presencia', { session, chatId, status: res.status });
    }
  } catch (error) {
    console.warn('[waha] no se pudo suscribir la presencia', { session, chatId, error: String(error) });
  }
}

/**
 * Crea la sesion y la arranca. El webhook se deja configurado aqui mismo,
 * apuntando a nuestro backend y llevando `secret` en la cabecera `X-Api-Key`:
 * el normalizador del backend lo compara contra `metaVerifyToken` de la
 * instancia, asi que ese mismo valor es el que se guarda en la base.
 */
export async function createWahaSession(params: {
  session: string;
  webhookUrl: string;
  secret: string;
}): Promise<{ ok: boolean; message?: string }> {
  const cfg = await getWahaConfig();
  if (!cfg) return { ok: false, message: 'El servidor de WhatsApp Mensajería no esta configurado (Panel > Conexion).' };

  try {
    const res = await wahaFetch(cfg, '/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        name: params.session,
        start: true,
        config: {
          webhooks: [
            {
              url: params.webhookUrl,
              events: [...EVENTOS_DEL_WEBHOOK],
              customHeaders: [{ name: 'X-Api-Key', value: params.secret }],
            },
          ],
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, message: `WAHA respondio ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'No se pudo contactar con WAHA.' };
  }
}

export async function getWahaSession(session: string): Promise<WahaSession | null> {
  const cfg = await getWahaConfig();
  if (!cfg) return null;
  try {
    const res = await wahaFetch(cfg, `/api/sessions/${encodeURIComponent(session)}`);
    if (!res.ok) return null;
    return (await res.json()) as WahaSession;
  } catch {
    return null;
  }
}

/** `start` | `stop` | `logout` | `restart` — los cuatro son POST sin cuerpo. */
export async function wahaSessionAction(
  session: string,
  action: 'start' | 'stop' | 'logout' | 'restart',
): Promise<{ ok: boolean; message?: string }> {
  const cfg = await getWahaConfig();
  if (!cfg) return { ok: false, message: 'El servidor de WhatsApp Mensajería no esta configurado (Panel > Conexion).' };
  try {
    const res = await wahaFetch(cfg, `/api/sessions/${encodeURIComponent(session)}/${action}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, message: `WAHA respondio ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'No se pudo contactar con WAHA.' };
  }
}

export async function deleteWahaSession(session: string): Promise<{ ok: boolean; message?: string }> {
  const cfg = await getWahaConfig();
  if (!cfg) return { ok: false, message: 'El servidor de WhatsApp Mensajería no esta configurado (Panel > Conexion).' };
  try {
    const res = await wahaFetch(cfg, `/api/sessions/${encodeURIComponent(session)}`, {
      method: 'DELETE',
    });
    // Una sesion que ya no existe no es un fallo: el objetivo es que no este.
    if (!res.ok && res.status !== 404) {
      const body = await res.text();
      return { ok: false, message: `WAHA respondio ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'No se pudo contactar con WAHA.' };
  }
}

export type ResultadoQr =
  | { estado: 'ok'; png: ArrayBuffer }
  /** La sesion no esta en SCAN_QR_CODE. WAHA contesta 422 diciendo cual espera. */
  | { estado: 'todavia-no'; motivo: string }
  | { estado: 'error'; motivo: string };

/**
 * El QR de una sesion. WAHA SOLO lo da en estado `SCAN_QR_CODE`; en cualquier
 * otro contesta 422. Por eso esto no devuelve `null` a secas: quien llama tiene
 * que poder distinguir "reinicia la sesion" de "el servidor no contesta", que
 * son dos arreglos distintos.
 */
export async function getWahaQrPng(session: string): Promise<ResultadoQr> {
  const cfg = await getWahaConfig();
  if (!cfg) return { estado: 'error', motivo: 'El servidor de WhatsApp Mensajería no esta configurado.' };

  try {
    const res = await wahaFetch(
      cfg,
      `/api/${encodeURIComponent(session)}/auth/qr?format=image`,
      { headers: { Accept: 'image/png' } },
      PLAZO_DEL_QR_MS,
    );

    if (res.ok) return { estado: 'ok', png: await res.arrayBuffer() };

    if (res.status === 422) {
      const cuerpo = await res.text();
      let estadoActual = '';
      try { estadoActual = JSON.parse(cuerpo)?.status ?? ''; } catch { /* cuerpo no JSON */ }
      return {
        estado: 'todavia-no',
        motivo: estadoActual
          ? `La sesion esta en ${estadoActual}; el QR solo existe mientras espera el escaneo.`
          : 'La sesion todavia no esta esperando el escaneo.',
      };
    }

    return { estado: 'error', motivo: `WAHA respondio ${res.status}.` };
  } catch (error: any) {
    const agotado = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return {
      estado: 'error',
      motivo: agotado ? 'El servidor de WhatsApp Mensajería tardo demasiado.' : 'No se pudo contactar con el servidor.',
    };
  }
}

/** El numero que sale de `me.id` viene como `573001234567@c.us` o con `:sufijo`. */
export function wahaMePhone(me?: WahaSession['me']): string | null {
  const id = me?.id;
  if (!id) return null;
  const digits = id.split('@')[0]?.split(':')[0] ?? '';
  return digits || null;
}

/* ─── Enviar ─────────────────────────────────────────────────────────────── */

export type WahaSendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; message: string; status?: number };

/** Un adjunto tarda mas que un texto: se le da el doble de plazo. */
const PLAZO_DE_ENVIO_MS = 15000;
const PLAZO_DE_ENVIO_DE_MEDIA_MS = 30000;

/**
 * El id del mensaje tal y como lo devuelve WAHA. Se guarda para que, si WAHA
 * nos reenvia ese mismo mensaje por webhook, `chat_messages` lo deduplique por
 * id en vez de pintarlo dos veces.
 *
 * WAHA lo ha devuelto de varias formas segun version y motor —`id` como texto
 * ya serializado (`true_573…@c.us_ABC`), `id._serialized`, o `key.id` suelto—,
 * asi que se miran todas. Si no aparece en ninguna, se anota QUE claves trajo
 * la respuesta: es como se aprende la forma real, no suponiendola.
 */
function idDelMensajeEnviado(cuerpo: unknown, chatId: string): string | null {
  const b = (cuerpo ?? {}) as Record<string, unknown>;
  if (typeof b.id === 'string' && b.id) return b.id;
  const idObj = b.id as Record<string, unknown> | undefined;
  if (idObj && typeof idObj._serialized === 'string') return idObj._serialized;
  if (idObj && typeof idObj.id === 'string') return `true_${chatId}_${idObj.id}`;
  const key = b.key as Record<string, unknown> | undefined;
  if (key && typeof key.id === 'string') return `true_${chatId}_${key.id}`;
  console.warn('[waha] la respuesta del envio no trae un id reconocible', {
    claves: Object.keys(b).slice(0, 20),
  });
  return null;
}

async function enviarAWaha(
  path: string,
  body: Record<string, unknown>,
  chatId: string,
  plazoMs: number,
): Promise<WahaSendResult> {
  const cfg = await getWahaConfig();
  if (!cfg) {
    return { ok: false, message: 'El servidor de WhatsApp Mensajería no está configurado (Panel > Conexión).' };
  }
  try {
    const res = await wahaFetch(cfg, path, { method: 'POST', body: JSON.stringify(body) }, plazoMs);
    const texto = await res.text();
    if (!res.ok) {
      // El motivo tiene que llegar al asesor: un "no se pudo enviar" a secas
      // obliga a adivinar. WAHA suele contestar con JSON {message}.
      let detalle = texto.slice(0, 300);
      try {
        const j = JSON.parse(texto) as { message?: unknown; error?: unknown };
        const m = j?.message ?? j?.error;
        if (m) detalle = Array.isArray(m) ? m.join('; ') : String(m);
      } catch {
        // se deja el texto tal cual
      }
      console.warn(`[waha] ${path} respondió ${res.status}`, { chatId, detalle: detalle.slice(0, 200) });
      return { ok: false, status: res.status, message: `WhatsApp Mensajería respondió ${res.status}: ${detalle}` };
    }
    let cuerpo: unknown = null;
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      cuerpo = null;
    }
    return { ok: true, messageId: idDelMensajeEnviado(cuerpo, chatId) };
  } catch (error) {
    const esPlazo = error instanceof Error && error.name === 'TimeoutError';
    console.warn(`[waha] ${path} no contestó`, { chatId, esPlazo, error: String(error) });
    return {
      ok: false,
      message: esPlazo
        ? 'WhatsApp Mensajería no contestó a tiempo. El mensaje puede haber salido igual; revisa la conversación antes de reenviarlo.'
        : 'No se pudo contactar con WhatsApp Mensajería.',
    };
  }
}

/** `POST /api/sendText`. `replyTo` es el id del mensaje citado, tal y como lo guardamos. */
/**
 * "Escribiendo…" un instante antes del texto, como hace Evolution con su
 * `delay`. Es un gesto: si WAHA no lo acepta, el mensaje sale igual y no se
 * avisa de nada.
 */
async function gestoDeEscribir(session: string, chatId: string): Promise<void> {
  const cfg = await getWahaConfig();
  if (!cfg) return;
  try {
    const empezo = await wahaFetch(cfg, '/api/startTyping', {
      method: 'POST',
      body: JSON.stringify({ session, chatId }),
    }, 5000);
    if (!empezo.ok) return;
    await new Promise((r) => setTimeout(r, 900));
    await wahaFetch(cfg, '/api/stopTyping', { method: 'POST', body: JSON.stringify({ session, chatId }) }, 5000);
  } catch {
    // es un gesto
  }
}

export async function sendWahaText(params: {
  session: string;
  chatId: string;
  text: string;
  replyTo?: string | null;
}): Promise<WahaSendResult> {
  await gestoDeEscribir(params.session, params.chatId);
  return enviarAWaha(
    '/api/sendText',
    {
      session: params.session,
      chatId: params.chatId,
      text: params.text,
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    },
    params.chatId,
    PLAZO_DE_ENVIO_MS,
  );
}

export type WahaMediaType = 'image' | 'video' | 'audio' | 'document';

/**
 * El adjunto tal y como lo espera WAHA: por URL o en base64. El compositor de
 * Chats manda `data:` URLs para lo que se adjunta y base64 pelado para el audio
 * grabado; una URL http se pasa tal cual y WAHA la descarga.
 */
function archivoParaWaha(mediaUrl: string, mimetype?: string | null, fileName?: string | null) {
  // Sin nombre, WhatsApp ensena el documento como "Untitled". Los nodos de
  // flujo no traen nombre: se toma el del archivo en la URL.
  const nombre = fileName?.trim() || nombreDesdeUrl(mediaUrl) || undefined;
  if (/^https?:\/\//i.test(mediaUrl)) {
    return { url: mediaUrl, ...(mimetype ? { mimetype } : {}), ...(nombre ? { filename: nombre } : {}) };
  }
  const dataUrl = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(mediaUrl);
  const data = dataUrl ? dataUrl[3] : mediaUrl;
  const mime = mimetype || (dataUrl?.[1] ?? 'application/octet-stream');
  return { data, mimetype: mime, ...(nombre ? { filename: nombre } : {}) };
}

function nombreDesdeUrl(mediaUrl: string): string {
  if (!/^https?:\/\//i.test(mediaUrl)) return '';
  try {
    const ultimo = new URL(mediaUrl).pathname.split('/').filter(Boolean).pop() ?? '';
    return decodeURIComponent(ultimo).slice(0, 120);
  } catch {
    return '';
  }
}

export async function sendWahaMedia(params: {
  session: string;
  chatId: string;
  mediatype: WahaMediaType;
  mediaUrl: string;
  mimetype?: string | null;
  fileName?: string | null;
  caption?: string | null;
  ptt?: boolean;
  replyTo?: string | null;
}): Promise<WahaSendResult> {
  const file = archivoParaWaha(params.mediaUrl, params.mimetype, params.fileName);
  const base = {
    session: params.session,
    chatId: params.chatId,
    file,
    ...(params.replyTo ? { reply_to: params.replyTo } : {}),
  };
  const conCaption = params.caption?.trim() ? { caption: params.caption.trim() } : {};

  let path: string;
  let body: Record<string, unknown>;
  if (params.mediatype === 'image') {
    path = '/api/sendImage';
    body = { ...base, ...conCaption };
  } else if (params.mediatype === 'video') {
    path = '/api/sendVideo';
    body = { ...base, ...conCaption };
  } else if (params.mediatype === 'audio') {
    // TODO audio va como nota de voz, con o sin la marca `ptt`, igual que
    // Evolution (`sendWhatsAppAudio`) y que el adaptador del backend. Un nodo
    // de audio de un flujo no lleva `ptt`, y por `sendFile` llegaba al
    // telefono como un documento "Untitled" en vez de reproducible. El
    // navegador graba en webm/ogg y WhatsApp quiere opus: `convert` le pide a
    // WAHA que lo transcodifique.
    path = '/api/sendVoice';
    body = { ...base, convert: true };
  } else {
    path = '/api/sendFile';
    body = { ...base, ...conCaption };
  }
  return enviarAWaha(path, body, params.chatId, PLAZO_DE_ENVIO_DE_MEDIA_MS);
}
