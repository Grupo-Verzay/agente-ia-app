"use server";

import type { MediaType, FetchChatsResult, FindMessagesResult, SendMessageResult } from "./chat-actions";
import type { ChatToolActionResult } from "@/types/chat";
import { Prisma, type WorkflowNode } from "@prisma/client";

import { currentUser } from "@/lib/auth";
import { anteponerFirmaDelAsesor } from "@/lib/firma-del-asesor";
import { getAssociatedAccountIds } from "@/lib/cuentas-asociadas";
import { db } from "@/lib/db";
import { buildChatHistorySessionId } from "@/lib/chat-history/build-session-id";
import { pausarIaPorIntervencionHumana } from "@/lib/human-takeover";
import { esNodoDeAutomatizacion, ejecutarNodoDeAutomatizacion } from "@/lib/workflow-automation-nodes";
import { saveChatHistoryMessage } from "@/lib/chat-history/chat-history.helper";
import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";
import { epochToMs } from "@/lib/epoch";
import {
  marcarMensajeComoEliminado,
  getDeletedLastMessageJids,
  getPersistedInboxChats,
  getPersistedMessages,
  guardarMensajeEditado,
  guardarReaccion,
  persistChatMessage,
  persistEvolutionMessages,
  resolveInstanceOwner,
} from "@/lib/chat-persistence";
import { puedeBorrarEnChats } from "@/lib/mando-en-chats";
import {
  deleteWahaMessage,
  editWahaMessage,
  reactToWahaMessage,
  sendWahaMedia,
  sendWahaText,
  subscribeWahaPresence,
  getWahaChatMessages,
  getWahaChats,
  type WahaMediaType,
} from "@/lib/waha";
import { mensajeDeWahaParaGuardar } from "@/lib/waha-historial";
import { canonicalToWahaJid, wahaJidToCanonical } from "@/lib/waha-jid";
import { TOPE_DE_LA_BANDEJA } from "@/lib/bandeja";
import {
  bajarElAudioDeLaNota,
  guardarLaTranscripcion,
  laNotaDeVoz,
} from "@/lib/transcribir-nota-de-chat";
import {
  costoDeLaNota,
  porQueNoSeTranscribio,
  queHacerConLaNota,
  type NoSeTranscribio,
} from "@/lib/transcripcion-de-voz";
import {
  descontarLaTranscripcion,
  laClaveDeOpenAi,
  losCreditosQueQuedan,
  pedirleElTextoAOpenAi,
} from "@/lib/creditos-de-transcripcion";
import { subirAdjuntoSaliente } from "@/lib/adjuntos-salientes";
import { apuntarLoQueHizo, apuntarUnaVezAlDia } from "@/lib/apuntar-actividad";
import {
  fetchChatsFromEvolution,
  findMessagesByRemoteJid,
  resolveWhatsAppJid,
  sendMediaByUrl,
  sendTextMessage,
  sendReaction,
  deleteMessage,
  subscribeEvolutionPresence,
  editMessage,
} from "./chat-actions";
import { getExecutionNodesForWorkflow } from "./workflow-node-action";

/**
 * Con que linea y con que credenciales se habla con Evolution.
 *
 * `apiKeyData` puede venir vacio: la pagina no siempre sabe resolver la clave
 * -a un asesor su propia cuenta no le da ninguna- y antes, cuando no la sabia,
 * mandaba el contexto entero a null y se perdia hasta el nombre de la linea. El
 * servidor se quedaba sin nada con lo que trabajar y contestaba "No hay
 * instancia o API key configurada".
 *
 * Con el nombre de la linea basta: de ahi sale su cuenta, y de la cuenta su
 * clave. Ver `resolverContexto`.
 */
type ChatActionContext = {
  apiKeyData?: {
    url: string;
    key: string;
  } | null;
  instanceName: string;
} | null;
type SuccessfulFindMessagesResult = Extract<FindMessagesResult, { success: true }>;

type OutgoingTextPayload = {
  kind: "text";
  text: string;
  delay?: number;
  linkPreview?: boolean;
  mentionsEveryOne?: boolean;
  mentioned?: string[];
  quotedMessage?: { key: { id: string; fromMe?: boolean; remoteJid?: string }; message: { conversation: string } };
};

type OutgoingMediaPayload = {
  kind: "media";
  mediatype: MediaType;
  mediaUrl: string;
  mimetype?: string;
  fileName?: string;
  caption?: string;
  ptt?: boolean;
  delay?: number;
  linkPreview?: boolean;
  mentionsEveryOne?: boolean;
  mentioned?: string[];
  quotedMessage?: { key: { id: string; fromMe?: boolean; remoteJid?: string }; message: { conversation: string } };
};

type OutgoingMessagePayload = OutgoingTextPayload | OutgoingMediaPayload;
const DEFAULT_CHAT_MESSAGE_PAGE_SIZE = 10;
// Ventana de mensajes que se trae y persiste de Evolution al sincronizar un chat
// (página 1). Se desacopla del tamaño de página de la UI: Evolution solo se
// consulta en la apertura, así que pedir una ventana amplia llena la BD local con
// suficiente historial para que el scroll-back funcione sin quedarse corto.
const EVOLUTION_SYNC_WINDOW_SIZE = 25;
// Lo que se le aguanta a Evolution antes de cortarle la llamada. Estaba en los
// 15s por defecto de `fetchMessagesForRemoteJid`, o sea EXACTAMENTE lo que el
// navegador espera por toda la vuelta: cualquier lentitud de Evolution se
// comia el plazo entero y el cliente tiraba la respuesta.
const ESPERA_MAXIMA_DE_EVOLUTION = 9000;
// Y lo que se le espera antes de contestar con nuestra base. Por debajo del
// corte de arriba a proposito: primero se contesta con lo que hay guardado, y
// Evolution sigue de fondo hasta su propio limite.
const MARGEN_ANTES_DE_TIRAR_DE_LA_BASE = 6000;

function buildOutgoingHistoryEntry(payload: OutgoingMessagePayload) {
  if (payload.kind === "text") {
    return {
      content: payload.text.trim(),
      additionalKwargs: {
        messageKind: "text",
      },
    };
  }

  const mediaLabel =
    payload.mediatype === "image"
      ? "🖼️ Imagen"
      : payload.mediatype === "video"
        ? "🎥 Video"
        : payload.mediatype === "audio"
          ? payload.ptt
            ? "🎙️ Nota de voz"
            : "🎧 Audio"
          : "📄 Documento";

  const fileName = payload.fileName?.trim();
  const caption = payload.caption?.trim();
  const content = [fileName ? `${mediaLabel} ${fileName}` : mediaLabel, caption]
    .filter(Boolean)
    .join("\n");

  return {
    content,
    additionalKwargs: {
      messageKind: "media",
      mediatype: payload.mediatype,
      fileName: fileName || null,
      mimetype: payload.mimetype || null,
      hasCaption: Boolean(caption),
      ptt: payload.ptt ?? false,
    },
  };
}

function normalizeWorkflowNodeType(tipo?: string) {
  const normalized = tipo?.trim().toLowerCase() ?? "";
  if (!normalized || normalized.startsWith("seguimiento-")) return null;

  if (
    normalized === "text" ||
    normalized === "image" ||
    normalized === "video" ||
    normalized === "document" ||
    normalized === "audio"
  ) {
    return normalized;
  }

  return null;
}

function buildWorkflowPayload(node: WorkflowNode): OutgoingMessagePayload | null {
  const nodeType = normalizeWorkflowNodeType(node.tipo);
  if (!nodeType) return null;

  if (nodeType === "text") {
    const text = node.message?.trim() ?? "";
    return text ? { kind: "text", text } : null;
  }

  const mediaUrl = node.url?.trim();
  if (!mediaUrl) return null;

  if (nodeType === "audio") {
    return {
      kind: "media",
      mediatype: "audio",
      mediaUrl,
    };
  }

  const caption = node.message?.trim() ?? "";
  return {
    kind: "media",
    mediatype: nodeType,
    mediaUrl,
    caption: caption || undefined,
  };
}

function extractSentMessageId(data: unknown) {
  const rec = data as Record<string, any> | null | undefined;
  return (
    rec?.key?.id ||
    rec?.message?.key?.id ||
    rec?.data?.key?.id ||
    rec?.id ||
    null
  );
}

async function persistOutgoingHistory(params: {
  instanceName: string;
  remoteJid: string;
  payload: OutgoingMessagePayload;
  source: string;
  userId?: string;
  instanceType?: string | null;
  sentData?: unknown;
  historyType?: "notification" | "workflow";
  metadata?: Record<string, unknown>;
}) {
  const {
    instanceName,
    remoteJid,
    payload,
    source,
    userId,
    instanceType,
    sentData,
    historyType = "notification",
    metadata = {},
  } = params;
  const historyEntry = buildOutgoingHistoryEntry(payload);

  try {
    await saveChatHistoryMessage({
      sessionId: buildChatHistorySessionId(instanceName, remoteJid),
      content: historyEntry.content,
      type: historyType,
      additionalKwargs: {
        channel: "whatsapp",
        provider: instanceType ?? "evolution",
        direction: "outbound",
        source,
        remoteJid,
        ...historyEntry.additionalKwargs,
        ...metadata,
      },
      responseMetadata: {
        sentAt: new Date().toISOString(),
        instanceName,
      },
    });
  } catch (historyError) {
    console.error("[CHATS] No se pudo guardar el historial del mensaje enviado.", historyError);
  }

  if (userId) {
    try {
      await persistChatMessage({
        userId,
        instanceName,
        instanceType: instanceType ?? "evolution",
        remoteJid,
        messageId: extractSentMessageId(sentData),
        fromMe: true,
        messageType: payload.kind === "text" ? "conversation" : `${payload.mediatype}Message`,
        content: historyEntry.content,
        mediaUrl: payload.kind === "media" ? payload.mediaUrl : null,
        raw: {
          source,
          payload,
          sentData: sentData ?? null,
          metadata,
          // La cita, con la MISMA forma que la manda WhatsApp
          // (`contextInfo.stanzaId` + `quotedMessage`). Guardada asi, el panel
          // la lee igual venga de donde venga, y no hay que ensenarle a leer
          // ademas la forma de nuestro `payload`. Sin esto la respuesta salia
          // suelta, sin decir a que mensaje contestaba.
          ...(payload.quotedMessage
            ? {
                contextInfo: {
                  stanzaId: payload.quotedMessage.key?.id,
                  quotedMessage: payload.quotedMessage.message,
                },
              }
            : {}),
        } as any,
        messageTimestamp: new Date(),
      });
    } catch (error) {
      console.error("[CHATS] No se pudo persistir el mensaje saliente.", error);
    }
  }
}

