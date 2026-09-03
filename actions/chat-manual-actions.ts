"use server";

import type { MediaType, FetchChatsResult, FindMessagesResult, SendMessageResult } from "./chat-actions";
import type { ChatToolActionResult } from "@/types/chat";
import { Prisma, type WorkflowNode } from "@prisma/client";

import { currentUser } from "@/lib/auth";
import { getAssociatedAccountIds } from "@/lib/cuentas-asociadas";
import { db } from "@/lib/db";
import { buildChatHistorySessionId } from "@/lib/chat-history/build-session-id";
import { pausarIaPorIntervencionHumana } from "@/lib/human-takeover";
import { esNodoDeAutomatizacion, ejecutarNodoDeAutomatizacion } from "@/lib/workflow-automation-nodes";
import { saveChatHistoryMessage } from "@/lib/chat-history/chat-history.helper";
import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";
import { epochToMs } from "@/lib/epoch";
import {
  eliminarMensajeDelTodo,
  getDeletedLastMessageJids,
  getPersistedInboxChats,
  getPersistedMessages,
  persistChatMessage,
  persistEvolutionMessages,
  resolveInstanceOwner,
} from "@/lib/chat-persistence";
import {
  fetchChatsFromEvolution,
  findMessagesByRemoteJid,
  resolveWhatsAppJid,
  sendMediaByUrl,
  sendTextMessage,
  sendReaction,
  deleteMessage,
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
        provider: "evolution",
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

async function resolveChatStorageUserId(
  context: ChatActionContext,
  fallbackUserId?: string | null,
) {
  if (hasReadyContext(context)) {
    const owner = await resolveInstanceOwner(context.instanceName);
    if (owner?.userId) return owner.userId;
  }

  return fallbackUserId ?? null;
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

export async function warmChatMessagesAction(
  context: ChatActionContext,
  remoteJid: string,
  options?: { page?: number; pageSize?: number; remoteJidAliases?: string[]; localOnly?: boolean; localFirst?: boolean },
): Promise<FindMessagesResult> {
  context = await resolverContexto(context);
  const user = await currentUser();
  const effectiveOwnerId = await resolveChatStorageUserId(context, user?.ownerId ?? user?.id);
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
      const localResult = await buildPersistedMessagesResult({
        userIds: readUserIds,
        instanceName: hasReadyContext(context) ? context.instanceName : undefined,
        remoteJid,
        aliases: options?.remoteJidAliases,
        page,
        pageSize,
        message: "Mensajes cargados desde historial local.",
      });
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
        return localResult;
      }
    }
  }

  if (!hasReadyContext(context)) {
    return {
      success: false,
      message: "No hay instancia o API key configurada para cargar mensajes.",
      queriedRemoteJid: remoteJid,
    };
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
  const promesaEvolution = findMessagesByRemoteJid(
    context.apiKeyData,
    context.instanceName,
    remoteJid,
    { ...fetchOptions, timeoutMs: ESPERA_MAXIMA_DE_EVOLUTION },
  );
  // El fallo se atiende aqui mismo para que la promesa nunca quede sin `catch`:
  // se queda corriendo de fondo cuando se contesta con la base, y una promesa
  // rechazada sin nadie escuchando tumba el proceso de Node.
  const promesaEvolutionSegura = promesaEvolution.catch(
    (error): FindMessagesResult => ({
      success: false,
      message: error instanceof Error ? error.message : "Evolution no respondio.",
      queriedRemoteJid: remoteJid,
    }),
  );

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

  // Ya con la base en la mano, a Evolution se le da un margen corto. Si no
  // llega, se contesta con lo guardado y ella sigue de fondo: lo que traiga se
  // persiste igual y la siguiente vuelta del reloj lo recoge.
  const result = await Promise.race([
    promesaEvolutionSegura,
    new Promise<null>((resolver) =>
      setTimeout(() => resolver(null), MARGEN_ANTES_DE_TIRAR_DE_LA_BASE),
    ),
  ]);

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

    if (respaldoLocal?.data.length) return respaldoLocal;

    return {
      success: false,
      message: "Evolution tardo demasiado y no hay historial local todavia.",
      queriedRemoteJid: remoteJid,
    };
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
      return respaldoLocal;
    }

    return result;
  }

  if (!result.success && respaldoLocal?.data.length) {
    return respaldoLocal;
  }

  return result;
}

