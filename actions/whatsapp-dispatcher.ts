'use server';

import {
  etiquetaDeMediaWaha,
  getWahaSession,
  sendWahaMedia,
  sendWahaText,
  snapshotDeSalienteWaha,
  type WahaMediaType,
} from '@/lib/waha';
import { canonicalToWahaJid } from '@/lib/waha-jid';
import { sendChannelTextAction } from '@/actions/channel-chat-actions';
import { sendingMessages } from '@/actions/sending-messages-actions';
import { sendMediaByUrl } from '@/actions/chat-actions';
import { persistChatMessage } from '@/lib/chat-persistence';
import { anotarElEnvio } from '@/lib/salud-del-envio-db';
import type { TipoDeEnvio } from '@/lib/salud-del-envio';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

type DispatcherInstance = {
  instanceId: string | null;
  instanceName: string | null;
  displayName?: string | null;
  instanceType: string | null;
  metaAccessToken?: string | null;
  metaPhoneNumberId?: string | null;
  metaChannel?: string | null;
};

const DEFAULT_SYSTEM_NOTIFICATION_INSTANCE =
  process.env.NOTIFICATIONS_WHATSAPP_INSTANCE ||
  process.env.BILLING_WHATSAPP_INSTANCE ||
  process.env.TRIAL_FOLLOWUP_WHATSAPP_INSTANCE ||
  'VERZAY_NOTIFICACIONES_wh';

export type WhatsAppDispatcherLine = {
  id: string;
  notificationNumber: string | null;
  instanceId: string;
  instanceName: string;
  instanceType: string | null;
  serverUrl: string | null;
  apiKey: string | null;
  provider: 'evolution' | 'meta' | 'waha';
};