async function sendOutgoingPayload(params: {
  context: Exclude<ChatActionContext, null>;
  remoteJid: string;
  persistRemoteJid?: string;
  payload: OutgoingMessagePayload;
  source: string;
  userId?: string;
  instanceType?: string | null;
  historyType?: "notification" | "workflow";
  metadata?: Record<string, unknown>;
}): Promise<SendMessageResult> {
  const { context, remoteJid, persistRemoteJid, payload, source, userId, instanceType, historyType, metadata } = params;

  // WhatsApp Mensajeria (waha): mismo recorrido -enviar y persistir con el id
  // real-, distinto transporte. El servidor sale de Panel > Conexion.
  if ((instanceType ?? "").trim().toLowerCase() === "waha") {
    const chatId = canonicalToWahaJid(remoteJid);
    // Un adjunto que venga en base64 se sube a S3 primero: Waha lo descarga de
    // ahi y la conversacion lo reproduce de ahi (ver lib/adjuntos-salientes).
    let payloadAEnviar: OutgoingMessagePayload = payload;
    if (payload.kind === "media" && userId) {
      const subida = await subirAdjuntoSaliente({
        userId,
        mediaUrl: payload.mediaUrl,
        mimetype: payload.mimetype,
        fileName: payload.fileName,
      });
      if (subida) payloadAEnviar = { ...payload, mediaUrl: subida };
      else console.warn("[waha] adjunto saliente sin copia en S3: la burbuja no tendra archivo", { instanceName: context.instanceName });
    }
    const envio =
      payloadAEnviar.kind === "text"
        ? await sendWahaText({ session: context.instanceName, chatId, text: payloadAEnviar.text })
        : await sendWahaMedia({
            session: context.instanceName,
            chatId,
            mediatype: payloadAEnviar.mediatype as WahaMediaType,
            mediaUrl: payloadAEnviar.mediaUrl,
            mimetype: payloadAEnviar.mimetype,
            fileName: payloadAEnviar.fileName,
            caption: payloadAEnviar.caption,
            ptt: payloadAEnviar.ptt,
          });
    if (!envio.ok) return { success: false, message: envio.message, remoteJid };

    const sentData = envio.messageId ? { key: { id: envio.messageId } } : null;
    await persistOutgoingHistory({
      instanceName: context.instanceName,
      remoteJid: persistRemoteJid ?? remoteJid,
      payload: payloadAEnviar,
      source,
      userId,
      instanceType: "waha",
      sentData,
      historyType,
      metadata,
    });
    return { success: true, message: "Enviado.", data: sentData ?? undefined, remoteJid };
  }

  const result =
    payload.kind === "text"
      ? await sendTextMessage(context.apiKeyData, context.instanceName, remoteJid, payload.text, {
          delay: payload.delay,
          linkPreview: payload.linkPreview,
          mentionsEveryOne: payload.mentionsEveryOne,
          mentioned: payload.mentioned,
          quotedMessage: payload.quotedMessage,
        })
      : await sendMediaByUrl(context.apiKeyData, context.instanceName, remoteJid, {
          mediatype: payload.mediatype,
          mediaUrl: payload.mediaUrl,
          mimetype: payload.mimetype,
          fileName: payload.fileName,
          caption: payload.caption,
          ptt: payload.ptt,
          delay: payload.delay,
          linkPreview: payload.linkPreview,
          mentionsEveryOne: payload.mentionsEveryOne,
          mentioned: payload.mentioned,
          quotedMessage: payload.quotedMessage,
        });

  if (result.success) {
    await persistOutgoingHistory({
      instanceName: context.instanceName,
      remoteJid: persistRemoteJid ?? remoteJid,
      payload,
      source,
      userId,
      instanceType,
      sentData: result.data,
      historyType,
      metadata,
    });
  }

  return result;
}

type ReadyChatActionContext = {
  apiKeyData: { url: string; key: string };
  instanceName: string;
};

function hasReadyContext(context: ChatActionContext): context is ReadyChatActionContext {
  return Boolean(context?.apiKeyData?.url && context?.apiKeyData?.key && context?.instanceName);
}

/** La linea es de WhatsApp Mensajeria (waha): no habla con Evolution. */
const tipoDeLineaEnCache = new Map<string, { esWaha: boolean; at: number }>();
const TIPO_DE_LINEA_TTL_MS = 5 * 60 * 1000;

async function esLineaWaha(instanceName?: string | null): Promise<boolean> {
  const nombre = instanceName?.trim();
  if (!nombre) return false;
  // Se pregunta en cada vuelta del sondeo del chat abierto (5 s): con cache.
  const enCache = tipoDeLineaEnCache.get(nombre);
  if (enCache && Date.now() - enCache.at < TIPO_DE_LINEA_TTL_MS) return enCache.esWaha;
  const dueno = await resolveInstanceOwner(nombre);
  const esWaha = (dueno?.instanceType ?? "").trim().toLowerCase() === "waha";
  tipoDeLineaEnCache.set(nombre, { esWaha, at: Date.now() });
  return esWaha;
}

/**
 * El contexto listo para usar: si falta la clave, se busca aqui.
 *
 * La clave es la de la CUENTA DUEÑA DE LA LINEA, no la de quien mira. Es la
 * distincion que faltaba: un asesor colaborador no tiene cuenta propia con
 * lineas -atiende las de otros-, asi que buscarle una clave suya no encuentra
 * nada y se quedaba sin poder abrir ningun chat, aunque las lineas que atiende
 * estuvieran perfectamente conectadas.
 *
 * Se comprueba que la linea sea de una de sus cuentas antes de entregar la
 * clave. Sin eso bastaria con mandar el nombre de una linea ajena para hablar
 * con Evolution en nombre de otro.
 *
 * El resultado se recuerda un rato: es una consulta por cada apertura de chat y
 * el mapeo linea -> cuenta -> clave practicamente no cambia.
 */
const cacheDeClavePorLinea = new Map<string, { valor: { url: string; key: string } | null; at: number }>();
const CLAVE_LINEA_TTL_MS = 5 * 60 * 1000;

async function resolverContexto(context: ChatActionContext): Promise<ChatActionContext> {
  if (hasReadyContext(context)) return context;
  const instanceName = context?.instanceName?.trim();
  if (!instanceName) return context;

  const user = await currentUser();
  if (!user?.id) return context;

  const enCache = cacheDeClavePorLinea.get(instanceName);
  if (enCache && Date.now() - enCache.at < CLAVE_LINEA_TTL_MS) {
    return enCache.valor ? { apiKeyData: enCache.valor, instanceName } : context;
  }

  try {
    const dueno = await resolveInstanceOwner(instanceName);
    if (!dueno?.userId) return context;

    // WhatsApp Mensajeria (waha) NO habla con Evolution. Rellenar
    // aqui la clave de Evolution de la cuenta hacia que la lista y los
    // mensajes de esas lineas se pidieran al servidor equivocado, que
    // contesta correcto y VACIO; solo el respaldo de nuestra base lo
    // disimulaba, y tarde. Para ellas el contexto se queda sin clave, que es
    // lo que hace que las acciones genericas tiren de la base.
    const tipo = (dueno.instanceType ?? '').trim().toLowerCase();
    if (tipo === 'waha') {
      cacheDeClavePorLinea.set(instanceName, { valor: null, at: Date.now() });
      return context;
    }

    const cuentas = await getAssociatedAccountIds(user);
    if (!cuentas.includes(dueno.userId)) return context;

    const cuenta = await db.user.findUnique({
      where: { id: dueno.userId },
      select: { apiKeyId: true },
    });
    const clave = cuenta?.apiKeyId
      ? await db.apiKey.findUnique({
          where: { id: cuenta.apiKeyId },
          select: { url: true, key: true },
        })
      : null;

    const valor = clave?.url && clave?.key ? { url: clave.url, key: clave.key } : null;
    cacheDeClavePorLinea.set(instanceName, { valor, at: Date.now() });
    return valor ? { apiKeyData: valor, instanceName } : context;
  } catch (error) {
    console.error("[resolverContexto]", error);
    return context;
  }
}

async function requireCurrentUser() {
  const user = await currentUser();
  if (!user) {
    throw new Error("No autorizado.");
  }

  return user;
}

/**
 * De que cuenta son los mensajes de esta linea.
 *
 * Esto decidia con `hasReadyContext`, que es "el contexto trae clave de
 * Evolution". Y una linea de WhatsApp Mensajeria (Waha) NO trae clave a
 * proposito, asi que para ellas nunca se resolvia el dueno y se leia con la
 * cuenta de quien mira. Cuando la linea es de una cuenta vinculada -lo normal
 * en un administrador que atiende varias empresas- los mensajes estan guardados
 * bajo la cuenta duena y la consulta volvia CORRECTA Y VACIA: la fila salia en
 * la lista, con su ultimo mensaje, y la conversacion se abria en blanco o
 * congelada en el ultimo mensaje que si era de su cuenta.
 *
 * Se notaba solo con Waha porque con Evolution el contexto SI trae clave, y
 * entonces el dueno se resolvia bien. Cambiar de proveedor "rompia" la
 * conversacion sin tocar un solo mensaje.
 *
 * La clave no dice de quien es la linea: eso lo dice la propia linea. Se
 * resuelve siempre, y **solo se acepta si quien mira tiene acceso a esa
 * cuenta**; si no, se usa la suya, como antes.
 */
async function resolveChatStorageUserId(
  context: ChatActionContext,
  fallbackUserId?: string | null,
) {
  const instanceName = context?.instanceName?.trim();
  if (!instanceName) return fallbackUserId ?? null;

  try {
    const owner = await resolveInstanceOwner(instanceName);
    if (!owner?.userId) return fallbackUserId ?? null;
    if (owner.userId === fallbackUserId) return owner.userId;

    // Nunca se lee la cuenta de otro por mandar el nombre de su linea.
    const user = await currentUser();
    if (!user?.id) return fallbackUserId ?? null;
    const cuentas = await getAssociatedAccountIds(user);
    if (!cuentas.includes(owner.userId)) {
      console.warn("[chats] linea de una cuenta a la que no se tiene acceso", {
        instanceName,
        dueno: owner.userId,
      });
      return fallbackUserId ?? null;
    }
    return owner.userId;
  } catch (error) {
    console.warn("[chats] no se pudo resolver la cuenta de la linea", {
      instanceName,
      error: String(error),
    });
    return fallbackUserId ?? null;
  }
}

/**
 * A qué destinatario se le entrega el mensaje.
 *
 * Manda al NÚMERO siempre que se sepa. El `@lid` —la identidad interna que
 * WhatsApp le da a un contacto— solo se usa cuando no hay número, que es el
 * único caso en que hace falta.
 *
 * Antes era al revés: si el chat tenía `@lid`, se enviaba ahí. Evolution acepta
 * ese envío y devuelve OK, pero WhatsApp lo marca fallido después, así que el
 * mensaje salía con el aspa roja y no le llegaba a nadie. Solo pasaba en los
 * chats que tenían `@lid`; a un número sin él llegaba al instante.
 */
/**
 * Destinatarios ya confirmados con WhatsApp, para no preguntar en cada mensaje.
 *
 * La consulta solo hace falta una vez por contacto: la identidad de un número no
 * cambia de un mensaje al siguiente. Media hora es de sobra para una
 * conversación y evita que un cambio raro se quede pegado para siempre.
 */
const destinatariosConfirmados = new Map<string, { jid: string; expira: number }>();
const VIGENCIA_DESTINATARIO_MS = 30 * 60_000;

/**
 * El destinatario tal y como lo reconoce WhatsApp hoy.
 *
 * Un chat abierto hace meses puede tener guardada una forma del número que ya no
 * existe —los móviles mexicanos perdieron el 1 de `52 1 XXXXXXXXXX`—. WhatsApp
 * acepta el envío a la forma vieja y lo marca fallido después, así que el
 * mensaje salía con el aspa roja sin que le llegara a nadie y sin error que
 * mirar. No hay regla que valga para decidirlo desde aquí: hay contactos que
 * conservan el 1 y otros que no, así que se pregunta.
 *
 * Si la consulta falla o tarda, se envía igual con lo que había: es una mejora
 * del acierto, no un requisito para poder escribir.
 */