export async function refetchChatsManualAction(
  context: ChatActionContext,
): Promise<FetchChatsResult> {
  const user = await currentUser();
  const effectiveOwnerId = await resolveChatStorageUserId(context, user?.ownerId ?? user?.id);
  // Mismo conjunto que la lectura de mensajes: no perder conversaciones viejas
  // guardadas bajo el userId anterior al cambio de dueño de la línea.
  const readUserIds = Array.from(
    new Set([effectiveOwnerId, user?.ownerId, user?.id].filter(Boolean) as string[]),
  );

  context = await resolverContexto(context);
  if (!hasReadyContext(context)) {
    if (readUserIds.length) {
      const persisted = await getPersistedInboxChats({ userIds: readUserIds });
      if (persisted.length) {
        return {
          success: true,
          message: "Chats cargados desde historial local.",
          data: persisted,
        };
      }
    }

    return {
      success: false,
      message: "No hay instancia o API key configurada para refrescar chats.",
    };
  }

  const result = await fetchChatsFromEvolution(context.apiKeyData, context.instanceName);

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
      const deleted = await getDeletedLastMessageJids({
        userIds: readUserIds,
        instanceName: context.instanceName,
      });
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
    const persisted = await getPersistedInboxChats({
      userIds: readUserIds,
      instanceNames: [context.instanceName],
    });
    if (persisted.length) {
      return {
        success: true,
        message: "Evolution no respondió; chats cargados desde historial local.",
        data: persisted,
      };
    }
  }

  return result;
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
  if (payload.kind === "text" && user?.id && effectiveOwnerId) {
    const signature = (user?.advisorSignature as string | null | undefined)?.trim();
    if (signature) {
      const sessionRow = await db.session.findFirst({
        where: { userId: effectiveOwnerId, remoteJid },
        select: { signatureEnabled: true },
      });
      if (sessionRow?.signatureEnabled) {
        payload = { ...payload, text: `${signature}\n${payload.text}` };
      }
    }
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
  if (!hasReadyContext(context)) {
    return {
      success: false,
      message: "No hay instancia o API key configurada para enviar workflows.",
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
        instanceName: context.instanceName,
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
      context,
      remoteJid: transportRemoteJid,
      persistRemoteJid: remoteJid,
      payload,
      source: "manual_chat_workflow",
      userId: dueno,
      instanceType: "evolution",
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

export async function reactToMessageAction(
  context: ChatActionContext,
  remoteJid: string,
  messageId: string,
  fromMe: boolean,
  emoji: string,
): Promise<{ success: boolean; message: string }> {
  context = await resolverContexto(context);
  if (!hasReadyContext(context)) return { success: false, message: "Sin instancia configurada." };
  await requireCurrentUser();
  return sendReaction(context.apiKeyData, context.instanceName, remoteJid, messageId, fromMe, emoji);
}

export async function deleteMessageAction(
  context: ChatActionContext,
  remoteJid: string,
  messageId: string,
  fromMe: boolean,
): Promise<{ success: boolean; message: string }> {
  context = await resolverContexto(context);
  if (!hasReadyContext(context)) return { success: false, message: "Sin instancia configurada." };
  const user = await requireCurrentUser();
  if (user.role !== "admin" && user.role !== "super_admin") {
    return { success: false, message: "Solo los administradores pueden eliminar mensajes." };
  }
  // El borrado en WhatsApp ("eliminar para todos") tiene su propio limite de
  // tiempo: pasado un rato, WhatsApp lo rechaza aunque el mensaje sea tuyo.
  // Antes eso frenaba TODO: si WhatsApp decia que no, la copia local ni se
  // tocaba, y un mensaje viejo quedaba imposible de quitar del panel aunque
  // el administrador -que aqui ya se autentico como tal, arriba- solo quiera
  // que deje de verse. Se intenta igual (mejor si WhatsApp tambien lo borra),
  // pero un fallo ahi ya no bloquea el borrado local.
  const resultadoWhatsapp = await deleteMessage(
    context.apiKeyData,
    context.instanceName,
    remoteJid,
    messageId,
    fromMe,
  );

  const storageUserId = await resolveChatStorageUserId(context, user.ownerId ?? user.id);
  await eliminarMensajeDelTodo({
    userId: storageUserId ?? user.ownerId ?? user.id,
    instanceName: context.instanceName,
    remoteJid,
    messageId,
    fromMe,
  });

  if (!resultadoWhatsapp.success) {
    return {
      success: true,
      message: `Eliminado del panel. WhatsApp no lo borro: ${resultadoWhatsapp.message}`,
    };
  }

  return resultadoWhatsapp;
}

export async function editMessageAction(
  context: ChatActionContext,
  remoteJid: string,
  messageId: string,
  newText: string,
): Promise<{ success: boolean; message: string }> {
  context = await resolverContexto(context);
  if (!hasReadyContext(context)) return { success: false, message: "Sin instancia configurada." };
  const user = await requireCurrentUser();
  if (user.role !== "admin" && user.role !== "super_admin") {
    return { success: false, message: "Solo los administradores pueden editar mensajes." };
  }
  return editMessage(context.apiKeyData, context.instanceName, remoteJid, messageId, newText);
}