function normalizeBaseUrl(url: string | null | undefined): string {
  const value = (url ?? '').trim().replace(/\/+$/, '');
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/** WhatsApp Mensajeria (Waha): no habla con Evolution. */
function isWaha(instanceType: string | null | undefined) {
  return instanceType?.trim().toLowerCase() === 'waha';
}

async function isWahaOpen(instanceName: string): Promise<boolean> {
  try {
    const session = await getWahaSession(instanceName);
    return session?.status === 'WORKING';
  } catch {
    return false;
  }
}

function isMetaWhatsApp(instance: Pick<DispatcherInstance, 'instanceType' | 'metaChannel'>) {
  return (
    instance.instanceType?.trim().toLowerCase() === 'meta' &&
    (!instance.metaChannel || instance.metaChannel.trim().toLowerCase() === 'whatsapp')
  );
}

function isWhatsappLike(instanceType: string | null | undefined) {
  const type = instanceType?.trim().toLowerCase();
  return !type || type === 'whatsapp' || type === 'meta' || type === 'waha';
}

function canDispatchWhatsApp(instance: DispatcherInstance) {
  if (instance.instanceType?.trim().toLowerCase() === 'meta') {
    return isMetaWhatsApp(instance);
  }
  return isWhatsappLike(instance.instanceType);
}

function buildInstanceNameCandidates(instanceName?: string | null) {
  const exactName = instanceName?.trim();
  if (!exactName) return [];

  const suffixVariants = [
    exactName,
    exactName.endsWith('_wh') ? exactName.slice(0, -3) : `${exactName}_wh`,
  ];

  return Array.from(new Set(suffixVariants.filter(Boolean)));
}

function preferConfiguredInstance(
  instances: DispatcherInstance[],
  preferredInstanceName?: string | null,
) {
  const candidates = instances.filter((instance) => canDispatchWhatsApp(instance));
  if (preferredInstanceName) {
    const preferredNames = buildInstanceNameCandidates(preferredInstanceName).map((name) =>
      name.toLowerCase(),
    );
    const normalizedPreferred = preferredInstanceName.trim().toLowerCase();
    const preferred = candidates.find((instance) => {
      const instanceNames = buildInstanceNameCandidates(instance.instanceName);
      const displayName = instance.displayName?.trim().toLowerCase();
      return (
        instanceNames.some((name) => preferredNames.includes(name.toLowerCase())) ||
        displayName === normalizedPreferred
      );
    });
    if (preferred) return [preferred, ...candidates.filter((instance) => instance !== preferred)];
  }
  return [
    ...candidates.filter((instance) => isMetaWhatsApp(instance)),
    ...candidates.filter((instance) => !isMetaWhatsApp(instance)),
  ];
}

async function isEvolutionOpen(args: {
  serverUrl: string;
  apiKey: string | null;
  instanceName: string;
}) {
  if (!args.serverUrl || !args.apiKey || !args.instanceName) return false;

  try {
    const response = await fetch(
      `${args.serverUrl}/instance/connectionState/${encodeURIComponent(args.instanceName)}`,
      {
        method: 'GET',
        headers: { apikey: args.apiKey },
        cache: 'no-store',
      },
    );
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    const state = data?.instance?.state ?? data?.state ?? data?.connectionState;
    return String(state ?? '').toLowerCase() === 'open';
  } catch {
    return false;
  }
}

function isMetaOpen(instance: DispatcherInstance) {
  return Boolean(instance.instanceName && instance.metaPhoneNumberId && instance.metaAccessToken);
}

async function isDispatcherLineConnected(args: {
  instance: DispatcherInstance;
  provider: WhatsAppDispatcherLine['provider'];
  serverUrl: string;
  apiKey: string | null;
}) {
  if (!args.instance.instanceName) return false;

  if (args.provider === 'meta') return isMetaOpen(args.instance);
  if (args.provider === 'waha') return isWahaOpen(args.instance.instanceName);

  return isEvolutionOpen({
    serverUrl: args.serverUrl,
    apiKey: args.apiKey,
    instanceName: args.instance.instanceName,
  });
}

async function findLineForUser(
  userId: string,
  preferredInstanceName?: string | null,
  options?: { requireConnected?: boolean },
): Promise<WhatsAppDispatcherLine | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      notificationNumber: true,
      apiKey: { select: { url: true, key: true } },
      instancias: {
        select: {
          instanceId: true,
          instanceName: true,
          displayName: true,
          instanceType: true,
          metaAccessToken: true,
          metaPhoneNumberId: true,
          metaChannel: true,
        },
      },
    },
  });

  if (!user) return null;

  const serverUrl = normalizeBaseUrl(user.apiKey?.url);
  const candidates = preferConfiguredInstance(user.instancias, preferredInstanceName);
  let fallback: WhatsAppDispatcherLine | null = null;

  for (const instance of candidates) {
    if (!instance.instanceName || !instance.instanceId) continue;

    const provider = isMetaWhatsApp(instance)
      ? 'meta'
      : isWaha(instance.instanceType)
        ? 'waha'
        : 'evolution';
    const line: WhatsAppDispatcherLine = {
      id: user.id,
      notificationNumber: user.notificationNumber ?? null,
      instanceId: instance.instanceId,
      instanceName: instance.instanceName,
      instanceType: instance.instanceType,
      serverUrl: provider === 'evolution' ? serverUrl : null,
      apiKey: provider === 'evolution' ? user.apiKey?.key ?? null : null,
      provider,
    };

    fallback ??= line;

    const connected = provider === 'meta'
      ? isMetaOpen(instance)
      : provider === 'waha'
        ? await isWahaOpen(instance.instanceName)
        : await isEvolutionOpen({
          serverUrl,
          apiKey: user.apiKey?.key ?? null,
          instanceName: instance.instanceName,
        });

    if (connected) return line;
  }

  return options?.requireConnected ? null : fallback;
}

async function findOfficialVerzayLine(preferredInstanceName?: string | null) {
  const superAdmins = await db.user.findMany({
    where: {
      role: 'super_admin',
      instancias: { some: { instanceName: { not: '' } } },
    },
    select: { id: true, name: true, company: true },
  });

  const ordered = superAdmins.sort((a, b) => {
    const aLabel = `${a.company ?? ''} ${a.name ?? ''}`.toLowerCase();
    const bLabel = `${b.company ?? ''} ${b.name ?? ''}`.toLowerCase();
    const aIsGrupo = aLabel.includes('grupo');
    const bIsGrupo = bLabel.includes('grupo');
    if (aIsGrupo !== bIsGrupo) return aIsGrupo ? -1 : 1;
    return aLabel.localeCompare(bLabel);
  });

  for (const admin of ordered) {
    const line = await findLineForUser(admin.id, preferredInstanceName, { requireConnected: true });
    if (line) return line;
  }

  return null;
}