async function destinatarioSegunWhatsApp(
  context: Exclude<ChatActionContext, null>,
  remoteJid: string,
): Promise<string> {
  if (!/@s\.whatsapp\.net$/i.test(remoteJid)) return remoteJid;

  const clave = `${context.instanceName}::${remoteJid}`;
  const enCache = destinatariosConfirmados.get(clave);
  if (enCache && enCache.expira > Date.now()) return enCache.jid;

  const confirmado = await resolveWhatsAppJid(
    context.apiKeyData,
    context.instanceName,
    remoteJid,
  );
  const elegido = confirmado || remoteJid;

  destinatariosConfirmados.set(clave, {
    jid: elegido,
    expira: Date.now() + VIGENCIA_DESTINATARIO_MS,
  });

  return elegido;
}

/**
 * A qué destinatario se le entrega el mensaje.
 *
 * Manda al NÚMERO siempre que se sepa. El `@lid` —la identidad interna que
 * WhatsApp le da a un contacto— solo se usa cuando no hay número, que es el
 * único caso en que hace falta.
 *
 * Antes era al revés: si el chat tenía `@lid`, se enviaba ahí. Evolution acepta
 * ese envío y devuelve OK, pero WhatsApp lo marca fallido después, así que el
 * mensaje salía con el aspa roja y no le llegaba a nadie. Solo pasaba en los
 * chats que tenían `@lid`; a un número sin él llegaba al instante.
 */
async function resolveTransportRemoteJid(params: {
  userId?: string | null;
  instanceName: string;
  remoteJid: string;
  context?: Exclude<ChatActionContext, null>;
}) {
  const esNumero = /@s\.whatsapp\.net$/i.test(params.remoteJid);
  if (esNumero) {
    return params.context
      ? destinatarioSegunWhatsApp(params.context, params.remoteJid)
      : params.remoteJid;
  }

  const candidates = buildWhatsAppJidCandidates(params.remoteJid);
  if (!params.userId || !params.instanceName || candidates.length === 0) {
    return params.remoteJid;
  }

  const rows = await db.$queryRaw<{ remoteJid: string }[]>`
    SELECT ("raw"->'key'->>'remoteJid') AS "remoteJid"
    FROM "chat_messages"
    WHERE "userId" = ${params.userId}
      AND "instanceName" = ${params.instanceName}
      AND (
        "remoteJid" IN (${Prisma.join(candidates)})
        OR "remoteJidAlt" IN (${Prisma.join(candidates)})
        OR "senderPn" IN (${Prisma.join(candidates)})
      )
      AND ("raw"->'key'->>'remoteJid') LIKE '%@lid'
    ORDER BY "messageTimestamp" DESC, "id" DESC
    LIMIT 1
  `;

  return rows[0]?.remoteJid || params.remoteJid;
}

async function buildPersistedMessagesResult(params: {
  userIds: string[];
  instanceName?: string;
  remoteJid: string;
  aliases?: string[];
  page: number;
  pageSize: number;
  message: string;
}): Promise<SuccessfulFindMessagesResult> {
  const persisted = await getPersistedMessages({
    userIds: params.userIds,
    instanceName: params.instanceName,
    remoteJid: params.remoteJid,
    aliases: params.aliases,
    skip: (params.page - 1) * params.pageSize,
    take: params.pageSize + 1,
  });
  const hasMore = persisted.length > params.pageSize;
  const data = hasMore ? persisted.slice(0, params.pageSize) : persisted;

  return {
    success: true,
    message: params.message,
    data,
    total: data.length,
    pages: hasMore ? params.page + 1 : params.page,
    currentPage: params.page,
    nextPage: hasMore ? params.page + 1 : null,
    queriedRemoteJid: params.remoteJid,
  };
}

/**
 * El historial que Waha ya tiene de un chat, traido a nuestra base.
 *
 * Una linea recien escaneada empieza VACIA: su conversacion solo se llena con
 * lo que entre por el webhook de ahi en adelante. Pero WhatsApp manda al
 * vincular una ventana del historial, y el motor de Waha la guarda; esto es lo
 * que la pide y la persiste, para que la conversacion se abra con lo de antes
 * igual que hacia Evolution.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Se persiste con `puedeReabrir: false`.** Esto es resincronizar
 *    historial, no novedad: sin eso, cada importacion volveria a poner
 *    `status = true` y despausaria la IA de conversaciones que un asesor habia
 *    pausado. Es la regla de siempre.
 * 2. **Con freno.** El sondeo del chat abierto entra aqui cada 5 s; pedirle el
 *    historial a Waha en cada vuelta es maltratar el servidor para traer lo
 *    mismo. Se hace una vez por chat cada `IMPORTAR_HISTORIAL_CADA_MS`, y
 *    siempre que se pidan paginas anteriores (ahi es justo lo que se busca).
 * 3. **Nunca rompe la conversacion.** Si Waha falla, se anota y se sigue con lo
 *    guardado: un historial incompleto es mejor que una pantalla en blanco.
 */
const IMPORTAR_HISTORIAL_CADA_MS = 60 * 1000;
const ultimaImportacionDeChat = new Map<string, number>();

async function traerHistorialDeWaha(params: {
  userId: string;
  instanceName: string;
  remoteJid: string;
  pageSize: number;
  page: number;
  yaCargados: number;
}): Promise<number> {
  const clave = `${params.instanceName}|${params.remoteJid}`;
  const ahora = Date.now();
  const dePaginaAnterior = params.page > 1;
  if (!dePaginaAnterior && ahora - (ultimaImportacionDeChat.get(clave) ?? 0) < IMPORTAR_HISTORIAL_CADA_MS) {
    return 0;
  }
  ultimaImportacionDeChat.set(clave, ahora);

  const chatId = canonicalToWahaJid(params.remoteJid);
  if (!chatId) return 0;

  const traida = await getWahaChatMessages({
    session: params.instanceName,
    chatId,
    limit: Math.max(params.pageSize, 100),
    // Para "cargar mensajes anteriores" se salta lo que ya esta en pantalla.
    offset: dePaginaAnterior ? params.yaCargados : 0,
  });
  if (!traida.ok) {
    console.warn("[waha] no se pudo traer el historial del chat", {
      instanceName: params.instanceName,
      remoteJid: params.remoteJid,
      motivo: traida.message,
    });
    return 0;
  }

  let guardados = 0;
  for (const crudo of traida.mensajes) {
    const mensaje = mensajeDeWahaParaGuardar(crudo, params.remoteJid);
    if (!mensaje) continue;
    try {
      await persistChatMessage({
        userId: params.userId,
        instanceName: params.instanceName,
        instanceType: "waha",
        remoteJid: params.remoteJid,
        messageId: mensaje.messageId,
        fromMe: mensaje.fromMe,
        messageType: mensaje.messageType,
        content: mensaje.content,
        mediaUrl: mensaje.mediaUrl,
        raw: mensaje.raw as any,
        messageTimestamp: mensaje.messageTimestamp,
        puedeReabrir: false,
      });
      guardados++;
    } catch (error) {
      console.warn("[waha] no se pudo guardar un mensaje del historial", {
        instanceName: params.instanceName,
        messageId: mensaje.messageId,
        error: String(error),
      });
    }
  }

  if (guardados > 0) {
    console.info("[waha] historial del chat traido", {
      instanceName: params.instanceName,
      remoteJid: params.remoteJid,
      mensajes: guardados,
      pagina: params.page,
    });
  }
  return guardados;
}

/**
 * Transcribir UNA nota de voz, porque alguien pulsó su botón.
 *
 * Antes esto no existía: un paso de fondo transcribía toda nota que entrara, en
 * cada vuelta del reloj de la conversación abierta, **la leyera alguien o no**.
 * Con decenas de clientes por cuenta eso es plata que se va sola, y encima la
 * paga entera la cuenta dueña de la línea.
 *
 * Es el mismo trato que el chat del equipo, y comparte con él la tarifa
 * (`costoDeLaNota`), la lectura de créditos y el descuento
 * (`lib/creditos-de-transcripcion`). Con una copia en cada sitio, el día que
 * cambie el precio uno de los dos cobraría otra cosa — y eso no se ve: se nota
 * meses después en la factura.
 *
 * Cuatro cosas que hay que mantener:
 *
 * 1. **Se guarda, así que solo se paga una vez.** La lectura del texto ya
 *    pagado va **antes** de resolver créditos y de bajar nada: en cuanto
 *    alguien la pide una vez, ese es el camino común, y en una cuenta con
 *    varios asesores la misma nota se pagaría una vez por cada uno.
 * 2. **Se cobra DESPUÉS de tener el texto.** Cobrar antes y que la llamada
 *    falle sería cobrar por algo que no se entregó.
 * 3. **Un fallo no deja marca y no cobra.** Aquí la pidió una persona, así que
 *    un tropiezo de hoy —la red, OpenAI— se reintenta pulsando otra vez. Era
 *    justo lo contrario lo que dejaba una nota con «No se pudo transcribir.»
 *    para siempre.
 * 4. **Paga la cuenta DUEÑA DE LA LÍNEA**, que es la que recibe el mensaje. Un
 *    asesor de una cuenta vinculada abriendo este chat no puede cargarle el
 *    consumo a la suya.
 */
export async function transcribirNotaDeChatAction(
  context: ChatActionContext,
  remoteJid: string,
  messageId: string,
  options?: { remoteJidAliases?: string[] },
): Promise<
  | { success: true; transcripcion: string; yaEstaba: boolean }
  | { success: false; motivo: NoSeTranscribio; message: string }
> {
  const no = (
    motivo: NoSeTranscribio,
    detalle?: { hacenFalta?: number; quedan?: number },
  ) => ({ success: false as const, motivo, message: porQueNoSeTranscribio(motivo, detalle) });

  try {
    const user = await requireCurrentUser();
    context = await resolverContexto(context);

    const instanceName = context?.instanceName?.trim();
    const id = String(messageId ?? "").trim();
    if (!instanceName || !remoteJid?.trim()) return no("sin_linea");
    if (!id) return no("no_es_nota");

    // De quién es la línea. Es la MISMA puerta que el resto de Chats: quien no
    // alcanza esa cuenta no lee sus mensajes, así que tampoco gasta sus
    // créditos. `resolveChatStorageUserId` ya comprueba el acceso y se cae a la
    // cuenta de quien mira cuando no lo hay.
    const duenoDeLaLinea = await resolveChatStorageUserId(context, user.id);
    if (!duenoDeLaLinea) return no("sin_linea");
    const readUserIds = Array.from(new Set([duenoDeLaLinea, user.id].filter(Boolean) as string[]));

    const nota = await laNotaDeVoz({
      userIds: readUserIds,
      instanceName,
      messageId: id,
      candidatos: buildWhatsAppJidCandidates(remoteJid, options?.remoteJidAliases ?? []),
    });
    if (!nota) return no("no_es_nota");

    // Ya pagada. Ni créditos, ni descarga, ni OpenAI.
    if (nota.transcripcion) {
      return { success: true, transcripcion: nota.transcripcion, yaEstaba: true };
    }

    // La comprobación va en CRÉDITOS y nunca toca `used` y `total` en la misma
    // expresión — es la regla explícita del CLAUDE.md, y el fallo que ya costó
    // caro en el voicebot.
    const quedan = await losCreditosQueQuedan(duenoDeLaLinea);
    const que = queHacerConLaNota({
      segundos: nota.segundos,
      creditosDisponibles: quedan,
    });
    if (que.hacer === "saltar") return no("muy_larga");
    if (que.hacer === "esperar") {
      const costo = costoDeLaNota(nota.segundos);
      return no("sin_creditos", { hacenFalta: costo.creditos, quedan: quedan ?? 0 });
    }

    const clave = await laClaveDeOpenAi(duenoDeLaLinea);
    if (!clave) return no("sin_ia");

    const audio = await bajarElAudioDeLaNota({
      mediaUrl: nota.mediaUrl,
      instanceName,
      messageId: nota.messageId,
      apiKeyData: hasReadyContext(context)
        ? { url: context.apiKeyData.url, key: context.apiKeyData.key }
        : null,
    });
    if (!audio) return no("no_bajo");

    const texto = await pedirleElTextoAOpenAi({
      audio: audio.bytes,
      clave,
      nombre: audio.nombre,
    });
    if (!texto) return no("no_transcribio");

    // El `WHERE` del guardado es lo que impide pagarla dos veces: con dos
    // asesores pulsando a la vez, solo una llamada escribe y solo esa descuenta.
    const laEscribiEsta = await guardarLaTranscripcion(nota.fila, texto);

    if (quedan !== null && laEscribiEsta) {
      await descontarLaTranscripcion(duenoDeLaLinea, que.costo.tokens);
    }

    console.info("[chats] nota de voz transcrita", {
      messageId: nota.messageId,
      linea: instanceName,
      paga: duenoDeLaLinea,
      segundos: nota.segundos,
      creditos: quedan === null ? "ilimitados" : laEscribiEsta ? que.costo.creditos : 0,
    });

    return { success: true, transcripcion: texto, yaEstaba: !laEscribiEsta };
  } catch (error) {
    // Una acción no solo devuelve `success: false`: puede reventar. Y un fallo
    // mudo aquí se lee como un botón que no hace nada.
    console.warn("[chats] no se pudo transcribir la nota de voz", {
      messageId,
      error: error instanceof Error ? error.message : String(error),
    });
    return no("no_transcribio");
  }
}

export async function warmChatMessagesAction(
  context: ChatActionContext,
  remoteJid: string,
  options?: { page?: number; pageSize?: number; remoteJidAliases?: string[]; localOnly?: boolean; localFirst?: boolean },
): Promise<FindMessagesResult> {
  // Cuanto tarda cada parte. Viaja en la respuesta para que la consola del
  // navegador diga de donde viene la espera cuando la consulta va lenta.
  const arrancoTotal = Date.now();
  const tiempos: Record<string, number | string> = {};
  const conTiempos = <T extends FindMessagesResult>(resultado: T, fuente: string): T => ({
    ...resultado,
    tiempos: { ...tiempos, total: Date.now() - arrancoTotal, fuente },
  });

  context = await resolverContexto(context);
  // WhatsApp Mensajeria: Waha solo manda la presencia (escribiendo / grabando)
  // de los chats suscritos. Se suscribe al abrir; la libreria lo recuerda.
  if (!hasReadyContext(context) && context?.instanceName && (await esLineaWaha(context.instanceName))) {
    void subscribeWahaPresence(context.instanceName, canonicalToWahaJid(remoteJid));
  }
  const user = await currentUser();
  const effectiveOwnerId = await resolveChatStorageUserId(context, user?.ownerId ?? user?.id);
  tiempos.contexto = Date.now() - arrancoTotal;
  // Conjunto de cuentas bajo las que puede vivir el historial: el dueño resuelto
  // de la línea (donde se guarda ahora) + el owner/id del que ve (donde pudo
  // guardarse antes de que cambiara la propiedad de la línea). Así no se pierde
  // el historial viejo tras el cambio de dueño.
  const readUserIds = Array.from(
    new Set([effectiveOwnerId, user?.ownerId, user?.id].filter(Boolean) as string[]),
  );
  const pageSize = options?.pageSize ?? DEFAULT_CHAT_MESSAGE_PAGE_SIZE;
  const page = Math.max(options?.page ?? 1, 1);

  if (effectiveOwnerId) {
    // localFirst: leer local y, SI hay datos, devolverlos ya (apertura instantánea);
    // si está VACÍO, cae al fetch remoto de abajo en la MISMA llamada (evita el 2º
    // round-trip que hacía el cliente al abrir un chat sin historial local).
    const shouldReadLocal =
      Boolean(options?.localOnly) || Boolean(options?.localFirst) || page > 1 || !hasReadyContext(context);

    if (shouldReadLocal) {
      const arrancoBase = Date.now();
      const localResult = await buildPersistedMessagesResult({
        userIds: readUserIds,
        instanceName: hasReadyContext(context) ? context.instanceName : undefined,
        remoteJid,
        aliases: options?.remoteJidAliases,
        page,
        pageSize,
        message: "Mensajes cargados desde historial local.",
      });
      tiempos.base = Date.now() - arrancoBase;

      // Aqui corria el paso que transcribia SOLAS las notas de voz que
      // entraran, de fondo y en cada vuelta del reloj. Se quito: transcribia
      // todo lo que llegaba, **lo leyera alguien o no**, y con decenas de
      // clientes por cuenta eso es una factura que nadie pidio. Ahora va bajo
      // demanda, con su boton y su precio delante
      // (`transcribirNotaDeChatAction`).

      // WhatsApp Mensajeria (waha): el historial que ya tiene WhatsApp.
      //
      // Aqui no hay Evolution a la que preguntar, asi que sin esto la
      // conversacion solo ensena lo que haya entrado por el webhook desde que
      // se conecto la linea: una linea recien escaneada se abre VACIA aunque el
      // telefono tenga la conversacion entera. Se pide a Waha, se guarda, y se
      // vuelve a leer nuestra base, que es la que manda.
      //
      // ## Solo cuando NO hay nada que enseñar, o cuando se piden anteriores
      //
      // Esto es un RELLENO, y estaba corriendo siempre. Dos cosas lo hacian
      // caro, y las dos a la vez:
      //
      // 1. Va ANTES del `return` que devuelve lo local, asi que corria tambien
      //    con la conversacion ya entera en nuestra base: 100 mensajes pedidos
      //    a Waha y guardados DE UNO EN UNO cada 60 s, por chat, para reescribir
      //    lo que ya estaba. Y siempre los mismos: `offset` solo se mueve al
      //    pedir paginas anteriores, asi que ni siquiera iba rellenando hacia
      //    atras.
      // 2. Lo llamaba tambien el PREFETCH de la lista, que pasa `localFirst` y
      //    se dispara por cada fila que se hace visible. La rama de Evolution si
      //    mira `localFirst`; a esta se le habia pasado. Con decenas de filas
      //    visibles eso son miles de escrituras por minuto contra un pool de 10
      //    conexiones, y de ahi que TODO lo demas se viera lento: la bandeja
      //    entre 517 y 1.153 ms para la misma consulta, y las cuatro consultas
      //    de sesiones rondando el segundo cada una. No eran consultas lentas:
      //    era espera por conexion.
      //
      // El relleno sigue donde hace falta: una conversacion que no tiene nada
      // guardado (la linea recien escaneada, el contacto que escribe por primera
      // vez) y el boton de «Cargar mensajes anteriores», que pide `page > 1`.
      // Lo que llega NUEVO no depende de esto: lo guarda el webhook del backend,
      // que va siempre encendido.
      const noHayNadaQueEnsenar = localResult.data.length === 0;
      const pideMasAntiguos = page > 1;
      if (
        !options?.localOnly &&
        (noHayNadaQueEnsenar || pideMasAntiguos) &&
        context?.instanceName &&
        !hasReadyContext(context) &&
        (await esLineaWaha(context.instanceName))
      ) {
        const arrancoWaha = Date.now();
        const traidos = await traerHistorialDeWaha({
          userId: effectiveOwnerId,
          instanceName: context.instanceName,
          remoteJid,
          pageSize,
          page,
          yaCargados: localResult.data.length,
        });
        tiempos.waha = Date.now() - arrancoWaha;
        if (traidos > 0) {
          const conHistorial = await buildPersistedMessagesResult({
            userIds: readUserIds,
            instanceName: context.instanceName,
            remoteJid,
            aliases: options?.remoteJidAliases,
            page,
            pageSize,
            message: "Mensajes cargados desde historial local.",
          });
          return conTiempos(conHistorial, "waha + base");
        }
      }

      // localOnly siempre devuelve local (aunque vacío); localFirst solo si hay datos.
      if (localResult.data.length || options?.localOnly) {
        // Este es el camino que puede dejar una conversación congelada durante
        // horas sin que nadie se entere: se devuelve lo guardado y NO se le
        // pregunta a Evolution. Con `localOnly`/`localFirst` es lo pedido y está
        // bien. Pero si se llega aquí porque el contexto no tiene clave
        // resuelta, el sondeo normal —que sí quiere lo último— acaba recibiendo
        // siempre lo mismo, con `success: true` y sin un solo error.
        if (!options?.localOnly && !options?.localFirst) {
          console.warn(
            "[chats] conversación servida SOLO desde la base: sin clave/instancia para preguntar a Evolution.",
            {
              remoteJid,
              instancia: context?.instanceName ?? "(sin instancia)",
              tieneClave: Boolean(context?.apiKeyData?.url && context?.apiKeyData?.key),
              mensajes: localResult.data.length,
            },
          );
        }
        return conTiempos(localResult, "base (pedida)");
      }
    }
  }

  if (!hasReadyContext(context)) {
    return conTiempos(
      {
        success: false,
        message: "No hay instancia o API key configurada para cargar mensajes.",
        queriedRemoteJid: remoteJid,
      },
      "sin contexto",
    );
  }

  // En la sincronización inicial (página 1) traemos una ventana amplia de Evolution
  // y la persistimos, para que el scroll-back posterior (que lee de la BD local)
  // disponga de suficiente historial. En páginas posteriores se respeta el tamaño
  // recibido para no descuadrar el offset que Evolution aplica por página.
  const fetchOptions =
    page === 1
      ? { ...options, pageSize: Math.max(options?.pageSize ?? 0, EVOLUTION_SYNC_WINDOW_SIZE) }
      : options;
  // Se le pregunta a Evolution y a NUESTRA base a la vez.
  //
  // Evolution responde por la identidad exacta que se le pide, y un contacto
  // tiene varias -su numero, su `@lid`, su senderPn-. Si el mensaje entro por
  // una y se pregunta por otra, contesta que si, correctamente, y con cero
  // mensajes. Nuestra base guarda cada mensaje con todas sus identidades, asi
  // que es la que sabe contestar cuando la otra se queda corta.
  //
  // En paralelo y no en fila: preguntar a la base es barato y asi no le suma
  // espera a la apertura del chat, que es lo que se cuido al escribir esto.
  //
  // Y en paralelo DE VERDAD: con `Promise.all` la respuesta de nuestra base
  // -que suele estar lista en milisegundos y que ya tiene el mensaje, porque el
  // webhook lo guardo al llegar- se quedaba esperando a Evolution. Si Evolution
  // tardaba, la vuelta entera tardaba, el cliente se rendia a los 15s y tiraba
  // la respuesta a la basura. La conversacion se quedaba minutos parada
  // teniendo el mensaje guardado a un palmo.
  //
  // Es la misma regla de siempre -cuando Evolution se queda corta, manda
  // nuestra base- aplicada al tiempo y no al contenido.
  const arrancoEvolution = Date.now();
  const promesaEvolution = findMessagesByRemoteJid(
    context.apiKeyData,
    context.instanceName,
    remoteJid,
    { ...fetchOptions, timeoutMs: ESPERA_MAXIMA_DE_EVOLUTION },
  );
  // El fallo se atiende aqui mismo para que la promesa nunca quede sin `catch`:
  // se queda corriendo de fondo cuando se contesta con la base, y una promesa
  // rechazada sin nadie escuchando tumba el proceso de Node.
  const promesaEvolutionSegura = promesaEvolution
    .catch(
      (error): FindMessagesResult => ({
        success: false,
        message: error instanceof Error ? error.message : "Evolution no respondio.",
        queriedRemoteJid: remoteJid,
      }),
    )
    .then((respuesta) => {
      tiempos.evolution = Date.now() - arrancoEvolution;
      return respuesta;
    });

  const arrancoBase = Date.now();
  const respaldoLocal = effectiveOwnerId
    ? await buildPersistedMessagesResult({
        userIds: readUserIds,
        instanceName: context.instanceName,
        remoteJid,
        aliases: options?.remoteJidAliases,
        page,
        pageSize,
        message: "Mensajes cargados desde historial local.",
      }).catch(() => null)
    : null;
  tiempos.base = Date.now() - arrancoBase;

  // Ya con la base en la mano, a Evolution se le da un margen corto. Si no
  // llega, se contesta con lo guardado y ella sigue de fondo: lo que traiga se
  // persiste igual y la siguiente vuelta del reloj lo recoge.
  // El atajo de los 6s SOLO vale si hay algo guardado que enseñar.
  //
  // Sin esa condicion, un chat sin historial local -un contacto que acaba de
  // escribir por primera vez, que es justo el caso mas comun de la bandeja- se
  // rendia a los 6s y devolvia un fallo, TRES SEGUNDOS ANTES del plazo de la
  // propia Evolution. La conversacion se abria en blanco aunque Evolution
  // fuera a contestar. Si no hay nada local, no hay atajo: se espera a
  // Evolution hasta su corte.
  const result = respaldoLocal?.data.length
    ? await Promise.race([
        promesaEvolutionSegura,
        new Promise<null>((resolver) =>
          setTimeout(() => resolver(null), MARGEN_ANTES_DE_TIRAR_DE_LA_BASE),
        ),
      ])
    : await promesaEvolutionSegura;

  if (!result) {
    void promesaEvolutionSegura.then((tardia) => {
      if (!tardia.success || !effectiveOwnerId) return;
      return persistEvolutionMessages({
        userId: effectiveOwnerId,
        instanceName: context.instanceName,
        instanceType: "evolution",
        remoteJid,
        messages: tardia.data,
      }).catch(() => {});
    });

    console.warn(
      "[chats] Evolution tardo demasiado: se contesta con nuestra base.",
      {
        remoteJid,
        instancia: context.instanceName,
        mensajes: respaldoLocal?.data.length ?? 0,
      },
    );

    // Aqui SIEMPRE hay respaldo: sin el no se corre la carrera.
    tiempos.evolution = `>${MARGEN_ANTES_DE_TIRAR_DE_LA_BASE} (sigue de fondo)`;
    return conTiempos(respaldoLocal!, "base (Evolution tardo)");
  }

  if (result.success && effectiveOwnerId) {
    // Camino crítico de la PRIMERA apertura: se devuelve YA lo que respondió
    // Evolution, sin esperar a persistir + re-leer de la BD (eso agregaba ~100-300ms
    // encima del round-trip a Evolution). La persistencia corre en segundo plano y
    // la resync/poll posterior lee de local y reconcilia (dedup por messageId,
    // badges de eliminado, mediaUrl). Para un chat fresco el contenido es
    // equivalente (findMessagesByRemoteJid ya filtró reacciones y ordenó recientes
    // primero; nextPage=null coincide con lo que daría la BD con ≤25 filas).
    void persistEvolutionMessages({
      userId: effectiveOwnerId,
      instanceName: context.instanceName,
      instanceType: "evolution",
      remoteJid,
      messages: result.data,
    }).catch(() => {
      // best-effort: si falla, la próxima sync/poll vuelve a intentarlo (idempotente).
    });

    // Si la base tiene algo que Evolution no trajo -o algo mas nuevo-, manda la
    // base. Es el caso del contacto con varias identidades: la conversacion
    // salia vacia, o congelada, mientras el mensaje estaba guardado.
    // En la MISMA unidad las dos partes. Se comparaba en crudo, y las dos listas
    // vienen de sitios distintos: la nuestra sella en segundos
    // (`dateToEpochSeconds`) y Evolution manda unas veces segundos y otras
    // milisegundos. Con el mensaje nuevo guardado en segundos y los viejos de
    // Evolution en milisegundos, los viejos salian mil veces mayores y ganaban:
    // se devolvia la respuesta de Evolution SIN el mensaje, que se quedaba en la
    // base sin llegar nunca a la pantalla. La conversacion se veia congelada
    // mientras el mensaje ya estaba guardado.
    const masNuevo = (lista: { messageTimestamp?: number | null }[]) =>
      lista.reduce((max, m) => Math.max(max, epochToMs(m.messageTimestamp)), 0);

    if (
      respaldoLocal?.data.length &&
      (result.data.length === 0 || masNuevo(respaldoLocal.data) > masNuevo(result.data))
    ) {
      return conTiempos(respaldoLocal, "base (mas nueva que Evolution)");
    }

    return conTiempos(result, "evolution");
  }

  if (!result.success && respaldoLocal?.data.length) {
    return conTiempos(respaldoLocal, "base (Evolution fallo)");
  }

  return conTiempos(result, result.success ? "evolution" : "evolution (fallo)");
}