export async function resolveSystemNotificationInstanceName(): Promise<string> {
  const configs = await db.resellerBillingConfig.findMany({
    where: {
      enabled: true,
      instanceName: { not: null },
      reseller: { is: { role: 'super_admin' } },
    },
    select: {
      instanceName: true,
      updatedAt: true,
      reseller: {
        select: {
          name: true,
          company: true,
        },
      },
    },
  });

  const ordered = configs
    .filter((config) => config.instanceName?.trim())
    .sort((a, b) => {
      const aLabel = `${a.reseller.company ?? ''} ${a.reseller.name ?? ''}`.toLowerCase();
      const bLabel = `${b.reseller.company ?? ''} ${b.reseller.name ?? ''}`.toLowerCase();
      const aIsGrupo = aLabel.includes('grupo') || aLabel.includes('verzay');
      const bIsGrupo = bLabel.includes('grupo') || bLabel.includes('verzay');
      if (aIsGrupo !== bIsGrupo) return aIsGrupo ? -1 : 1;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

  return ordered[0]?.instanceName?.trim() || DEFAULT_SYSTEM_NOTIFICATION_INSTANCE;
}

/**
 * Reseller "dueño" de un cliente combinando los DOS sistemas de vinculación:
 * el nuevo `User.demoResellerId` y el viejo (tabla `reseller`, columna `userId`
 * → `resellerid`). Devuelve null si el cliente no pertenece a ningún reseller
 * (cliente directo de la plataforma). Un cliente vinculado solo por el sistema
 * viejo tiene `demoResellerId=null`, así que mirar únicamente ese campo hace que
 * caiga al flujo de Verzay; hay que combinar ambos.
 */
export async function resolveClientResellerId(
  clientUserId: string,
  knownDemoResellerId?: string | null,
): Promise<string | null> {
  const fromNew = knownDemoResellerId?.trim();
  if (fromNew) return fromNew;

  const user = knownDemoResellerId === undefined
    ? await db.user.findUnique({
        where: { id: clientUserId },
        select: { demoResellerId: true },
      })
    : null;
  if (user?.demoResellerId) return user.demoResellerId;

  const legacy = await db.reseller.findFirst({
    where: { userId: clientUserId, resellerid: { not: null } },
    select: { resellerid: true },
  });
  return legacy?.resellerid ?? null;
}

/**
 * Línea por la que el SISTEMA debe notificar a un cliente (cobros, desconexión,
 * reportes, seguimientos de prueba, etc.):
 * - Si el cliente pertenece a un reseller (por CUALQUIERA de los dos sistemas de
 *   vinculación) o a una cuenta maestra de equipo (`ownerId`), la notificación
 *   SOLO puede salir por la línea de ese reseller/dueño; NUNCA por Verzay, aunque
 *   el reseller no tenga línea conectada (en ese caso devuelve null y no se envía).
 * - Si es cliente directo (sin equipo ni reseller), sale por la línea oficial de
 *   la plataforma (Verzay).
 */
export async function resolveSystemNotificationDispatcherForClient(args: {
  clientUserId: string;
  ownerId?: string | null;
  demoResellerId?: string | null;
  preferredInstanceName?: string | null;
}): Promise<WhatsAppDispatcherLine | null> {
  const ownerId = args.ownerId?.trim() || null;
  const resellerId = ownerId
    ? null
    : await resolveClientResellerId(args.clientUserId, args.demoResellerId ?? undefined);
  const senderUserId = ownerId ?? resellerId;

  if (!senderUserId) {
    // Cliente directo → línea oficial de Verzay.
    return resolveWhatsAppDispatcherLine({
      preferredInstanceName: args.preferredInstanceName,
      includeAdminFallback: true,
    });
  }

  // Cliente de reseller / cuenta maestra → SOLO su línea; nunca Verzay.
  const configured = (
    args.preferredInstanceName?.trim() ||
    (await resolveConfiguredNotificationInstanceName(senderUserId)) ||
    ''
  ).trim();
  return resolveWhatsAppDispatcherLine({
    ownerUserId: senderUserId,
    preferredInstanceName: configured || null,
    includeAdminFallback: false,
  });
}

export async function resolveConfiguredNotificationInstanceName(
  ownerUserId?: string | null,
): Promise<string> {
  const ownerId = ownerUserId?.trim();
  if (ownerId) {
    const config = await db.resellerBillingConfig.findUnique({
      where: { resellerId: ownerId },
      select: { enabled: true, instanceName: true },
    });

    if (config?.enabled && config.instanceName?.trim()) {
      return config.instanceName.trim();
    }

    return '';
  }

  return resolveSystemNotificationInstanceName();
}

export async function resolveSystemNotificationDispatcherLine(
  ownerUserId?: string | null,
): Promise<WhatsAppDispatcherLine | null> {
  const instanceName = await resolveConfiguredNotificationInstanceName(ownerUserId);
  const exactLine = await resolveWhatsAppDispatcherLineByInstanceName(instanceName);
  if (exactLine) return exactLine;

  if (ownerUserId?.trim()) {
    return resolveWhatsAppDispatcherLine({
      ownerUserId,
      preferredInstanceName: instanceName,
      includeAdminFallback: false,
    });
  }

  return resolveWhatsAppDispatcherLine({
    preferredInstanceName: instanceName,
    includeAdminFallback: true,
  });
}

export async function resolveWhatsAppDispatcherLine(args?: {
  ownerUserId?: string | null;
  preferredInstanceName?: string | null;
  includeAdminFallback?: boolean;
}): Promise<WhatsAppDispatcherLine | null> {
  const ownerUserId = args?.ownerUserId?.trim() || null;
  const includeAdminFallback = args?.includeAdminFallback ?? true;

  if (!ownerUserId) {
    return findOfficialVerzayLine(args?.preferredInstanceName);
  }

  const ownerLine = await findLineForUser(ownerUserId, args?.preferredInstanceName, { requireConnected: true });
  if (ownerLine) return ownerLine;

  if (!includeAdminFallback) return null;

  return findOfficialVerzayLine(args?.preferredInstanceName);
}

export async function resolveWhatsAppDispatcherLineByInstanceName(
  instanceName: string,
): Promise<WhatsAppDispatcherLine | null> {
  const exactName = instanceName.trim();
  if (!exactName) return null;
  const candidates = buildInstanceNameCandidates(exactName);

  const user = await db.user.findFirst({
    where: {
      instancias: {
        some: {
          OR: [
            { instanceName: { in: candidates } },
            { displayName: { equals: exactName, mode: 'insensitive' } },
          ],
        },
      },
    },
    select: {
      id: true,
      notificationNumber: true,
      apiKey: { select: { url: true, key: true } },
      instancias: {
        where: {
          OR: [
            { instanceName: { in: candidates } },
            { displayName: { equals: exactName, mode: 'insensitive' } },
          ],
        },
        take: 1,
        select: {
          instanceId: true,
          instanceName: true,
          displayName: true,
          instanceType: true,
          metaAccessToken: true,
          metaPhoneNumberId: true,
          metaChannel: true,
        },
      },
    },
  });

  const instance = user?.instancias[0];
  if (!user || !instance?.instanceName || !instance.instanceId || !canDispatchWhatsApp(instance)) {
    return null;
  }

  const provider = isMetaWhatsApp(instance)
    ? 'meta'
    : isWaha(instance.instanceType)
      ? 'waha'
      : 'evolution';
  const serverUrl = normalizeBaseUrl(user.apiKey?.url);
  const apiKey = provider === 'evolution' ? user.apiKey?.key ?? null : null;

  const connected = await isDispatcherLineConnected({
    instance,
    provider,
    serverUrl,
    apiKey,
  });
  if (!connected) return null;

  return {
    id: user.id,
    notificationNumber: user.notificationNumber ?? null,
    instanceId: instance.instanceId,
    instanceName: instance.instanceName,
    instanceType: instance.instanceType,
    serverUrl: provider === 'evolution' ? serverUrl : null,
    apiKey,
    provider,
  };
}

/**
 * De qué envío automático es esto, para dejar constancia.
 *
 * **Opcional a propósito.** Este despachador lo usan también el chat de Chats y
 * el modo dueño por WhatsApp, que son una persona pulsando un botón y viendo el
 * resultado en su pantalla: ahí no hay nada silencioso que registrar, y
 * anotarlos llenaría la tabla de ruido. Lo que se anota es lo que sale SOLO.
 */
export type RegistroDelEnvio = {
  tipo: TipoDeEnvio;
  /** La cuenta a la que se le atribuye. La vigilancia no tiene. */
  cuentaId?: string | null;
};

/**
 * Mandar un texto por la línea que sea, y **dejar constancia de cómo fue**.
 *
 * El registro va AQUÍ y no en cada llamador, que es lo que hace que sirva: los
 * seis caminos automáticos —cobros, desconexión, facturación, prueba de 7 días,
 * informe semanal y el aviso de ticket resuelto— pasan todos por esta función,
 * así que una sola línea los cubre y el séptimo que se añada queda cubierto
 * solo. Con la anotación escrita en cada disparador, el cuarto se olvida — y un
 * envío que no se anota es exactamente el que nadie echa en falta.
 *
 * Y **anotar no puede cambiar lo que pasó**: `anotarElEnvio` no lanza nunca
 * (ver `lib/salud-del-envio-db.ts`). El mensaje salió o no salió antes de
 * llegar a esa línea, y eso no se deshace.
 */
export async function sendViaWhatsAppDispatcher(args: {
  dispatcher: WhatsAppDispatcherLine;
  remoteJid: string;
  text: string;
  history?: Parameters<typeof sendingMessages>[0]['history'];
  registro?: RegistroDelEnvio;
}) {
  const resultado = await mandarElTexto(args);

  if (args.registro) {
    await anotarElEnvio({
      tipo: args.registro.tipo,
      proveedor: args.dispatcher.provider,
      cuentaId: args.registro.cuentaId ?? args.dispatcher.id,
      linea: args.dispatcher.instanceName,
      destinatario: args.remoteJid,
      salio: Boolean(resultado?.success),
      motivo: resultado?.message,
    });
  }

  return resultado;
}

async function mandarElTexto(args: {
  dispatcher: WhatsAppDispatcherLine;
  remoteJid: string;
  text: string;
  history?: Parameters<typeof sendingMessages>[0]['history'];
}) {
  if (args.dispatcher.provider === 'meta') {
    return sendChannelTextAction(args.dispatcher.instanceName, args.remoteJid, {
      kind: 'text',
      text: args.text,
    });
  }

  if (args.dispatcher.provider === 'waha') {
    return enviarPorWaha({
      dispatcher: args.dispatcher,
      remoteJid: args.remoteJid,
      texto: args.text,
    });
  }

  if (!args.dispatcher.serverUrl || !args.dispatcher.instanceId) {
    return {
      success: false,
      message: 'Dispatcher Evolution sin configuracion completa.',
      error: 'MISSING_EVOLUTION_DISPATCHER',
    };
  }

  return sendingMessages({
    url: `${args.dispatcher.serverUrl}/message/sendText/${encodeURIComponent(args.dispatcher.instanceName)}`,
    apikey: args.dispatcher.instanceId,
    remoteJid: args.remoteJid,
    text: args.text,
    history: args.history,
  });
}

/* ── Waha, sin sesion ─────────────────────────────────────────────────────── */

/**
 * Mandar por una linea Waha **desde el servidor**, sin sesion de navegador.
 *
 * Antes esto llamaba a `sendWahaTextAction`, que es una accion de la pantalla
 * de Chats y empieza por `currentUser()`. Desde una vuelta de cron **no hay
 * sesion**, asi que devolvia «No autorizado» y el mensaje no salia nunca: los
 * recordatorios de Cobros, los avisos de facturacion, el seguimiento de prueba
 * y el informe semanal estaban callados en toda linea Waha, sin un solo error
 * que mirar. El sintoma no se parece a un fallo: se parece a que la App no le
 * escribe a nadie.
 *
 * La regla que lo evita, y es la misma que ya cumplia Evolution: **un
 * despachador del servidor no pasa por una accion.** `sendingMessages` siempre
 * fue una funcion suelta; Waha entra ahora por sus primitivas de `lib/waha.ts`,
 * que solo hablan HTTP. La puerta de `sendWahaTextAction`
 * (`currentUser` + `assertCanAccessTargetUser`) se queda intacta donde tiene
 * sentido: en la llamada que llega del navegador.
 *
 * Dos diferencias con aquel camino, a proposito:
 *
 * 1. **No se pausa la IA.** Un cobro o un aviso de la plataforma no es un
 *    asesor interviniendo en la conversacion; Evolution nunca la pauso.
 * 2. **No se antepone la firma del asesor.** Depende de `currentUser()`, que
 *    aqui no existe, y una firma personal debajo de un aviso automatico seria
 *    falsa.
 *
 * Lo que si se conserva es **la burbuja**: el saliente se guarda en nuestra
 * base igual que antes, con el id que devolvio Waha para que un eco por webhook
 * no lo duplique.
 */
async function enviarPorWaha(params: {
  dispatcher: WhatsAppDispatcherLine;
  remoteJid: string;
  texto?: string;
  media?: AdjuntoParaDespachar;
}): Promise<{ success: boolean; message: string; error?: string }> {
  const chatId = canonicalToWahaJid(params.remoteJid);
  if (!chatId) {
    return {
      success: false,
      message: 'El contacto no tiene una identidad valida.',
      error: 'INVALID_WAHA_JID',
    };
  }

  const ahora = new Date();
  const guardar = async (messageId: string | null, messageType: string, contenido: string, mensaje: Record<string, unknown>, mediaUrl?: string | null) => {
    try {
      await persistChatMessage({
        userId: params.dispatcher.id,
        instanceName: params.dispatcher.instanceName,
        instanceType: 'waha',
        remoteJid: params.remoteJid,
        fromMe: true,
        messageId,
        messageType,
        content: contenido,
        mediaUrl: mediaUrl ?? null,
        raw: snapshotDeSalienteWaha({
          messageId,
          remoteJid: params.remoteJid,
          messageType,
          message: mensaje,
          fecha: ahora,
        }) as unknown as Prisma.InputJsonValue,
        messageTimestamp: ahora,
      });
    } catch (error) {
      // El mensaje YA salio: no se puede deshacer y no se devuelve un fallo por
      // esto. Pero tampoco es mudo — sin burbuja, la conversacion parece no
      // haber recibido nada.
      console.warn('[dispatcher] el saliente de Waha salio pero no se pudo guardar', {
        instancia: params.dispatcher.instanceName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (params.media) {
    const envio = await sendWahaMedia({
      session: params.dispatcher.instanceName,
      chatId,
      mediatype: params.media.mediatype as WahaMediaType,
      mediaUrl: params.media.mediaUrl,
      mimetype: params.media.mimetype,
      fileName: params.media.fileName,
      caption: params.media.caption,
      ptt: false,
    });
    if (!envio.ok) return { success: false, message: envio.message, error: envio.message };

    const tipo = params.media.mediatype;
    const contenido =
      params.media.caption?.trim() || params.media.fileName || etiquetaDeMediaWaha(tipo);
    await guardar(
      envio.messageId,
      `${tipo}Message`,
      contenido,
      {
        conversation: contenido,
        mediaUrl: params.media.mediaUrl,
        [`${tipo}Message`]: {
          caption: params.media.caption?.trim() || undefined,
          fileName: params.media.fileName ?? undefined,
          mimetype: params.media.mimetype ?? undefined,
          mediaUrl: params.media.mediaUrl,
        },
      },
      params.media.mediaUrl,
    );
    return { success: true, message: 'Enviado.' };
  }

  const texto = (params.texto ?? '').trim();
  if (!texto) return { success: false, message: 'El mensaje esta vacio.', error: 'EMPTY_TEXT' };

  const envio = await sendWahaText({ session: params.dispatcher.instanceName, chatId, text: texto });
  if (!envio.ok) return { success: false, message: envio.message, error: envio.message };

  await guardar(envio.messageId, 'conversation', texto, { conversation: texto });
  return { success: true, message: 'Enviado.' };
}

/* ── Adjuntos ─────────────────────────────────────────────────────────────── */

/**
 * Un archivo tal y como lo espera cualquiera de los tres proveedores.
 *
 * `mediaUrl` es **una direccion http(s)**, no un `data:`. Los tres caminos
 * saben descargarla —Evolution la convierte a base64, Waha la descarga y el
 * backend de canales la reenvia— y ninguno tiene que cargar el fichero entero
 * en memoria de la App para pasarselo al de al lado.
 */
export type AdjuntoParaDespachar = {
  mediatype: 'image' | 'video' | 'audio' | 'document';
  mediaUrl: string;
  mimetype?: string | null;
  fileName?: string | null;
  caption?: string | null;
};

/**
 * Mandar un ARCHIVO por la misma linea por la que sale el texto.
 *
 * Este despachador nacio para **avisos**, que son todos de texto, y por eso su
 * firma no tenia sitio para un adjunto y cada proveedor iba con `kind: 'text'`
 * escrito a mano. No habia ningun motivo tecnico detras: las tres primitivas de
 * media existian desde siempre y ninguna necesita sesion —`sendMediaByUrl` es
 * HTTP contra Evolution, `sendWahaMedia` es HTTP contra Waha, y el camino de
 * canales ya tiene su rama `kind: 'media'`—. Lo unico que faltaba era esta
 * funcion.
 *
 * **Va aparte de `sendViaWhatsAppDispatcher` y no como un parametro opcional
 * suyo**: quien manda un archivo casi siempre manda antes un texto, y son dos
 * mensajes distintos en el telefono del cliente. Con las dos cosas en una sola
 * llamada, un fallo del archivo no se podria distinguir de un fallo del texto,
 * y el texto —que es lo que de verdad hay que entregar— se daria por perdido.
 */
export async function sendMediaViaWhatsAppDispatcher(args: {
  dispatcher: WhatsAppDispatcherLine;
  remoteJid: string;
  media: AdjuntoParaDespachar;
}): Promise<{ success: boolean; message: string; error?: string }> {
  if (!/^https?:\/\//i.test(args.media.mediaUrl || '')) {
    return {
      success: false,
      message: 'El archivo no tiene una direccion publica desde la que enviarlo.',
      error: 'MEDIA_URL_NO_PUBLICA',
    };
  }

  if (args.dispatcher.provider === 'meta') {
    const res = await sendChannelTextAction(args.dispatcher.instanceName, args.remoteJid, {
      kind: 'media',
      mediatype: args.media.mediatype,
      mediaUrl: args.media.mediaUrl,
      mimetype: args.media.mimetype ?? undefined,
      fileName: args.media.fileName ?? undefined,
      caption: args.media.caption ?? undefined,
      ptt: false,
    });
    return {
      success: Boolean(res?.success),
      message: res?.message ?? 'No se pudo enviar el archivo.',
      error: res?.success ? undefined : res?.message,
    };
  }

  if (args.dispatcher.provider === 'waha') {
    return enviarPorWaha({
      dispatcher: args.dispatcher,
      remoteJid: args.remoteJid,
      media: args.media,
    });
  }

  if (!args.dispatcher.serverUrl || !args.dispatcher.instanceId) {
    return {
      success: false,
      message: 'Dispatcher Evolution sin configuracion completa.',
      error: 'MISSING_EVOLUTION_DISPATCHER',
    };
  }

  // La misma credencial con la que sale el texto: el token de la instancia,
  // no la key de la cuenta. Si se mezclaran, el archivo saldria por una linea
  // y el texto por otra.
  const res = await sendMediaByUrl(
    { url: args.dispatcher.serverUrl, key: args.dispatcher.instanceId },
    args.dispatcher.instanceName,
    args.remoteJid,
    {
      mediatype: args.media.mediatype,
      mediaUrl: args.media.mediaUrl,
      mimetype: args.media.mimetype ?? undefined,
      fileName: args.media.fileName ?? undefined,
      caption: args.media.caption ?? undefined,
    },
  );
  return {
    success: Boolean(res?.success),
    message: res?.message ?? 'No se pudo enviar el archivo.',
    error: res?.success ? undefined : res?.message,
  };
}

/* ── Lo que no llega al despachador ───────────────────────────────────────── */

/**
 * Anotar un envío que **no llegó a intentarse** porque no había línea.
 *
 * Es el único caso que el despachador no puede ver, y no por descuido: los seis
 * caminos automáticos resuelven su línea ANTES y se rinden si no la hay
 * —`resolveWhatsAppDispatcherLine` devuelve `null`—, así que ese mensaje nunca
 * pasa por `sendViaWhatsAppDispatcher`. Sin esta función, el fallo más
 * silencioso de todos —la cuenta se quedó sin línea conectada y a su gente no
 * le llega nada— sería justo el que no aparece en la pantalla de salud.
 *
 * Va con `proveedor: 'ninguno'`, que es lo cierto: no falló Waha, es que no
 * había por dónde. Confundirlo con un fallo de Waha mandaría a mirar el
 * servidor equivocado.
 *
 * No lanza, por lo mismo que `anotarElEnvio`.
 */
export async function anotarQueNoHabiaLinea(args: {
  tipo: TipoDeEnvio;
  cuentaId?: string | null;
  destinatario?: string | null;
  motivo?: string | null;
}) {
  await anotarElEnvio({
    tipo: args.tipo,
    proveedor: 'ninguno',
    cuentaId: args.cuentaId,
    linea: null,
    destinatario: args.destinatario,
    salio: false,
    motivo: args.motivo ?? 'No hay ninguna línea de WhatsApp conectada para enviar.',
  });
}