/**
 * Los chats que Waha ya tiene, traidos a nuestra base.
 *
 * Solo el ULTIMO mensaje de cada uno: es lo que hace falta para que la fila
 * exista, se ordene y ensene su linea de resumen. El resto de la conversacion
 * llega al abrirla (`traerHistorialDeWaha`), y asi importar una cuenta grande
 * no se convierte en miles de escrituras de golpe.
 *
 * El freno ya no es un reloj: es la base. Se rellena solo si esa linea no tiene
 * historial nuestro todavia (`laLineaYaTieneHistorial`). Y no corre en el
 * camino de la lista: quien la llama la lanza sin esperarla.
 */
/**
 * Cuanto puede durar el relleno antes de cortarse.
 *
 * Es una GUARDA, no el arreglo: el arreglo es que esto ya no corre en el camino
 * de la lista. Aun de fondo, 300 escrituras en fila retienen una conexion en un
 * proceso de un solo hilo con un pool de 10, y eso conviene acotarlo.
 *
 * Generoso a proposito: un relleno normal de 300 chats cabe entero, asi que
 * cortarse es el caso raro y no el habitual. Eso importa por lo de abajo.
 */
const PLAZO_DEL_RELLENO_MS = 15000;

/**
 * Lineas cuyo relleno se corto por plazo y hay que continuar.
 *
 * En memoria A PROPOSITO, y no es una vuelta al guardia de antes: esto es una
 * CONTINUACION, no el freno. El freno es la base (`laLineaYaTieneHistorial`).
 * Si el proceso muere con un relleno a medias, la linea se queda con lo mas
 * reciente guardado -que es lo que se ordena primero- y el resto no vuelve.
 */
const rellenoAContinuar = new Set<string>();

/**
 * Si esta linea ya tiene historial nuestro.
 *
 * Sustituye al reloj de 30 minutos que vivia en un `Map` por proceso, y que
 * estaba roto en la practica: con dos replicas corria el doble, y se borraba en
 * cada despliegue -que aqui son decenas al dia-, asi que casi nunca llegaba a
 * cumplir su media hora.
 *
 * Preguntarle a la base no tiene ninguno de esos problemas: se comparte entre
 * replicas sola y sobrevive a los reinicios. Y encaja con para que existe esto:
 * rellenar una linea recien escaneada que sale con cero chats. Lo que va
 * llegando despues entra por el webhook, no por aqui.
 */
async function laLineaYaTieneHistorial(userId: string, instanceName: string): Promise<boolean> {
  try {
    const fila = await db.chatMessage.findFirst({
      where: { userId, instanceName },
      select: { id: true },
    });
    return !!fila;
  } catch (error) {
    // Si no se puede comprobar, NO se rellena: equivocarse hacia el lado de no
    // escribir es barato; hacia el otro son 300 escrituras de mas por vuelta.
    console.warn("[waha] no se pudo comprobar si la linea ya tiene historial", {
      instanceName,
      error: String(error),
    });
    return true;
  }
}

async function traerChatsDeWaha(params: { userId: string; instanceName: string }): Promise<void> {
  const continuando = rellenoAContinuar.has(params.instanceName);
  if (!(await esLineaWaha(params.instanceName))) return;
  if (!continuando && (await laLineaYaTieneHistorial(params.userId, params.instanceName))) return;

  const traidos = await getWahaChats({ session: params.instanceName, limit: TOPE_DE_LA_BANDEJA });
  if (!traidos.ok) {
    console.warn("[waha] no se pudo traer la lista de chats", {
      instanceName: params.instanceName,
      motivo: traidos.message,
    });
    return;
  }

  // Del mas RECIENTE al mas viejo, antes de empezar a escribir.
  //
  // Hasta ahora el bucle se fiaba del orden en que los devolviera Waha, que no
  // esta verificado. Ordenando aqui, lo que el plazo deje fuera es siempre lo
  // mas antiguo -lo que menos se mira- en vez de lo que toque.
  const ordenados = [...traidos.chats].sort(
    (a, b) => Number(b.lastMessage?.timestamp ?? 0) - Number(a.lastMessage?.timestamp ?? 0),
  );

  const arrancoElRelleno = Date.now();
  let cortadoPorPlazo = false;
  let guardados = 0;
  for (const chat of ordenados) {
    if (Date.now() - arrancoElRelleno > PLAZO_DEL_RELLENO_MS) {
      cortadoPorPlazo = true;
      break;
    }
    const jid = jidDelChatDeWaha(chat.id);
    if (!jid) continue;
    const ultimo = chat.lastMessage;
    if (!ultimo) continue;
    const mensaje = mensajeDeWahaParaGuardar(ultimo, jid);
    if (!mensaje) continue;
    try {
      await persistChatMessage({
        userId: params.userId,
        instanceName: params.instanceName,
        instanceType: "waha",
        remoteJid: jid,
        messageId: mensaje.messageId,
        fromMe: mensaje.fromMe,
        messageType: mensaje.messageType,
        content: mensaje.content,
        mediaUrl: mensaje.mediaUrl,
        pushName: typeof chat.name === "string" ? chat.name : undefined,
        raw: mensaje.raw as any,
        messageTimestamp: mensaje.messageTimestamp,
        // Resincronizar historial NO es novedad: esto no despausa la IA.
        puedeReabrir: false,
      });
      guardados++;
    } catch (error) {
      console.warn("[waha] no se pudo guardar un chat del historial", {
        instanceName: params.instanceName,
        remoteJid: jid,
        error: String(error),
      });
    }
  }

  // Si se corto, la vuelta siguiente CONTINUA: sellar aqui convertiria una
  // linea recien escaneada en 300 chats a plazos, que es no rellenarla.
  if (cortadoPorPlazo) rellenoAContinuar.add(params.instanceName);
  else rellenoAContinuar.delete(params.instanceName);

  console.info("[waha] lista de chats traida", {
    instanceName: params.instanceName,
    chats: traidos.chats.length,
    guardados,
    cortadoPorPlazo,
    continuando,
  });
}

/** El jid del chat, que Waha manda unas veces como cadena y otras como objeto. */
function jidDelChatDeWaha(id: unknown): string | null {
  const crudo =
    typeof id === "string"
      ? id
      : typeof (id as { _serialized?: unknown })?._serialized === "string"
        ? ((id as { _serialized: string })._serialized)
        : "";
  if (!crudo) return null;
  // Los estados, las difusiones y los canales no son conversaciones.
  if (/@(broadcast|newsletter)$/i.test(crudo)) return null;
  return wahaJidToCanonical(crudo) || null;
}

export async function refetchChatsManualAction(
  context: ChatActionContext,
): Promise<FetchChatsResult> {
  // Instrumentacion. La vuelta de la lista tardo 31 s para 6 lineas y desde el
  // navegador no hay forma de saber de quien es ese tiempo: Evolution y nuestra
  // propia base se ven igual desde fuera. Aqui cada parte lleva su reloj.
  const arrancoLaVuelta = Date.now();
  const tiempos: Record<string, number | string> = {};
  const medir = async <T,>(nombre: string, trabajo: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try {
      return await trabajo();
    } finally {
      tiempos[nombre] = Date.now() - t0;
    }
  };

  const user = await medir("acceso", () => currentUser());
  const effectiveOwnerId = await resolveChatStorageUserId(context, user?.ownerId ?? user?.id);
  // Mismo conjunto que la lectura de mensajes: no perder conversaciones viejas
  // guardadas bajo el userId anterior al cambio de dueño de la línea.
  const readUserIds = Array.from(
    new Set([effectiveOwnerId, user?.ownerId, user?.id].filter(Boolean) as string[]),
  );

  context = await medir("resolverContexto", () => resolverContexto(context));
  tiempos.linea = context?.instanceName?.trim() || "(sin nombre)";
  if (!hasReadyContext(context)) {
    if (readUserIds.length) {
      // Acotado A ESTA LINEA. Esta accion se ata por linea (`instActionCtx`),
      // asi que su respaldo tiene que devolver los chats de esa linea y no la
      // bandeja entera de la cuenta.
      //
      // Sin `instanceNames` devolvia TODO lo que la cuenta tenga guardado, o
      // sea tambien las lineas que ya no existen en `Instancias`: las borradas,
      // los restos con sufijo `_V2` y los canales `_wh` / `_tg` / `_fb` / `_ig`.
      // Esos chats salian en la lista sin tener linea a la que pertenecer, y por
      // eso el desplegable de canales no cuadraba (`[chats] hay chats de lineas
      // que no estan en el filtro de canales`).
      //
      // Y se cae aqui en cada vuelta del refresco de una linea Waha,
      // que a proposito se quedan sin clave de Evolution (ver `resolverContexto`).
      const laLinea = context?.instanceName?.trim();

      // WhatsApp Mensajeria (waha): los chats que ya tiene WhatsApp.
      //
      // La bandeja de una linea Waha sale ENTERA de nuestra base, asi que una
      // linea recien escaneada aparece con cero chats aunque el telefono tenga
      // cientos. Se le piden a Waha y se guarda el ultimo mensaje de cada uno:
      // con eso la fila existe, se ordena por su fecha y la conversacion se
      // completa al abrirla.
      //
      // **Se lanza y NO se espera**, y ese es el arreglo.
      //
      // Esto es un RELLENO, no la lista. Y estaba en medio del camino: medido
      // en produccion, `lista: VERZAY_NOTIFICACIONES` tardo 10.760 ms con solo
      // 257 ms de trabajo del servidor —el resto eran hasta 300
      // `persistChatMessage` de uno en uno—. El daño no era solo tardar: Next
      // encola las acciones de servidor DE UNA EN UNA
      // (`shared/lib/router/action-queue.js`), asi que esa linea bloqueaba a
      // todas las de atras. En esa misma carga, dos lineas seguian sin resolver
      // a los 45 segundos.
      //
      // Contestando ya con lo que hay en nuestra base, el relleno termina igual
      // -el proceso de Node es de larga vida- y la vuelta siguiente del reloj,
      // 20 s despues, recoge lo que haya escrito.
      //
      // El `catch` no es opcional: una promesa rechazada sin gestionar aqui se
      // la lleva el proceso entero por delante.
      tiempos.camino = "nuestra base";
      if (laLinea && effectiveOwnerId) {
        tiempos.relleno = "lanzado sin esperar";
        void traerChatsDeWaha({ userId: effectiveOwnerId, instanceName: laLinea }).catch(
          (error) => {
            console.warn("[waha] el relleno de la linea fallo", {
              instanceName: laLinea,
              error: String(error),
            });
          },
        );
      }

      const persisted = await medir("bandejaGuardada", () =>
        getPersistedInboxChats({
          userIds: readUserIds,
          instanceNames: laLinea ? [laLinea] : undefined,
        }),
      );
      if (persisted.length) {
        tiempos.total = Date.now() - arrancoLaVuelta;
        return {
          success: true,
          message: "Chats cargados desde historial local.",
          data: persisted,
          tiempos,
        };
      }
    }

    tiempos.total = Date.now() - arrancoLaVuelta;
    return {
      success: false,
      message: "No hay instancia o API key configurada para refrescar chats.",
      tiempos,
    };
  }

  tiempos.camino = "evolution";
  const result = await medir("evolution", () =>
    fetchChatsFromEvolution(context.apiKeyData, context.instanceName),
  );

  // Superponer el marcador "🚫 Mensaje eliminado" del inbox persistido sobre los
  // chats en vivo. Evolution devuelve el último mensaje de un borrado como stub
  // vacío (en la lista se veía "_"), pero nuestra BD conserva el estado. Se confía
  // en getPersistedInboxChats como fuente AUTORITATIVA: solo marca "eliminado"
  // cuando el último mensaje persistido está borrado (lastMessageDeleted, que se
  // resetea si llega un mensaje NUEVO). Por eso NO se compara timestamp con el
  // stub en vivo (Evolution a veces reporta la hora del revoke, más nueva que la
  // del mensaje original, lo que hacía que el marcador PARPADEARA a "_").
  const DELETED_LAST_MESSAGE_MARK = "🚫 Mensaje eliminado";
  if (result.success && readUserIds.length) {
    try {
      // Solo se necesitan los JIDs con la marca, no la bandeja entera: armarla
      // cruza conversaciones con sesiones y cuesta segundos, y esto corre en
      // cada refresco de la lista.
      const deleted = await medir("marcasDeBorrado", () =>
        getDeletedLastMessageJids({
          userIds: readUserIds,
          instanceName: context.instanceName,
        }),
      );
      const deletedJids = new Set<string>();
      for (const p of deleted) {
        for (const cand of buildWhatsAppJidCandidates(p.remoteJid, [p.remoteJidAlt, p.senderPn])) {
          deletedJids.add(cand);
        }
      }
      if (deletedJids.size) {
        for (const chat of result.data) {
          if (!chat.lastMessage) continue;
          const isDeleted = buildWhatsAppJidCandidates(chat.remoteJid, [
            chat.remoteJidAlt,
            chat.senderPn,
          ]).some((cand) => deletedJids.has(cand));
          if (!isDeleted) continue;
          chat.lastMessage = {
            ...chat.lastMessage,
            messageType: "conversation",
            message: { conversation: DELETED_LAST_MESSAGE_MARK },
          };
        }
      }
    } catch {
      // best-effort: si falla el overlay, se muestra el chat en vivo tal cual.
    }
  }

  if (!result.success && readUserIds.length) {
    const persisted = await medir("bandejaGuardadaTrasFallo", () =>
      getPersistedInboxChats({
        userIds: readUserIds,
        instanceNames: [context.instanceName],
      }),
    );
    if (persisted.length) {
      tiempos.total = Date.now() - arrancoLaVuelta;
      return {
        success: true,
        message: "Evolution no respondió; chats cargados desde historial local.",
        data: persisted,
        tiempos,
      };
    }
  }

  tiempos.total = Date.now() - arrancoLaVuelta;
  return { ...result, tiempos };
}

export async function sendManualChatPayloadAction(
  context: ChatActionContext,
  remoteJid: string,
  payload: OutgoingMessagePayload,
): Promise<SendMessageResult> {
  context = await resolverContexto(context);
  if (!hasReadyContext(context)) {
    return {
      success: false,
      message: "No hay instancia o API key configurada para enviar mensajes.",
      remoteJid,
    };
  }

  const user = await currentUser();
  const storageUserId = await resolveChatStorageUserId(context, user?.ownerId ?? user?.id);
  const effectiveOwnerId = storageUserId ?? user?.ownerId ?? user?.id ?? null;

  // El asesor está interviniendo: la IA se calla antes de que salga el mensaje.
  // Si el envío falla, la conversación queda en pausa —que es el lado seguro— y
  // se reactiva con el interruptor.
  if (user?.id) {
    await pausarIaPorIntervencionHumana(effectiveOwnerId, remoteJid);
  } else {
    // Tercer camino mudo: sin sesion de usuario ni se intentaba pausar, y no
    // quedaba rastro. El mensaje SI sale, asi que desde fuera parece que todo
    // fue bien mientras la IA sigue despierta contestando encima del asesor.
    console.warn(
      "[chats] mensaje manual enviado SIN pausar la IA: no hay sesion de usuario.",
      { remoteJid, instancia: context.instanceName },
    );
  }

  const transportRemoteJid = await resolveTransportRemoteJid({
    userId: storageUserId,
    instanceName: context.instanceName,
    remoteJid,
    context,
  });

  // Guardamos el texto original antes de appendear firma
  const originalText = payload.kind === "text" ? payload.text.trim() : null;

  // Prepend firma del asesor (al inicio) si está activa para esta sesión.
  //
  // El TEXTO de la firma es de quien escribe —cada asesor firma con su nombre—,
  // pero el interruptor vive en la conversación, y la conversación cuelga de la
  // cuenta dueña de la LÍNEA. Se buscaba con `user.effectiveId`, que es la
  // cuenta desde la que uno escribe: cuando la línea era de otra cuenta no
  // encontraba la sesión y el mensaje salía sin firma, sin decir nada. Es el
  // mismo `effectiveOwnerId` que usa el cierre de la conversación más abajo.
  // La firma vive en `lib/firma-del-asesor`, no aqui: hay TRES envios (este,
  // el de WhatsApp Mensajeria) y escribirla solo en uno es lo
  // que hacia que el interruptor se viera encendido y el mensaje saliera sin
  // firma en las otras lineas.
  if (payload.kind === "text") {
    payload = {
      ...payload,
      text: await anteponerFirmaDelAsesor({
        ownerUserId: effectiveOwnerId,
        remoteJid,
        texto: payload.text,
      }),
    };
  }

  const result = await sendOutgoingPayload({
    context,
    remoteJid: transportRemoteJid,
    persistRemoteJid: remoteJid,
    payload,
    source: "manual_chat_ui",
    userId: storageUserId ?? undefined,
    instanceType: "evolution",
    historyType: "notification",
  });

  // Actividad del equipo, y **solo si salió**. Va aquí y no arriba, junto a la
  // pausa: la pausa se hace antes del envío a propósito, pero contar un mensaje
  // que rebotó sería anotar algo que no pasó — la misma regla que en Cobros.
  if (result.success && user?.id) {
    await apuntarLoQueHizo(user, "mensaje_enviado");
    // El chat se da por atendido una vez por conversación y día: el contador
    // de arriba ya cuenta los mensajes, y sumar «chat atendido» por cada uno
    // convertiría las dos columnas en la misma.
    await apuntarUnaVezAlDia(user, "chat_atendido", remoteJid);
  }

  // Cierre de la conversación: la frase de despedida del asesor apaga la firma y
  // cancela los seguimientos pendientes. La pausa de la IA ya quedó hecha arriba.
  if (result.success && user?.id && effectiveOwnerId) {
    const delPhrase = (user?.delSeguimiento as string | null | undefined)?.trim();
    const isClosing = Boolean(originalText !== null && delPhrase && originalText === delPhrase);

    if (isClosing) {
      await Promise.all([
        db.session.updateMany({
          where: { userId: effectiveOwnerId, remoteJid },
          data: { signatureEnabled: false },
        }),
        db.crmFollowUp.updateMany({
          where: { userId: effectiveOwnerId, remoteJid, status: { in: ["PENDING", "PROCESSING"] } },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        }),
        db.seguimiento.deleteMany({ where: { remoteJid } }),
      ]);
    }
  }

  return result;
}

export async function getAdvisorSignatureAction(): Promise<string> {
  const user = await currentUser();
  return (user?.advisorSignature as string | null | undefined) ?? "";
}

export async function updateAdvisorSignatureAction(
  signature: string,
): Promise<{ success: boolean; message: string }> {
  const user = await currentUser();
  if (!user?.id) return { success: false, message: "No autorizado." };

  const trimmed = signature.trim();
  await db.user.update({
    where: { id: user.id },
    data: { advisorSignature: trimmed || null },
  });

  return { success: true, message: "Firma actualizada." };
}

export async function toggleSessionSignatureAction(
  sessionId: number,
  enabled: boolean,
): Promise<{ success: boolean; message: string }> {
  const user = await currentUser();
  if (!user?.id) {
    return { success: false, message: "No autorizado." };
  }

  const signature = (user?.advisorSignature as string | null | undefined)?.trim();
  if (enabled && !signature) {
    return {
      success: false,
      message: "Configura tu firma en Ajustes antes de activarla.",
    };
  }

  // El interruptor se guarda donde vive la conversación, que es la cuenta dueña
  // de la línea y no siempre la de quien escribe. Se sacaba de `user.ownerId ??
  // user.id`, así que al encenderlo desde una línea ajena se marcaban las
  // sesiones de la cuenta equivocada: el interruptor se veía encendido y los
  // mensajes seguían saliendo sin firma.
  const sesion = await db.session.findUnique({
    where: { id: sessionId },
    select: { userId: true },
  });
  const cuentaDeLaConversacion = sesion?.userId ?? user.ownerId ?? user.id;

  // Y solo sobre una cuenta a la que uno de verdad alcanza: el id de sesión
  // llega del navegador.
  const alcanza = await getAuthorizedAccountUserIds(user);
  if (!alcanza.includes(cuentaDeLaConversacion)) {
    return { success: false, message: "No autorizado." };
  }

  await db.session.updateMany({
    where: { userId: cuentaDeLaConversacion },
    data: { signatureEnabled: enabled },
  });

  return { success: true, message: enabled ? "Firma activada." : "Firma desactivada." };
}

/**
 * Devuelve el conjunto de userIds cuyos recursos (respuestas rápidas, workflows)
 * puede usar el usuario actual: él mismo + las cuentas DUEÑAS a las que está
 * vinculado como agente/administrador (línea principal del equipo) + las
 * sub-cuentas vinculadas si él es el dueño. Así un agente/admin puede enviar las
 * respuestas rápidas y los flujos del dueño desde su propio usuario.
 */
async function getAuthorizedAccountUserIds(user: {
  id: string;
  effectiveId: string;
  ownerId?: string | null;
  sessionUserId?: string | null;
}): Promise<string[]> {
  const ids = new Set<string>(
    [user.effectiveId, user.id, user.ownerId, user.sessionUserId].filter(
      (v): v is string => Boolean(v),
    ),
  );
  const realId = user.sessionUserId ?? user.id;
  try {
    const [masters, linked] = await Promise.all([
      db.$queryRaw<{ id: string }[]>`
        SELECT "master_user_id" AS id FROM "linked_accounts" WHERE "linked_user_id" = ${realId}
      `,
      db.$queryRaw<{ id: string }[]>`
        SELECT "linked_user_id" AS id FROM "linked_accounts" WHERE "master_user_id" = ${user.effectiveId}
      `,
    ]);
    masters.forEach((r) => r.id && ids.add(r.id));
    linked.forEach((r) => r.id && ids.add(r.id));
  } catch {
    // Tabla linked_accounts ausente o error: degradar a las cuentas base.
  }
  return Array.from(ids);
}

export async function sendManualWorkflowAction(
  context: ChatActionContext,
  remoteJid: string,
  workflowId: string,
): Promise<ChatToolActionResult> {
  context = await resolverContexto(context);
  // WhatsApp Mensajeria (waha) no tiene clave de Evolution, y no la necesita:
  // los nodos salen por Waha dentro de sendOutgoingPayload, con la misma logica
  // de nodos, automatizaciones y persistencia que Evolution.
  const lineaWaha = !hasReadyContext(context) && (await esLineaWaha(context?.instanceName));
  if (!hasReadyContext(context) && !lineaWaha) {
    return {
      success: false,
      message: "No hay instancia o API key configurada para enviar workflows.",
    };
  }
  const ctx = context as Exclude<ChatActionContext, null>;
  const tipoDeLinea = lineaWaha ? "waha" : "evolution";

  const user = await requireCurrentUser();
  const storageUserId = lineaWaha
    ? ((await resolveInstanceOwner(ctx.instanceName))?.userId ?? user.ownerId ?? user.id)
    : await resolveChatStorageUserId(ctx, user.ownerId ?? user.id);
  const transportRemoteJid = await resolveTransportRemoteJid({
    userId: storageUserId,
    instanceName: ctx.instanceName,
    remoteJid,
    // Confirmar el destinatario con WhatsApp es una consulta a Evolution; en
    // Waha se manda al numero (o al @lid, que acepta) tal cual.
    context: lineaWaha ? undefined : ctx,
  });
  const authorizedUserIds = await getAuthorizedAccountUserIds(user);
  const workflow = await db.workflow.findFirst({
    where: {
      id: workflowId,
      userId: { in: authorizedUserIds },
    },
    select: {
      id: true,
      name: true,
      isPro: true,
      userId: true,
    },
  });

  if (!workflow) {
    return {
      success: false,
      message: "El workflow seleccionado no existe o no pertenece al usuario.",
    };
  }

  const nodes = await getExecutionNodesForWorkflow(workflowId);
  const dueno = storageUserId ?? workflow.userId;
  let sentCount = 0;
  let skippedCount = 0;
  let automatizaciones = 0;

  for (const node of nodes) {
    // Los nodos que no mandan nada (aplicar un tag, asignar asesor, llamar con
    // IA...) no los resuelve la app: los ejecuta el motor del backend, el mismo
    // que corre cuando el flujo lo dispara el agente. Antes se saltaban sin
    // avisar y el flujo parecía funcionar a medias.
    if (esNodoDeAutomatizacion(node.tipo)) {
      const hecho = await ejecutarNodoDeAutomatizacion({
        tipo: node.tipo,
        message: node.message,
        userId: dueno,
        remoteJid,
        instanceName: ctx.instanceName,
      });
      if (hecho) automatizaciones += 1;
      else skippedCount += 1;
      continue;
    }

    const payload = buildWorkflowPayload(node);
    if (!payload) {
      skippedCount += 1;
      continue;
    }

    const result = await sendOutgoingPayload({
      context: ctx,
      remoteJid: transportRemoteJid,
      persistRemoteJid: remoteJid,
      payload,
      source: "manual_chat_workflow",
      userId: dueno,
      instanceType: tipoDeLinea,
      historyType: "workflow",
      metadata: {
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowNodeId: node.id,
        workflowNodeType: node.tipo,
      },
    });

    if (!result.success) {
      return {
        success: false,
        message:
          sentCount > 0
            ? `El flujo "${workflow.name}" se detuvo despues de ${sentCount} envio(s): ${result.message}`
            : result.message,
      };
    }

    sentCount += 1;
  }

  if (sentCount === 0 && automatizaciones === 0) {
    return {
      success: false,
      message: `El flujo "${workflow.name}" no tiene nodos enviables manualmente.`,
    };
  }

  const detalle = [
    sentCount > 0 ? `${sentCount} envio(s)` : "",
    automatizaciones > 0 ? `${automatizaciones} automatizacion(es)` : "",
    skippedCount > 0 ? `${skippedCount} nodo(s) omitido(s)` : "",
  ].filter(Boolean);

  return {
    success: true,
    message:
      detalle.length > 1
        ? `Flujo "${workflow.name}" ejecutado: ${detalle.join(", ")}.`
        : `Flujo "${workflow.name}" enviado correctamente.`,
    data: {
      sentCount,
      skippedCount,
    },
  };
}

export async function sendManualQuickReplyAction(
  context: ChatActionContext,
  remoteJid: string,
  quickReplyId: number,
): Promise<ChatToolActionResult> {
  context = await resolverContexto(context);
  if (!hasReadyContext(context)) {
    return {
      success: false,
      message: "No hay instancia o API key configurada para enviar respuestas rapidas.",
    };
  }

  const user = await requireCurrentUser();
  const storageUserId = await resolveChatStorageUserId(context, user.ownerId ?? user.id);
  const transportRemoteJid = await resolveTransportRemoteJid({
    userId: storageUserId,
    instanceName: context.instanceName,
    remoteJid,
    context,
  });
  const authorizedUserIds = await getAuthorizedAccountUserIds(user);
  const quickReply = await db.quickReply.findFirst({
    where: {
      id: quickReplyId,
      userId: { in: authorizedUserIds },
    },
    select: {
      id: true,
      mensaje: true,
      workflowId: true,
      userId: true,
    },
  });

  if (!quickReply) {
    return {
      success: false,
      message: "La respuesta rapida seleccionada no existe o no pertenece al usuario.",
    };
  }

  const message = quickReply.mensaje?.trim() ?? "";
  const hasText = message.length > 0;
  const hasWorkflow = !!quickReply.workflowId;

  if (!hasText && !hasWorkflow) {
    return {
      success: false,
      message: "La respuesta rapida no tiene mensaje ni flujo configurado.",
    };
  }

  // 1. Enviar texto si existe
  if (hasText) {
    const textResult = await sendOutgoingPayload({
      context,
      remoteJid: transportRemoteJid,
      persistRemoteJid: remoteJid,
      payload: { kind: "text", text: message },
      source: "manual_chat_quick_reply",
      userId: storageUserId ?? quickReply.userId,
      instanceType: "evolution",
      historyType: "notification",
      metadata: { quickReplyId: quickReply.id, workflowId: quickReply.workflowId },
    });
    if (!textResult.success) return textResult;
  }

  // 2. Ejecutar el flujo si existe, y registrar la intención para que el
  //    webhook no lo vuelva a disparar cuando el cliente responda.
  if (hasWorkflow) {
    const workflow = await db.workflow.findFirst({
      where: { id: quickReply.workflowId!, userId: { in: authorizedUserIds } },
      select: { id: true, name: true },
    });

    if (!workflow) {
      return { success: false, message: "El flujo asociado no existe o no pertenece al usuario." };
    }

    const workflowResult = await sendManualWorkflowAction(context, remoteJid, workflow.id);
    if (!workflowResult.success) return workflowResult;

    // Registrar intención en n8nChatHistory para que hasIntentionBeenExecuted
    // devuelva true en el webhook y no re-ejecute el flujo automáticamente.
    const sessionHistoryId = buildChatHistorySessionId(context!.instanceName, remoteJid);
    await db.n8nChatHistory.create({
      data: {
        sessionId: sessionHistoryId,
        message: {
          type: "intention",
          name: workflow.name,
          tipo: "intention",
          executedAt: new Date().toISOString(),
        },
      },
    });
  }

  return {
    success: true,
    message: "Respuesta rapida enviada correctamente.",
    data: { sentCount: 1 },
  };
}

/**
 * Deja la conversacion suscrita a la presencia del contacto en una linea de
 * Evolution ("escribiendo…", "grabando audio…", "en linea").
 *
 * Es el hermano de `getWahaPresenceAction`, con una diferencia: a Evolution no
 * se le puede PREGUNTAR la presencia, solo suscribirse; lo que haya llegara
 * despues por el webhook (`PRESENCE_UPDATE`) y por el socket. Por eso no
 * devuelve un estado, solo si quedo suscrita.
 *
 * `resolverContexto` es quien comprueba de quien es la linea: solo devuelve la
 * clave si la cuenta duena esta entre las asociadas al que mira.
 *
 * `identidades` son las del contacto que ya tiene la pantalla (las mismas con
 * las que se piden los mensajes). Hacen falta porque casi todos los chats se
 * abren por su `@lid`, y a Evolution hay que darle el telefono de verdad; solo
 * eligen A QUE NUMERO se manda el gesto, no de quien es la linea.
 */
export async function suscribirPresenciaEvolucionAction(
  context: ChatActionContext,
  remoteJid: string,
  identidades: string[] = [],
): Promise<boolean> {
  context = await resolverContexto(context);
  if (!hasReadyContext(context)) return false;
  await requireCurrentUser();
  return subscribeEvolutionPresence(context.apiKeyData, context.instanceName, remoteJid, identidades);
}

export async function reactToMessageAction(
  context: ChatActionContext,
  remoteJid: string,
  messageId: string,
  fromMe: boolean,
  emoji: string,
): Promise<{ success: boolean; message: string }> {
  context = await resolverContexto(context);
  await requireCurrentUser();

  // WhatsApp Mensajeria (waha) no habla con Evolution: su contexto llega SIN
  // clave a proposito. Sin esta rama, reaccionar moria con "Sin instancia
  // configurada" en esas lineas.
  const esWaha =
    !hasReadyContext(context) && !!context?.instanceName && (await esLineaWaha(context.instanceName));

  if (!esWaha && !hasReadyContext(context)) {
    return { success: false, message: "Sin instancia configurada." };
  }

  const resultado = esWaha
    ? await (async () => {
        const r = await reactToWahaMessage({
          session: context!.instanceName,
          messageId,
          emoji,
        });
        return { success: r.ok, message: r.message };
      })()
    : await sendReaction(context!.apiKeyData!, context!.instanceName, remoteJid, messageId, fromMe, emoji);

  // La reaccion se guarda PEGADA a su mensaje, para que quede.
  //
  // Antes no se guardaba en ningun sitio: se veia en el telefono y en el panel
  // no quedaba rastro. En las lineas que leen la conversacion de nuestra base
  // —Waha, y cualquiera cuando Evolution no contesta— no aparecia nunca; en las
  // de Evolution solo mientras su lista siguiera trayendo la reaccion.
  if (resultado.success) {
    const dueno = await resolveInstanceOwner(context!.instanceName);
    if (dueno?.userId) {
      await guardarReaccion({
        userId: dueno.userId,
        instanceName: context!.instanceName,
        messageId,
        emoji,
      });
    }
  }

  return resultado;
}

export async function deleteMessageAction(
  context: ChatActionContext,
  remoteJid: string,
  messageId: string,
  fromMe: boolean,
): Promise<{ success: boolean; message: string }> {
  context = await resolverContexto(context);
  const user = await requireCurrentUser();

  // La MISMA puerta que borrar un chat (`lib/mando-en-chats.ts`): el dueno de la
  // cuenta y su administrador; un `agente` no.
  //
  // Aqui se pedia `user.role === "admin"`, que es el rol de la PLATAFORMA, y el
  // administrador de una cuenta no lo tiene ni lo va a tener. El menu de la
  // burbuja si mira su `advisorRole`, asi que le ofrecia «Eliminar» y el
  // servidor le contestaba que no: boton abierto, puerta cerrada.
  if (!puedeBorrarEnChats(user)) {
    return { success: false, message: "Solo el dueño o un administrador puede eliminar mensajes." };
  }

  // Y de quien es la linea. Antes no hacia falta preguntarlo —solo pasaba un
  // admin de plataforma, que manda sobre todas—; ahora que entra el
  // administrador de UNA cuenta hay que acotarlo a las suyas, porque el
  // `instanceName` llega del navegador.
  const duenoDeLaLinea = await resolveInstanceOwner(context?.instanceName ?? "");
  if (duenoDeLaLinea?.userId) {
    const cuentasPermitidas = await getAuthorizedAccountUserIds(user);
    if (!cuentasPermitidas.includes(duenoDeLaLinea.userId)) {
      return { success: false, message: "Esa línea no es de tu cuenta." };
    }
  }

  // Igual que editar: una linea de WhatsApp Mensajeria (waha) no trae clave de
  // Evolution, asi que borrar moria arriba con "Sin instancia configurada".
  // Sigue pidiendo ser administrador: borrar quita algo del telefono del
  // cliente, no es corregir una tilde.
  const esWaha =
    !hasReadyContext(context) && !!context?.instanceName && (await esLineaWaha(context.instanceName));

  if (!esWaha && !hasReadyContext(context)) {
    return { success: false, message: "Sin instancia configurada." };
  }

  // MANDA WHATSAPP. Si el no lo borra, la App tampoco.
  //
  // "Eliminar para todos" tiene su propio limite de tiempo: pasado un rato
  // WhatsApp lo rechaza aunque el mensaje sea tuyo. Durante un tiempo la App
  // borraba su copia igualmente, para que un administrador pudiera al menos
  // quitarlo de la pantalla. El efecto era peor que el problema: el panel y el
  // telefono del cliente contaban cosas distintas —el mensaje seguia en su
  // WhatsApp y en la App no habia ni rastro— y no quedaba forma de saber que
  // se habia dicho ni de recuperarlo.
  //
  // Ahora el borrado local va DESPUES y solo si WhatsApp dijo que si. Si
  // rechaza, no se toca nada y se devuelve su motivo: la burbuja vuelve a su
  // sitio y se lee por que.
  const resultadoWhatsapp = esWaha
    ? await (async () => {
        const r = await deleteWahaMessage({
          session: context!.instanceName,
          chatId: canonicalToWahaJid(remoteJid),
          messageId,
        });
        return { success: r.ok, message: r.message };
      })()
    : await deleteMessage(
        context!.apiKeyData!,
        context!.instanceName,
        remoteJid,
        messageId,
        fromMe,
      );

  if (!resultadoWhatsapp.success) {
    return {
      success: false,
      message: `No se eliminó: WhatsApp no lo borró. ${resultadoWhatsapp.message}`,
    };
  }

  // EL MENSAJE NO DESAPARECE: se marca.
  //
  // Queda con su texto y con el sello «Eliminado», exactamente igual que cuando
  // el contacto borra uno desde su telefono. Antes se borraba la fila entera
  // (`eliminarMensajeDelTodo`) y la burbuja se esfumaba: nadie podia saber que
  // se habia dicho, ni el asesor que lo borro ni el que entrara despues, y en
  // una conversacion de trabajo eso es justo lo que hace falta conservar.
  //
  // Es el mismo camino que ya usaba el borrado del contacto, que es el que se
  // comporta bien.
  const storageUserId = await resolveChatStorageUserId(context, user.ownerId ?? user.id);
  await marcarMensajeComoEliminado({
    userId: storageUserId ?? user.ownerId ?? user.id,
    instanceName: context!.instanceName,
    messageId,
  });

  return resultadoWhatsapp;
}

export async function editMessageAction(
  context: ChatActionContext,
  remoteJid: string,
  messageId: string,
  newText: string,
): Promise<{ success: boolean; message: string }> {
  context = await resolverContexto(context);
  // Editar lo puede hacer CUALQUIERA del equipo, no solo un administrador.
  //
  // Solo se ofrece sobre los mensajes que salieron de la linea
  // (`isUserMessage` en el menu de la burbuja) y WhatsApp solo lo admite
  // durante unos 15 minutos, asi que lo unico que permite es que quien acaba de
  // escribir corrija su propio error de dedo. Pedir rol de administrador para
  // eso obligaba a llamar al jefe por una tilde.
  await requireCurrentUser();

  // WhatsApp Mensajeria (waha) no habla con Evolution, asi que su contexto
  // llega SIN clave a proposito (ver `resolverContexto`). Sin esta rama, editar
  // moria arriba con "Sin instancia configurada" y desde fuera parecia que la
  // funcion se hubiera roto al cambiar de proveedor: con Evolution editaba y
  // con Waha no.
  const esWaha =
    !hasReadyContext(context) && !!context?.instanceName && (await esLineaWaha(context.instanceName));

  if (!esWaha && !hasReadyContext(context)) {
    return { success: false, message: "Sin instancia configurada." };
  }

  const resultado = esWaha
    ? await (async () => {
        const r = await editWahaMessage({
          session: context!.instanceName,
          chatId: canonicalToWahaJid(remoteJid),
          messageId,
          text: newText,
        });
        return { success: r.ok, message: r.message };
      })()
    : await editMessage(context!.apiKeyData!, context!.instanceName, remoteJid, messageId, newText);

  // El texto nuevo se guarda para TODOS, no solo para quien edito.
  //
  // Antes la edicion vivia en un `Map` del navegador que la hizo: los demas
  // asesores seguian viendo el texto viejo -y quien editaba lo perdia al
  // recargar-, mientras en el telefono del cliente ya estaba cambiado.
  if (resultado.success) {
    const dueno = await resolveInstanceOwner(context!.instanceName);
    if (dueno?.userId) {
      await guardarMensajeEditado({
        userId: dueno.userId,
        instanceName: context!.instanceName,
        messageId,
        texto: newText,
      });
    } else {
      console.warn("[chats] mensaje editado en una linea sin dueno resuelto; no se guardo", {
        instanceName: context!.instanceName,
        messageId,
      });
    }
  }

  return resultado;
}
