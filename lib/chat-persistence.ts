import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import {
  buildWhatsAppJidCandidates,
  normalizeWhatsAppConversationJid,
  pickExplicitWhatsAppPhoneJid,
  pickObservedAlternateRemoteJid,
  pickPreferredWhatsAppRemoteJid,
} from '@/lib/whatsapp-jid';
import { esSobreInternoDeWhatsapp } from '@/lib/whatsapp-message-kinds';
import { TOPE_DE_LA_BANDEJA, VENTANA_DE_CANDIDATOS } from '@/lib/bandeja';
import type { ChatData, EvolutionMessage, LastMessage, MessageContent } from '@/actions/chat-actions';

type PersistedChatMessageRow = {
  id: bigint;
  userId: string;
  instanceName: string;
  instanceType: string | null;
  remoteJid: string;
  remoteJidAlt: string | null;
  senderPn: string | null;
  messageId: string;
  fromMe: boolean;
  pushName: string | null;
  messageType: string;
  content: string | null;
  mediaUrl: string | null;
  raw: Prisma.JsonValue | null;
  messageTimestamp: Date;
  deleted: boolean | null;
};

type InboxRow = {
  profilePicUrl?: string | null;
  sessionId: number;
  /** Id de la conversación, usado para traer su JSON solo en las filas finales. */
  convId: number | null;
  userId: string;
  remoteJid: string;
  remoteJidAlt: string | null;
  pushName: string | null;
  instanceName: string;
  instanceType: string | null;
  messageId: string | null;
  fromMe: boolean | null;
  messageType: string | null;
  content: string | null;
  mediaUrl: string | null;
  raw: Prisma.JsonValue | null;
  messageTimestamp: Date | null;
  sessionUpdatedAt: Date;
  lastMessageDeleted?: boolean | null;
};

export type PersistChatMessageInput = {
  userId: string;
  instanceName: string;
  instanceType?: string | null;
  remoteJid: string;
  remoteJidAlt?: string | null;
  senderPn?: string | null;
  messageId?: string | null;
  fromMe: boolean;
  pushName?: string | null;
  messageType?: string | null;
  content?: string | null;
  mediaUrl?: string | null;
  raw?: Prisma.InputJsonValue | null;
  messageTimestamp?: Date | number | string | null;
  /**
   * Si un mensaje ENTRANTE puede reabrir una conversacion pausada.
   *
   * Cierto para lo que llega en vivo -ahi el cliente acaba de escribir y la
   * conversacion debe reabrirse-. FALSO cuando se esta guardando historial que
   * ya existia: el sondeo del chat abierto vuelve a persistir los ultimos
   * mensajes cada pocos segundos, y esos mensajes viejos no son novedad
   * ninguna. Ver `persistEvolutionMessages`.
   */
  puedeReabrir?: boolean;
};

let ensureTablePromise: Promise<void> | null = null;

/** ¿El error es "la tabla no existe" (Postgres 42P01)? */
function isMissingTableError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code === '42P01') return true;
  return /relation .* does not exist/i.test(String((error as Error)?.message ?? ''));
}

/**
 * Ejecuta una LECTURA sin pagar el coste de verificar el esquema.
 *
 * `ensureChatMessagesTable` lanza 17 sentencias DDL en serie y tarda ~6,8s
 * contra la base de datos remota; hacerlo antes de cada lectura era la mitad del
 * tiempo de carga de Chats, y se pagaba aunque las tablas ya existieran (que es
 * siempre, salvo en una instalación nueva).
 *
 * Las tablas las crean la ruta de ESCRITURA y el backend, así que la lectura no
 * necesita garantizarlas. Solo si la tabla no existe todavía se crean y se
 * reintenta una vez: así una instalación nueva sigue funcionando.
 */
async function readWithTablesFallback<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
    await ensureChatMessagesTable();
    return run();
  }
}

function ensureChatMessagesTable() {
  ensureTablePromise ??= (async () => {
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id" BIGSERIAL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "instanceName" TEXT NOT NULL,
        "instanceType" TEXT,
        "remoteJid" TEXT NOT NULL,
        "remoteJidAlt" TEXT,
        "senderPn" TEXT,
        "messageId" TEXT NOT NULL,
        "fromMe" BOOLEAN NOT NULL DEFAULT FALSE,
        "pushName" TEXT,
        "messageType" TEXT NOT NULL DEFAULT 'conversation',
        "content" TEXT,
        "mediaUrl" TEXT,
        "raw" JSONB,
        "messageTimestamp" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await db.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "chat_messages_user_instance_jid_msg_from_unique"
      ON "chat_messages" ("userId", "instanceName", "remoteJid", "messageId", "fromMe")
    `;
    // Marca de "eliminado por el cliente" (revoke): conserva el contenido y solo
    // permite mostrar el badge "Eliminado". La escribe el backend (chat-store).
    await db.$executeRaw`
      ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "deleted" BOOLEAN NOT NULL DEFAULT FALSE
    `;
    // Un asesor corrigio el texto desde el panel. Sirve para BLINDARLO: el
    // sondeo de Evolution vuelve a guardar el mensaje con su texto original en
    // cada vuelta, y sin esta marca la correccion duraba hasta el refresco
    // siguiente. Es el mismo truco que ya protege a `sentByAi`.
    await db.$executeRaw`
      ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3)
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "chat_messages_user_jid_ts_idx"
      ON "chat_messages" ("userId", "remoteJid", "messageTimestamp" DESC)
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "chat_messages_user_instance_jid_ts_idx"
      ON "chat_messages" ("userId", "instanceName", "remoteJid", "messageTimestamp" DESC)
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "chat_messages_user_instance_alt_ts_idx"
      ON "chat_messages" ("userId", "instanceName", "remoteJidAlt", "messageTimestamp" DESC)
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "chat_messages_user_instance_sender_ts_idx"
      ON "chat_messages" ("userId", "instanceName", "senderPn", "messageTimestamp" DESC)
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "chat_messages_user_instance_ts_idx"
      ON "chat_messages" ("userId", "instanceName", "messageTimestamp" DESC)
    `;
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "chat_conversations" (
        "id" BIGSERIAL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "instanceName" TEXT NOT NULL,
        "instanceType" TEXT,
        "remoteJid" TEXT NOT NULL,
        "remoteJidAlt" TEXT,
        "senderPn" TEXT,
        "pushName" TEXT,
        "lastMessageId" TEXT,
        "lastMessageFromMe" BOOLEAN,
        "lastMessageType" TEXT,
        "lastMessageContent" TEXT,
        "lastMessageMediaUrl" TEXT,
        "lastMessageRaw" JSONB,
        "lastMessageTimestamp" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await db.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "chat_conversations_user_instance_jid_unique"
      ON "chat_conversations" ("userId", "instanceName", "remoteJid")
    `;
    // El último mensaje de la conversación fue eliminado por el cliente: la lista
    // muestra "🚫 Mensaje eliminado". Se resetea a FALSE al llegar un mensaje nuevo.
    await db.$executeRaw`
      ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "lastMessageDeleted" BOOLEAN NOT NULL DEFAULT FALSE
    `;
    // Foto de perfil guardada en la fila (la escribe el backend para las
    // lineas Waha, que no la traen en su lista de chats). La bandeja la lee.
    await db.$executeRaw`
      ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "chat_conversations_user_last_ts_idx"
      ON "chat_conversations" ("userId", "lastMessageTimestamp" DESC)
    `;
    // Índices para la bandeja (getPersistedInboxChats): el emparejamiento
    // conversación↔sesión sondea por remoteJid/remoteJidAlt/senderPn. Sin estos
    // índices el LEFT JOIN / anti-join haría seq-scans. Se crean CONCURRENTLY y
    // en best-effort (un fallo NO debe romper la persistencia de mensajes).
    // "Session" es tabla compartida (la escribe el backend): CONCURRENTLY evita
    // lockearla.
    const bestEffortIndex = async (label: string, sql: Prisma.Sql) => {
      try {
        await db.$executeRaw(sql);
      } catch (e) {
        console.error(`[idx] ${label}:`, e instanceof Error ? e.message : e);
      }
    };
    await bestEffortIndex(
      "chat_conversations_user_jid",
      Prisma.sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS "chat_conversations_user_jid_idx" ON "chat_conversations" ("userId", "remoteJid")`
    );
    await bestEffortIndex(
      "chat_conversations_user_alt",
      Prisma.sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS "chat_conversations_user_alt_idx" ON "chat_conversations" ("userId", "remoteJidAlt") WHERE "remoteJidAlt" IS NOT NULL`
    );
    await bestEffortIndex(
      "chat_conversations_user_sender",
      Prisma.sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS "chat_conversations_user_sender_idx" ON "chat_conversations" ("userId", "senderPn") WHERE "senderPn" IS NOT NULL`
    );
    await bestEffortIndex(
      "session_user_alt",
      Prisma.sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS "session_user_remotejidalt_idx" ON "Session" ("userId", "remoteJidAlt") WHERE "remoteJidAlt" IS NOT NULL`
    );
    // Abrir una conversación busca sus mensajes por tres columnas: remoteJid,
    // remoteJidAlt y senderPn. Para las dos últimas solo había índice CON el
    // nombre de instancia, así que cuando la llamada no lo trae —canales del
    // store unificado, conversaciones sin instancia resuelta— esas dos ramas
    // recorrían la tabla entera: 325 MB, medidos en 7 segundos para devolver
    // CERO mensajes.
    //
    // Parciales, porque la mayoría de filas tienen ambas columnas vacías: el
    // índice ocupa una fracción y sirve exactamente para las filas que se
    // buscan.
    await bestEffortIndex(
      "chat_messages_user_alt",
      Prisma.sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS "chat_messages_user_alt_ts_idx" ON "chat_messages" ("userId", "remoteJidAlt", "messageTimestamp" DESC) WHERE "remoteJidAlt" IS NOT NULL`
    );
    await bestEffortIndex(
      "chat_messages_user_sender",
      Prisma.sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS "chat_messages_user_sender_ts_idx" ON "chat_messages" ("userId", "senderPn", "messageTimestamp" DESC) WHERE "senderPn" IS NOT NULL`
    );
    await db.$executeRaw`
      DELETE FROM "chat_messages"
      WHERE "messageType" = 'reactionMessage'
         OR "raw"->'message' ? 'reactionMessage'
    `;
    await db.$executeRaw`
      DELETE FROM "chat_conversations"
      WHERE "lastMessageType" = 'reactionMessage'
         OR "lastMessageRaw"->'message' ? 'reactionMessage'
    `;
    await db.$executeRaw`
      DELETE FROM "chat_conversations"
      WHERE "lastMessageType" IN ('conversation', 'extendedTextMessage')
        AND COALESCE(NULLIF(BTRIM("lastMessageContent"), ''), '-') = '-'
        AND "lastMessageMediaUrl" IS NULL
    `;
    // AQUI HABIA un `INSERT ... SELECT DISTINCT ON` que reconstruia
    // `chat_conversations` ENTERA a partir de `chat_messages`. Se quita.
    //
    // Lo que hacia: leer la tabla de mensajes completa —sin ninguna cota de
    // fecha—, ordenarla entera y reescribir la fila de cada conversacion. Y
    // corria una vez por PROCESO de Node, o sea a los segundos de cada
    // arranque, disparado por el primer mensaje que se guardara. Con ~30
    // despliegues en un dia, eso son ~30 recorridos completos de una tabla de
    // cientos de MB, cada uno dejando a Postgres ocupado mientras todas las
    // consultas del panel hacian cola detras. Y empeoraba con el tiempo: el
    // coste crece con la tabla.
    //
    // Por que ya no hace falta: era una red por si algun camino guardaba un
    // mensaje sin actualizar tambien la conversacion. Se rastrearon todos los
    // caminos de escritura de los dos repos y hoy no queda ninguno asi:
    //
    // - `chatStore.persistMessage` (motor) escribe las dos tablas, seguidas y
    //   sin condicion. Por ahi pasa TODO lo que entra por webhook: Evolution,
    //   Waha, Baileys y los mensajes de Meta.
    // - `persistChatMessage` (aqui abajo) hace lo mismo del lado de la App.
    // - El voicebot tenia su propio INSERT que solo tocaba `chat_messages`.
    //   Ese era el unico hueco de verdad, y se cerro pasandolo por
    //   `persistMessage`.
    // - Borrar, fusionar `@lid` y cambiar de proveedor tocan las dos tablas.
    //
    // El unico que sigue escribiendo un mensaje sin conversacion es el evento
    // de llamada de Meta (`meta_call`), y ese NO es una conversacion: usa un
    // jid sintetico (`meta-call:<id>`) y es un buzon de señalizacion que la
    // pantalla de llamadas lee por `messageId`. Ahi este barrido no tapaba un
    // hueco: FABRICABA basura, una fila fantasma en la bandeja por cada evento
    // de llamada. Al quitarlo, deja de fabricarse sola.
    //
    // Las filas fantasma que ya existan siguen ahi: esto no borra nada. Se
    // limpian aparte.
    //
    // Los indices de arriba y los tres `DELETE` se quedan como estaban.
  })().catch((error) => {
    // Si una sentencia falla, la promesa rechazada NO se queda guardada.
    //
    // Se quedaba: `??=` la memorizaba y todas las escrituras siguientes del
    // proceso reutilizaban el mismo rechazo sin volver a preguntarle a la
    // base. Un tropiezo pasajero de Postgres en el arranque dejaba la
    // persistencia de mensajes rota hasta reiniciar el contenedor, y sin un
    // solo aviso nuevo, porque el error era siempre el de la primera vez.
    //
    // Es el mismo patron que ya usa `ensureFlowTable` en flow-actions.ts.
    ensureTablePromise = null;
    console.error("[chat-persistence] fallo la inicializacion de tablas; se reintentara en la proxima escritura", error);
    throw error;
  });

  return ensureTablePromise;
}

function epochToDate(value?: Date | number | string | null) {
  return horaDelMensaje(value) ?? new Date();
}

/**
 * La hora que trae el mensaje, o `null` si NO trae ninguna.
 *
 * `epochToDate` devuelve la hora de AHORA cuando no hay nada que leer, y eso
 * es inventarse un dato. Para pintar da igual; para guardar no, y costo que los
 * chats borrados volvieran solos:
 *
 * El reloj del chat abierto vuelve a pedir los ultimos mensajes cada 5 s y los
 * persiste. Si uno de esos -viejo, ya guardado, del contacto- llegaba sin hora,
 * se sellaba con la de ahora y el `ON CONFLICT` pisaba la que ya tenia. A
 * partir de ahi ese mensaje era mas nuevo que la marca de borrado, y
 * `levantarMarcasSiElContactoEscribio` quitaba la marca: el chat volvia a la
 * lista sin que el contacto hubiera escrito nada.
 *
 * Es la misma familia que "resincronizar historial NO es novedad" (CLAUDE.md),
 * aplicada a la HORA en vez de al estado de la sesion: volver a traer lo mismo
 * no puede parecer que ha pasado algo.
 */
function horaDelMensaje(value?: Date | number | string | null): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value < 2_000_000_000 ? value * 1000 : value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function dateToEpochSeconds(date: Date | null | undefined) {
  return date ? Math.floor(date.getTime() / 1000) : 0;
}

function normalizeStoredRemoteJid(remoteJid: string, aliases: Array<string | null | undefined> = []) {
  return (
    pickExplicitWhatsAppPhoneJid([remoteJid, ...aliases]) ||
    pickPreferredWhatsAppRemoteJid([remoteJid, ...aliases]) ||
    normalizeWhatsAppConversationJid(remoteJid) ||
    remoteJid.trim()
  );
}

function randomMessageId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isReactionMessageSnapshot(message?: Partial<EvolutionMessage> | null) {
  return message?.messageType === 'reactionMessage' || Boolean(message?.message?.reactionMessage);
}

export function extractMessageText(message: EvolutionMessage) {
  if (isReactionMessageSnapshot(message)) return '';

  const body = message.message ?? {};
  return (
    body.conversation ||
    body.extendedTextMessage?.text ||
    body.imageMessage?.caption ||
    body.videoMessage?.caption ||
    body.documentMessage?.caption ||
    body.audioMessage?.caption ||
    ''
  );
}

function buildMessageContent(row: Pick<PersistedChatMessageRow | InboxRow, 'messageType' | 'content' | 'mediaUrl' | 'raw'>): MessageContent {
  const raw = row.raw as { message?: MessageContent } | MessageContent | null;
  const rawMessage = raw && 'message' in raw ? raw.message : raw;
  if (rawMessage && typeof rawMessage === 'object') {
    const base = {
      ...(rawMessage as MessageContent),
      ...(row.mediaUrl ? { mediaUrl: row.mediaUrl } : {}),
    } as MessageContent;
    // Si el snapshot `raw` NO trae texto pero la fila sí tiene `content`
    // (mensajes de Meta/Cloud API: su `raw` no incluye `conversation`),
    // usamos `content` como texto. Para Evolution no cambia nada, porque su
    // `raw.message` ya trae el texto y esta rama no se activa.
    const b = base as any;
    const hasText =
      b.conversation ||
      b.extendedTextMessage?.text ||
      b.imageMessage?.caption ||
      b.videoMessage?.caption ||
      b.documentMessage?.caption;
    if (!hasText && row.content) {
      b.conversation = row.content;
    }
    return base;
  }

  return {
    conversation: row.content ?? '',
    ...(row.mediaUrl ? { mediaUrl: row.mediaUrl } : {}),
  };
}

function getRawEvolutionSnapshot(raw: Prisma.JsonValue | null): Partial<EvolutionMessage> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const candidate = raw as Record<string, unknown>;
  if (
    'key' in candidate ||
    'status' in candidate ||
    'MessageUpdate' in candidate ||
    'messageTimestamp' in candidate
  ) {
    return candidate as Partial<EvolutionMessage>;
  }

  return null;
}

function getPersistedDeliveryStatus(row: Pick<PersistedChatMessageRow | InboxRow, 'raw' | 'fromMe'>) {
  const snapshot = getRawEvolutionSnapshot(row.raw);
  if (typeof snapshot?.status === 'string' && snapshot.status.trim()) {
    return snapshot.status;
  }

  return row.fromMe ? 'DELIVERY_ACK' : '';
}

function getPersistedMessageUpdates(raw: Prisma.JsonValue | null) {
  const snapshot = getRawEvolutionSnapshot(raw);
  return Array.isArray(snapshot?.MessageUpdate) ? snapshot.MessageUpdate : undefined;
}

function isDeletedMessageEvent(input: Pick<PersistChatMessageInput, 'messageType' | 'raw'>): boolean {
  const raw = input.raw;
  const rawRecord = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : null;
  const message = rawRecord?.message && typeof rawRecord.message === 'object'
    ? (rawRecord.message as Record<string, any>)
    : null;
  const protocolType = message?.protocolMessage?.type ?? rawRecord?.protocolMessage?.type;

  return (
    input.messageType === 'protocolMessage' ||
    input.messageType === 'messageStubType' ||
    input.messageType === 'revokedMessage' ||
    protocolType === 0 ||
    protocolType === 'REVOKE' ||
    protocolType === 'MESSAGE_REVOKE'
  );
}

function hasDisplayableMessagePayload(input: Pick<PersistChatMessageInput, 'messageType' | 'content' | 'mediaUrl'>): boolean {
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  if (content && content !== '-') return true;
  if (input.mediaUrl) return true;

  return !['conversation', 'extendedTextMessage', null, undefined].includes(input.messageType ?? undefined);
}

export function persistedRowToEvolutionMessage(row: PersistedChatMessageRow): EvolutionMessage {
  const rawSnapshot = getRawEvolutionSnapshot(row.raw);
  // Marca de "enviado por el Agente IA/bot" persistida por el backend en `raw`
  // (respuestas del agente y nodos de flujo). Fiable, no depende de heurística.
  const sentByAi =
    !!row.raw && typeof row.raw === 'object' && (row.raw as any).sentByAi === true;

  return {
    id: String(row.id),
    key: {
      ...(rawSnapshot?.key ?? {}),
      id: rawSnapshot?.key?.id || row.messageId,
      fromMe: rawSnapshot?.key?.fromMe ?? row.fromMe,
      remoteJid: rawSnapshot?.key?.remoteJid || row.remoteJid,
      remoteJidAlt: rawSnapshot?.key?.remoteJidAlt || row.remoteJidAlt || undefined,
      senderPn: rawSnapshot?.key?.senderPn || row.senderPn || undefined,
    },
    pushName: rawSnapshot?.pushName ?? row.pushName,
    senderPn: rawSnapshot?.senderPn ?? row.senderPn,
    participant: rawSnapshot?.participant ?? null,
    messageType: rawSnapshot?.messageType ?? row.messageType,
    message: buildMessageContent(row),
    contextInfo: rawSnapshot?.contextInfo ?? null,
    ...(sentByAi ? { sentByAi: true } : {}),
    ...(row.deleted ? { clientDeleted: true } : {}),
    // La reaccion va colgada del propio mensaje (ver `guardarReaccion`), no
    // como fila aparte. Aqui sale para que la burbuja pueda pintarla.
    ...(typeof (row.raw as { reaccion?: unknown } | null)?.reaccion === 'string' &&
    (row.raw as { reaccion: string }).reaccion
      ? { reaccion: (row.raw as { reaccion: string }).reaccion }
      : {}),
    source: rawSnapshot?.source ?? row.instanceType ?? 'local',
    messageTimestamp: rawSnapshot?.messageTimestamp ?? dateToEpochSeconds(row.messageTimestamp),
    instanceId: rawSnapshot?.instanceId ?? row.instanceName,
    sessionId: rawSnapshot?.sessionId ?? null,
    status: getPersistedDeliveryStatus(row),
    MessageUpdate: getPersistedMessageUpdates(row.raw),
  };
}

function inboxRowToChat(row: InboxRow): ChatData {
  const timestamp = row.messageTimestamp ?? row.sessionUpdatedAt;
  const rawSnapshot = getRawEvolutionSnapshot(row.raw);
  const aliases = buildWhatsAppJidCandidates(row.remoteJid, [
    row.remoteJidAlt,
    rawSnapshot?.key?.remoteJid,
    rawSnapshot?.key?.remoteJidAlt,
    rawSnapshot?.key?.senderPn,
    rawSnapshot?.senderPn,
  ]);
  const lastMessage: LastMessage | null = row.messageId
    ? {
        id: String(row.messageId),
        key: {
          ...(rawSnapshot?.key ?? {}),
          id: rawSnapshot?.key?.id || row.messageId,
          fromMe: rawSnapshot?.key?.fromMe ?? Boolean(row.fromMe),
          remoteJid: rawSnapshot?.key?.remoteJid || row.remoteJid,
          remoteJidAlt: rawSnapshot?.key?.remoteJidAlt || row.remoteJidAlt || undefined,
        },
        pushName: rawSnapshot?.pushName ?? row.pushName,
        senderPn: rawSnapshot?.senderPn ?? undefined,
        participant: rawSnapshot?.participant ?? null,
        messageType: rawSnapshot?.messageType || row.messageType || 'conversation',
        message: buildMessageContent(row),
        contextInfo: rawSnapshot?.contextInfo ?? null,
        source: rawSnapshot?.source ?? row.instanceType ?? 'local',
        messageTimestamp: rawSnapshot?.messageTimestamp ?? dateToEpochSeconds(timestamp),
        instanceId: rawSnapshot?.instanceId ?? row.instanceName,
        sessionId: rawSnapshot?.sessionId ?? String(row.sessionId),
        status: getPersistedDeliveryStatus(row),
      }
    : null;

  // Si el último mensaje fue eliminado por el cliente, la lista muestra el aviso
  // (el contenido real se conserva y se ve dentro de la conversación con su badge).
  if (lastMessage && row.lastMessageDeleted) {
    lastMessage.message = { conversation: '🚫 Mensaje eliminado' };
    lastMessage.messageType = 'conversation';
  }

  // Indicador de "pendiente de responder" para canales del store unificado
  // (Telegram/Meta): 1 si el último mensaje es del cliente. WhatsApp/Baileys
  // conservan su comportamiento (0) para no alterar su flujo de no-leídos.
  const isUnifiedChannel = row.instanceType === 'telegram' || row.instanceType === 'meta';
  const unreadCount = isUnifiedChannel && row.fromMe === false ? 1 : 0;

  return {
    id: String(row.sessionId),
    remoteJid: row.remoteJid,
    remoteJidAlt: row.remoteJidAlt,
    pushName: row.pushName,
    profilePicUrl: row.profilePicUrl ?? null,
    unreadCount,
    updatedAt: timestamp.toISOString(),
    lastMessage,
    instanceName: row.instanceName,
    instanceType: row.instanceType ?? undefined,
    aliases,
  };
}

export async function resolveInstanceOwner(instanceName: string) {
  if (!instanceName?.trim()) return null;
  return db.instancia.findFirst({
    where: { instanceName },
    select: {
      userId: true,
      instanceName: true,
      instanceId: true,
      instanceType: true,
    },
  });
}

// Cache corto instanceName -> userId dueño. El mapeo línea→dueño es prácticamente
// inmutable; evita una consulta por cada mensaje al persistir en lote.
const instanceOwnerIdCache = new Map<string, { userId: string | null; at: number }>();
const INSTANCE_OWNER_TTL_MS = 5 * 60 * 1000;

async function resolveInstanceOwnerId(instanceName?: string | null): Promise<string | null> {
  const key = instanceName?.trim();
  if (!key) return null;
  const cached = instanceOwnerIdCache.get(key);
  if (cached && Date.now() - cached.at < INSTANCE_OWNER_TTL_MS) return cached.userId;
  const row = await db.instancia.findFirst({
    where: { instanceName: key },
    select: { userId: true },
  });
  const userId = row?.userId ?? null;
  instanceOwnerIdCache.set(key, { userId, at: Date.now() });
  return userId;
}

/**
 * El aviso de "linea sin dueño", una vez por linea y por rato.
 *
 * Esto corre por CADA mensaje de cada vuelta del sondeo, asi que sin freno una
 * sola linea huerfana llena la consola y tapa todo lo demas. Que salga poco no
 * lo hace mudo: sale, y con el nombre de la linea, que es lo que hace falta
 * para ir a mirarla.
 */
const AVISO_LINEA_SIN_DUENO_MS = 5 * 60 * 1000;
const ultimoAvisoDeLinea = new Map<string, number>();

function avisarLineaSinDueno(instanceName: string | null | undefined, mirando: string) {
  const linea = instanceName?.trim() || '(sin nombre)';
  const ahora = Date.now();
  if (ahora - (ultimoAvisoDeLinea.get(linea) ?? 0) < AVISO_LINEA_SIN_DUENO_MS) return;
  ultimoAvisoDeLinea.set(linea, ahora);
  console.warn('[chats] linea sin dueño en Instancias: no se crea la ficha del CRM', {
    linea,
    mirando,
  });
}

export async function upsertSessionFromChatMessage(input: PersistChatMessageInput) {
  const remoteJid = normalizeStoredRemoteJid(input.remoteJid, [
    input.remoteJidAlt,
    input.senderPn,
  ]);
  const remoteJidAlt = pickObservedAlternateRemoteJid(remoteJid, [
    input.remoteJid,
    input.remoteJidAlt,
    input.senderPn,
  ]);
  const instanceId = input.instanceName;
  const candidates = buildWhatsAppJidCandidates(remoteJid, [
    input.remoteJid,
    input.remoteJidAlt,
    input.senderPn,
  ]);

  // La Session (lead/CRM) SIEMPRE pertenece al dueño real de la línea, nunca a
  // quien la está viendo. En la bandeja unificada un administrador ve chats de
  // otras cuentas; persistir la conversación bajo su userId es correcto para el
  // caché (chat_messages), pero NO debe crear un lead bajo su cuenta.
  //
  // Y si NO se puede resolver el dueño, no se crea ficha. El respaldo era
  // `?? input.userId`, o sea justo lo que la línea de arriba prohíbe: una línea
  // que no aparece en `Instancias` —borrada, renombrada, con el sufijo `_V2`—
  // dejaba el lead a nombre de quien estuviera mirando. Sin dueño no hay lead:
  // es preferible que falte a que aparezca en la cuenta equivocada, y en cuanto
  // la línea se resuelva la ficha se crea sola en la vuelta siguiente.
  const sessionUserId = await resolveInstanceOwnerId(input.instanceName);
  if (!sessionUserId) {
    avisarLineaSinDueno(input.instanceName, input.userId);
    return;
  }

  // Nombre "basura" (mensajes propios, sin nombre): no debe guardarse como
  // nombre del lead. 'Você'/'Voce' es lo que WhatsApp asigna a los mensajes
  // salientes (fromMe).
  //
  // También se rechaza el nombre de la PROPIA línea: WhatsApp a veces manda el
  // nombre de tu perfil como pushName de un mensaje entrante (sincronización de
  // historial, mensajes en contexto de negocio), y así un lead real acababa
  // llamándose "Verzay Atención". Se compara normalizado, porque la instancia se
  // llama "VERZAY_ATENCION" y el perfil "Verzay Atención".
  const esNombreDeLaLinea =
    !!input.pushName && normalizarNombre(input.pushName) === normalizarNombre(input.instanceName);
  const cleanPushName =
    isBadPushName(input.pushName) || esNombreDeLaLinea ? undefined : input.pushName?.trim();

  // Se busca DENTRO DE LA LINEA, no en toda la cuenta.
  //
  // Una cuenta puede tener varias lineas independientes -Ventas, Atencion,
  // Notificaciones, Pruebas-, cada una con su propio QR, y el mismo numero puede
  // escribir por varias. El lead es de la LINEA: eso es lo que dice el candado
  // de la propia tabla, `@@unique([userId, instanceId, remoteJid])`, y lo que ya
  // hacia `registerSession`. Aqui faltaba, y era el unico sitio por el que
  // entran los mensajes de verdad.
  //
  // Sin el `instanceId`, un mensaje que llegaba por Atencion encontraba el lead
  // que ese numero tenia en Notificaciones y le reescribia la linea (mas abajo
  // se guarda `instanceId`). O sea: una sola ficha por numero para toda la
  // cuenta, saltando de linea en linea segun por donde entrara el ultimo
  // mensaje. Por eso un contacto aparecia listado en una linea por la que nunca
  // habia escrito, y por eso volvia despues de borrarlo.
  const existing = await db.session.findFirst({
    where: {
      userId: sessionUserId,
      instanceId,
      OR: [
        { remoteJid: { in: candidates } },
        { remoteJidAlt: { in: candidates } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, pushName: true },
  });

  if (existing) {
    // Un nombre que ya vale —o el que el usuario editó a mano— NO se pisa con el
    // que traiga un mensaje posterior. El nombre se toma una vez, cuando entra el
    // lead, y a partir de ahí solo lo cambia la edición manual. Antes se
    // reescribía en cada mensaje, así que un entrante con el nombre de la línea
    // borraba el bueno una y otra vez.
    const nombreAEscribir = esNombreBueno(existing.pushName) ? undefined : cleanPushName || undefined;
    // Una conversacion resuelta se guarda apagada (`status = false`) y sale de
    // la lista de chats. Si el CLIENTE vuelve a escribir se reabre sola: el
    // asunto no estaba cerrado. Solo con un entrante -que el asesor conteste en
    // una resuelta no la reabre, igual que responder a un correo archivado no
    // lo desarchiva.
    // Y solo si el mensaje es NOVEDAD, no historial que ya teniamos.
    //
    // Aqui estaba el fallo de "el asesor escribe y la IA no se calla". La pausa
    // se escribia bien: `pausarIaPorIntervencionHumana` ponia `status = false`.
    // Pero el sondeo del chat abierto vuelve a pedirle a Evolution los ultimos
    // mensajes CADA POCOS SEGUNDOS y los persiste; entre ellos van los del
    // cliente, que son entrantes, y cada uno reabria la sesion. O sea: el asesor
    // pausaba, y cinco segundos despues nuestro propio reloj despausaba, sin que
    // el cliente hubiera escrito nada nuevo.
    //
    // La reapertura sigue existiendo -si el cliente escribe de verdad, la
    // conversacion vuelve a abrirse-, pero solo por los caminos que traen
    // novedad, no por el que resincroniza historial.
    const reabrir = input.fromMe || input.puedeReabrir === false ? undefined : true;
    try {
      await db.session.update({
        where: { id: existing.id },
        data: {
          remoteJid,
          remoteJidAlt,
          pushName: nombreAEscribir,
          instanceId,
          status: reabrir,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      // Colisión con el índice único (userId, instanceId, remoteJid): ya existe
      // OTRA sesión con ese remoteJid canónico (duplicado @lid vs número real).
      // NO se fuerza la normalización del remoteJid/instanceId (que rompía el
      // envío); se refrescan solo los campos seguros. La consolidación de
      // duplicados se maneja aparte. Ver [[project_session_duplicates]].
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        await db.session
          .update({
            where: { id: existing.id },
            data: {
              remoteJidAlt,
              pushName: nombreAEscribir,
              // Tambien aqui: por este camino pasan los chats con el JID
              // duplicado, y si no se reabre se quedarian resueltos para
              // siempre aunque el cliente siguiera escribiendo.
              status: reabrir,
              updatedAt: new Date(),
            },
          })
          .catch(() => {
            // best-effort: la sesión ya existe; no romper la persistencia/envío.
          });
      }
      // Cualquier otro error tampoco debe romper el flujo (el mensaje ya se envió).
    }
    return;
  }

  // Un lead se origina cuando el CLIENTE escribe (mensaje entrante). Los mensajes
  // salientes (fromMe, 'Você') NO deben crear leads nuevos: hacerlo generaba
  // sesiones fantasma duplicadas del propio número. Si la sesión ya existe, el
  // bloque anterior la actualiza; si no existe, no la creamos desde un saliente.
  if (input.fromMe) return;

  // Creación idempotente: el índice único (userId, instanceId, remoteJid) impide
  // duplicados; ON CONFLICT DO NOTHING absorbe cualquier carrera concurrente.
  await db.$executeRaw`
    INSERT INTO "Session" ("userId", "remoteJid", "remoteJidAlt", "pushName", "instanceId", "status", "createdAt", "updatedAt")
    SELECT ${sessionUserId}, ${remoteJid}, ${remoteJidAlt}, ${cleanPushName || remoteJid}, ${instanceId}, true, NOW(), NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM "Session"
      WHERE "userId" = ${sessionUserId}
        AND "instanceId" = ${instanceId}
        AND ("remoteJid" = ANY(${candidates}::text[]) OR "remoteJidAlt" = ANY(${candidates}::text[]))
    )
    ON CONFLICT ("userId", "instanceId", "remoteJid") DO NOTHING
  `;
}

// 'Você'/'Voce' = nombre que WhatsApp asigna a mensajes propios (fromMe); junto
// con vacío/'.'/'desconocido' no son nombres reales de lead. Espeja isBadName
// del backend (session.service).
function isBadPushName(name?: string | null) {
  const lower = (name ?? '').toLowerCase().trim();
  return lower === '' || lower === '.' || lower === 'desconocido' || lower === 'você' || lower === 'voce';
}

// Sin acentos, en minúsculas y con espacios/guiones bajos colapsados. Sirve para
// comparar el nombre que llega con el de la propia línea: la instancia se llama
// "VERZAY_ATENCION" y su perfil "Verzay Atención" — misma cosa una vez
// normalizadas.
const DIACRITICOS = /[̀-ͯ]/g;
function normalizarNombre(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
}

// Un nombre real que ya vale la pena conservar: ni basura, ni una ristra de
// dígitos (el identificador de un @lid). Se usa para NO pisar un nombre bueno
// —o el que el usuario editó a mano— con el que traiga un mensaje posterior.
function esNombreBueno(name?: string | null): boolean {
  const limpio = (name ?? '').trim();
  if (!limpio || isBadPushName(limpio)) return false;
  return !/^\d{6,}$/.test(limpio);
}

/**
 * Marca un mensaje como eliminado en la copia local, conservando su contenido:
 * el panel lo pinta como "Eliminado" en la burbuja y en la lista.
 *
 * Lo usan los dos caminos por los que un mensaje puede desaparecer: el evento
 * de borrado que manda WhatsApp cuando lo borra el cliente, y el borrado que
 * hace un administrador desde el panel. Sin esto, el borrado del panel solo
 * llegaba a WhatsApp y el mensaje reaparecia al recargar el chat, porque la
 * copia local seguia intacta.
 *
 * Se busca solo por el ID de WhatsApp, que es unico a nivel global: exigir
 * ademas el remoteJid falla en los chats que entraron por `@lid`.
 */
export async function marcarMensajeComoEliminado(params: {
  userId: string;
  instanceName: string;
  messageId: string;
}): Promise<void> {
  const { userId, instanceName, messageId } = params;
  if (!userId || !instanceName || !messageId) return;

  await db.$executeRaw`
    UPDATE "chat_messages" SET "deleted" = TRUE, "updatedAt" = NOW()
    WHERE "userId" = ${userId}
      AND "instanceName" = ${instanceName}
      AND "messageId" = ${messageId}
  `.catch(() => {});
  await db.$executeRaw`
    UPDATE "chat_conversations" SET "lastMessageDeleted" = TRUE, "updatedAt" = NOW()
    WHERE "userId" = ${userId}
      AND "instanceName" = ${instanceName}
      AND "lastMessageId" = ${messageId}
  `.catch(() => {});
}

/**
 * El mismo mensaje con otro texto, dentro del `raw`.
 *
 * Hace falta tocar el `raw` y no solo la columna `content` porque quien decide
 * qué se pinta es `buildMessageContent`, y **el `raw` gana**: si su
 * `message` trae texto, `content` ni se mira. Guardando solo `content`, la
 * edición se veía únicamente en la pestaña de quien la hizo y desaparecía al
 * recargar.
 *
 * Se escribe donde el mensaje ya tenía su texto, porque la burbuja lo lee
 * **según el tipo**: un `extendedTextMessage` —cualquier texto con enlace o con
 * cita— busca `extendedTextMessage.text` y no mira `conversation`. Poner el
 * texto en el sitio equivocado deja la burbuja vacía, que es el mismo fallo que
 * ya costó una tarde con los avisos en vivo.
 *
 * Es pura: entra el `raw` y sale otro `raw`. No toca la base.
 */
export function conElTextoEditado(raw: unknown, texto: string): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;

  const copia = JSON.parse(JSON.stringify(raw)) as Record<string, any>;
  // El `raw` puede ser la foto entera del mensaje (con `message` dentro) o solo
  // su contenido. Es la misma distinción que hace `buildMessageContent`.
  const contenido = ('message' in copia ? copia.message : copia) as Record<string, any> | null;
  if (!contenido || typeof contenido !== 'object') return raw;

  if (contenido.extendedTextMessage && typeof contenido.extendedTextMessage === 'object') {
    contenido.extendedTextMessage.text = texto;
  } else if (contenido.imageMessage && typeof contenido.imageMessage === 'object') {
    contenido.imageMessage.caption = texto;
  } else if (contenido.videoMessage && typeof contenido.videoMessage === 'object') {
    contenido.videoMessage.caption = texto;
  } else if (contenido.documentMessage && typeof contenido.documentMessage === 'object') {
    contenido.documentMessage.caption = texto;
  } else {
    contenido.conversation = texto;
  }

  return copia;
}

/**
 * Guarda el texto nuevo de un mensaje editado.
 *
 * Sin esto la edición vivía SOLO en la pestaña que la hizo: es un `Map` en
 * memoria del navegador (`editedContent`). Los demás asesores seguían viendo el
 * texto viejo, y quien editaba lo perdía al recargar. En WhatsApp sí quedaba
 * cambiado, así que la App acababa contando algo distinto de lo que el cliente
 * tenía en su teléfono.
 *
 * Se escribe en los dos sitios que lo pintan: el mensaje y —solo si es el
 * último de esa conversación— la fila de la lista.
 */
export async function guardarMensajeEditado(params: {
  userId: string;
  instanceName: string;
  messageId: string;
  texto: string;
}): Promise<void> {
  const { userId, instanceName, messageId } = params;
  const texto = (params.texto ?? '').trim();
  if (!userId || !instanceName || !messageId || !texto) return;

  try {
    const filas = await db.$queryRaw<{ raw: Prisma.JsonValue | null }[]>`
      SELECT "raw" FROM "chat_messages"
      WHERE "userId" = ${userId}
        AND "instanceName" = ${instanceName}
        AND "messageId" = ${messageId}
      LIMIT 1
    `;

    // Sin fila guardada no hay nada que corregir: el mensaje se editó en
    // WhatsApp igualmente y el sondeo lo traerá. Se dice, porque desde fuera
    // esto se ve como "a los demás no les cambió".
    if (!filas.length) {
      console.warn('[chats] mensaje editado sin copia local que actualizar', {
        instanceName,
        messageId,
      });
      return;
    }

    const rawNuevo = conElTextoEditado(filas[0].raw, texto) as Prisma.InputJsonValue | null;

    await db.$executeRaw`
      UPDATE "chat_messages"
      SET "content" = ${texto},
          "raw" = ${rawNuevo === null ? Prisma.DbNull : rawNuevo},
          "editedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE "userId" = ${userId}
        AND "instanceName" = ${instanceName}
        AND "messageId" = ${messageId}
    `;

    await db.$executeRaw`
      UPDATE "chat_conversations"
      SET "lastMessageContent" = ${texto},
          "lastMessageRaw" = ${rawNuevo === null ? Prisma.DbNull : rawNuevo},
          "updatedAt" = NOW()
      WHERE "userId" = ${userId}
        AND "instanceName" = ${instanceName}
        AND "lastMessageId" = ${messageId}
    `;

    invalidatePersistedInboxCache();
  } catch (error) {
    // Nunca mudo: si esto falla, la edición se ve en una pestaña y en ninguna
    // otra, que es justo el síntoma que se vino a arreglar.
    console.error('[chats] no se pudo guardar el mensaje editado', { instanceName, messageId, error });
  }
}

/**
 * Guarda la reacción de un mensaje, EN EL PROPIO MENSAJE.
 *
 * Una reacción no se guarda como fila aparte a propósito. Este proyecto
 * las rechaza en `persistChatMessage` y las excluye al leer la bandeja y la
 * conversación, y con razón: una reacción no es un mensaje, y colada como fila
 * acababa siendo el «último mensaje» de la fila de la lista —la conversación
 * decía 👍 en vez de lo que se habló—.
 *
 * Así que el emoji viaja dentro del `raw` del mensaje al que reaccionaron. Sin
 * filas nuevas no hay nada que ensucie la bandeja, y el emoji va donde tiene
 * que estar: pegado a su mensaje, para todos y después de recargar.
 *
 * Un emoji vacío QUITA la reacción, que es como lo dicen los dos proveedores.
 */
export async function guardarReaccion(params: {
  userId: string;
  instanceName: string;
  messageId: string;
  emoji: string;
}): Promise<void> {
  const { userId, instanceName, messageId } = params;
  if (!userId || !instanceName || !messageId) return;
  const emoji = (params.emoji ?? '').trim();

  try {
    const filas = await db.$queryRaw<{ raw: Prisma.JsonValue | null }[]>`
      SELECT "raw" FROM "chat_messages"
      WHERE "userId" = ${userId}
        AND "instanceName" = ${instanceName}
        AND "messageId" = ${messageId}
      LIMIT 1
    `;

    // Sin copia local no hay donde colgarla. Se dice, porque desde fuera esto
    // se ve como «reaccioné y no quedó nada».
    if (!filas.length) {
      console.warn('[chats] reaccion sin copia local del mensaje', { instanceName, messageId });
      return;
    }

    const base = filas[0].raw;
    const copia =
      base && typeof base === 'object' && !Array.isArray(base)
        ? (JSON.parse(JSON.stringify(base)) as Record<string, unknown>)
        : ({} as Record<string, unknown>);
    if (emoji) copia.reaccion = emoji;
    else delete copia.reaccion;

    await db.$executeRaw`
      UPDATE "chat_messages"
      SET "raw" = ${copia as Prisma.InputJsonValue},
          "updatedAt" = NOW()
      WHERE "userId" = ${userId}
        AND "instanceName" = ${instanceName}
        AND "messageId" = ${messageId}
    `;

    invalidatePersistedInboxCache();
  } catch (error) {
    console.error('[chats] no se pudo guardar la reaccion', { instanceName, messageId, error });
  }
}

/**
 * Borra un mensaje DE VERDAD: la fila desaparece, sin dejar el aviso
 * "Eliminado" ni rastro de su contenido.
 *
 * Distinto a marcarMensajeComoEliminado (que conserva el contenido y solo lo
 * marca), que es lo correcto cuando el CLIENTE borra su propio mensaje en
 * WhatsApp: ahí sí hay que reflejar que eso pasó. Este otro lo usa el
 * administrador desde el panel, donde borrar significa borrar, no dejar una
 * marca que además puede confundirse con un mensaje distinto que diga lo
 * mismo (dos mensajes iguales, uno se borra, el otro no tiene nada que ver).
 */
export async function eliminarMensajeDelTodo(params: {
  userId: string;
  instanceName: string;
  remoteJid: string;
  messageId: string;
  fromMe: boolean;
}): Promise<void> {
  const { userId, instanceName, remoteJid, messageId, fromMe } = params;
  if (!userId || !instanceName || !remoteJid || !messageId) return;

  try {
    await db.$executeRaw`
      DELETE FROM "chat_messages"
      WHERE "userId" = ${userId}
        AND "instanceName" = ${instanceName}
        AND "remoteJid" = ${remoteJid}
        AND "messageId" = ${messageId}
        AND "fromMe" = ${fromMe}
    `;

    // Si era el ultimo mensaje de la conversacion, la vista previa de la lista
    // (chat_conversations) queda apuntando a una fila que ya no existe. Se
    // recalcula desde el mensaje que ahora queda de ultimo, si hay alguno.
    //
    // FROM LATERAL correlacionado con la tabla del UPDATE (c) no es valido en
    // Postgres ("invalid reference to FROM-clause entry for table"): el
    // target de un UPDATE no entra en el scope que LATERAL puede referenciar.
    // Como aqui ya se conoce la conversacion exacta (remoteJid puntual, no un
    // patron), un subquery normal sin LATERAL basta.
    await db.$executeRaw`
      UPDATE "chat_conversations" c SET
        "lastMessageId" = m."messageId",
        "lastMessageFromMe" = m."fromMe",
        "lastMessageType" = m."messageType",
        "lastMessageContent" = m."content",
        "lastMessageMediaUrl" = m."mediaUrl",
        "lastMessageRaw" = m."raw",
        "lastMessageTimestamp" = m."messageTimestamp",
        "lastMessageDeleted" = m."deleted",
        "updatedAt" = NOW()
      FROM (
        SELECT "messageId", "fromMe", "messageType", "content", "mediaUrl", "raw", "messageTimestamp", "deleted"
        FROM "chat_messages"
        WHERE "userId" = ${userId} AND "instanceName" = ${instanceName} AND "remoteJid" = ${remoteJid}
        ORDER BY "messageTimestamp" DESC, "id" DESC
        LIMIT 1
      ) m
      WHERE c."userId" = ${userId}
        AND c."instanceName" = ${instanceName}
        AND c."remoteJid" = ${remoteJid}
        AND c."lastMessageId" = ${messageId}
    `.catch(() => {});
  } catch (error) {
    console.error('[eliminarMensajeDelTodo]', error);
  }
}

export async function persistChatMessage(input: PersistChatMessageInput) {
  if (!input.userId || !input.instanceName || !input.remoteJid) return;
  if (
    input.messageType === 'reactionMessage' ||
    (input.raw &&
      typeof input.raw === 'object' &&
      !Array.isArray(input.raw) &&
      Boolean((input.raw as any).message?.reactionMessage))
  ) {
    return;
  }

  await ensureChatMessagesTable();

  const normalizedRemoteJid = normalizeStoredRemoteJid(input.remoteJid, [
    input.remoteJidAlt,
    input.senderPn,
  ]);
  const remoteJidAlt = pickObservedAlternateRemoteJid(normalizedRemoteJid, [
    input.remoteJid,
    input.remoteJidAlt,
    input.senderPn,
  ]);
  const messageId =
    input.messageId?.trim() ||
    randomMessageId(input.fromMe ? 'outgoing' : 'incoming');
  // Si la hora viene de VERDAD en el mensaje o nos la hemos puesto nosotros.
  // Lo segundo vale para dar de alta un mensaje nuevo -algo hay que poner-, pero
  // NO para pisar la hora de uno que ya estaba guardado (ver `horaDelMensaje`).
  const horaReal = horaDelMensaje(input.messageTimestamp);
  const messageTimestamp = horaReal ?? new Date();
  const isDeleteEvent = isDeletedMessageEvent(input);
  const hasDisplayablePayload = hasDisplayableMessagePayload(input);

  // Nombre a guardar en la bandeja: ni basura ni el nombre de la propia línea
  // (WhatsApp a veces manda el de tu perfil como pushName de un entrante). Mismo
  // criterio que en la sesión CRM. Null cuando no hay nombre válido, para que el
  // COALESCE conserve el que ya hubiera.
  const esNombreDeLaLineaMsg =
    !!input.pushName && normalizarNombre(input.pushName) === normalizarNombre(input.instanceName);
  const pushNameLimpio =
    isBadPushName(input.pushName) || esNombreDeLaLineaMsg ? null : input.pushName?.trim() || null;

  // Sobres internos de WhatsApp (la edición de un mensaje, el voto de una
  // encuesta): no se guardan. Pasaban el filtro de payload por no ser texto y
  // acababan como una burbuja vacía con el nombre del tipo.
  if (esSobreInternoDeWhatsapp(input.messageType)) return;

  if (isDeleteEvent) {
    // El cliente borró un mensaje ("eliminar para todos"). NO se persiste el
    // evento, pero se MARCA el mensaje original como eliminado (conservando su
    // contenido) para que el panel muestre "Eliminado" en la burbuja y en la lista.
    const rawRec =
      input.raw && typeof input.raw === 'object' && !Array.isArray(input.raw)
        ? (input.raw as Record<string, any>)
        : null;
    const targetId: string | undefined =
      rawRec?.message?.protocolMessage?.key?.id ?? rawRec?.protocolMessage?.key?.id;
    if (targetId) {
      // Se busca el mensaje original SOLO por su ID de WhatsApp (que es único a
      // nivel global), sin exigir que el remoteJid coincida. Antes se filtraba
      // también por remoteJid, pero en los mensajes RECIBIDOS el número guardado
      // a veces difiere del que llega en el evento de borrado (caso @lid): el
      // original no se encontraba y se perdía su texto, mostrando "Mensaje
      // eliminado" en blanco. Marcando por ID se conserva el contenido igual que
      // en los mensajes enviados.
      await marcarMensajeComoEliminado({
        userId: input.userId,
        instanceName: input.instanceName,
        messageId: targetId,
      });
    }
    return;
  }

  if (!hasDisplayablePayload) {
    return;
  }

  await upsertSessionFromChatMessage({
    ...input,
    remoteJid: normalizedRemoteJid,
    remoteJidAlt,
    messageId,
    messageTimestamp,
  });

  await db.$executeRaw`
    INSERT INTO "chat_messages" (
      "userId", "instanceName", "instanceType", "remoteJid", "remoteJidAlt", "senderPn",
      "messageId", "fromMe", "pushName", "messageType", "content", "mediaUrl", "raw",
      "messageTimestamp", "createdAt", "updatedAt"
    )
    VALUES (
      ${input.userId}, ${input.instanceName}, ${input.instanceType ?? null}, ${normalizedRemoteJid},
      ${remoteJidAlt}, ${input.senderPn ?? null}, ${messageId}, ${input.fromMe},
      ${pushNameLimpio}, ${input.messageType ?? 'conversation'}, ${input.content ?? null},
      ${input.mediaUrl ?? null}, ${recortarRawAdjuntos(input.raw)}, ${messageTimestamp}, NOW(), NOW()
    )
    ON CONFLICT ("userId", "instanceName", "remoteJid", "messageId", "fromMe")
    DO UPDATE SET
      "remoteJidAlt" = COALESCE(EXCLUDED."remoteJidAlt", "chat_messages"."remoteJidAlt"),
      "senderPn" = COALESCE(EXCLUDED."senderPn", "chat_messages"."senderPn"),
      "pushName" = COALESCE(EXCLUDED."pushName", "chat_messages"."pushName"),
      "messageType" = CASE
        WHEN EXCLUDED."content" IS NULL AND EXCLUDED."mediaUrl" IS NULL
          THEN "chat_messages"."messageType"
        ELSE EXCLUDED."messageType"
      END,
      -- Lo que un asesor corrigio a mano NO se pisa. Evolution devuelve el
      -- mensaje con su texto original en cada vuelta del sondeo, asi que sin
      -- esto la correccion se veia unos segundos y volvia sola al texto viejo.
      "content" = CASE
        WHEN "chat_messages"."editedAt" IS NOT NULL THEN "chat_messages"."content"
        ELSE COALESCE(EXCLUDED."content", "chat_messages"."content")
      END,
      "mediaUrl" = COALESCE(EXCLUDED."mediaUrl", "chat_messages"."mediaUrl"),
      "raw" = CASE
        WHEN "chat_messages"."editedAt" IS NOT NULL THEN "chat_messages"."raw"
        WHEN EXCLUDED."content" IS NULL AND EXCLUDED."mediaUrl" IS NULL
          THEN "chat_messages"."raw"
        -- Preservar el marcador { sentByAi: true } que puso el backend al enviar por
        -- IA/flujo/automatización: el snapshot de Evolution NO lo trae y, al reemplazar
        -- raw, borraba el flag → el mensaje automático se veía como "Asesor". Se
        -- reinyecta sentByAi sobre el snapshot nuevo (conservando status/ticks/etc.).
        WHEN ("chat_messages"."raw" ->> 'sentByAi') = 'true'
          THEN jsonb_set(COALESCE(EXCLUDED."raw", '{}'::jsonb), '{sentByAi}', 'true'::jsonb)
        ELSE COALESCE(EXCLUDED."raw", "chat_messages"."raw")
      END,
      -- La hora de la fila solo se pisa con una hora REAL. Con una inventada
      -- -el mensaje llego sin hora y le pusimos la de ahora- se conserva la que
      -- ya tenia: si no, el sondeo envejecia hacia HOY mensajes viejos y eso
      -- levantaba la marca de los chats borrados.
      "messageTimestamp" = CASE
        WHEN NOT ${horaReal !== null}::boolean
          THEN "chat_messages"."messageTimestamp"
        WHEN EXCLUDED."content" IS NULL AND EXCLUDED."mediaUrl" IS NULL
          THEN "chat_messages"."messageTimestamp"
        ELSE EXCLUDED."messageTimestamp"
      END,
      "updatedAt" = NOW()
  `;

  await db.$executeRaw`
    INSERT INTO "chat_conversations" (
      "userId", "instanceName", "instanceType", "remoteJid", "remoteJidAlt", "senderPn",
      "pushName", "lastMessageId", "lastMessageFromMe", "lastMessageType",
      "lastMessageContent", "lastMessageMediaUrl", "lastMessageRaw",
      "lastMessageTimestamp", "createdAt", "updatedAt"
    )
    VALUES (
      ${input.userId}, ${input.instanceName}, ${input.instanceType ?? null}, ${normalizedRemoteJid},
      ${remoteJidAlt}, ${input.senderPn ?? null}, ${pushNameLimpio},
      ${messageId}, ${input.fromMe}, ${input.messageType ?? 'conversation'},
      ${input.content ?? null}, ${input.mediaUrl ?? null}, ${recortarRawParaBandeja(input.raw)},
      ${messageTimestamp}, NOW(), NOW()
    )
    ON CONFLICT ("userId", "instanceName", "remoteJid")
    DO UPDATE SET
      "instanceType" = COALESCE(EXCLUDED."instanceType", "chat_conversations"."instanceType"),
      "remoteJidAlt" = COALESCE(EXCLUDED."remoteJidAlt", "chat_conversations"."remoteJidAlt"),
      "senderPn" = COALESCE(EXCLUDED."senderPn", "chat_conversations"."senderPn"),
      -- El nombre se conserva una vez capturado: solo se rellena cuando el que
      -- había está vacío o es un número (@lid). Así un mensaje posterior con el
      -- nombre de la línea no pisa el bueno, ni el que el usuario editó a mano.
      "pushName" = CASE
        WHEN "chat_conversations"."pushName" IS NULL
          OR btrim("chat_conversations"."pushName") = ''
          OR "chat_conversations"."pushName" ~ '^[0-9]{6,}$'
        THEN COALESCE(EXCLUDED."pushName", "chat_conversations"."pushName")
        ELSE "chat_conversations"."pushName"
      END,
      "lastMessageId" = EXCLUDED."lastMessageId",
      "lastMessageFromMe" = EXCLUDED."lastMessageFromMe",
      "lastMessageType" = EXCLUDED."lastMessageType",
      "lastMessageContent" = EXCLUDED."lastMessageContent",
      -- Mismo mensaje re-persistido (re-sync sin mediaUrl) NO debe nulear el preview;
      -- un mensaje NUEVO sí usa su propio valor (null si el último pasa a ser texto).
      "lastMessageMediaUrl" = CASE
        WHEN EXCLUDED."lastMessageId" IS DISTINCT FROM "chat_conversations"."lastMessageId"
          THEN EXCLUDED."lastMessageMediaUrl"
        ELSE COALESCE(EXCLUDED."lastMessageMediaUrl", "chat_conversations"."lastMessageMediaUrl")
      END,
      "lastMessageRaw" = EXCLUDED."lastMessageRaw",
      "lastMessageTimestamp" = EXCLUDED."lastMessageTimestamp",
      -- Solo se limpia la marca de eliminado si llega un mensaje NUEVO (id
      -- distinto). Re-persistir el mismo último mensaje (re-sync, reentrega de
      -- Evolution) NO debe borrarla, o la lista pierde el "Mensaje eliminado".
      "lastMessageDeleted" = CASE
        WHEN EXCLUDED."lastMessageId" IS DISTINCT FROM "chat_conversations"."lastMessageId"
          THEN FALSE
        ELSE "chat_conversations"."lastMessageDeleted"
      END,
      "updatedAt" = NOW()
    WHERE "chat_conversations"."lastMessageTimestamp" IS NULL
       OR (
        "chat_conversations"."lastMessageTimestamp" <= EXCLUDED."lastMessageTimestamp"
        AND ${hasDisplayablePayload}
       )
  `;
}

export async function persistEvolutionMessages(params: {
  userId: string;
  instanceName: string;
  instanceType?: string | null;
  remoteJid: string;
  messages: EvolutionMessage[];
}) {
  const toPersist = params.messages.filter((message) => !isReactionMessageSnapshot(message));

  // Persistir en lotes concurrentes en vez de uno-por-uno: cada persistChatMessage
  // es idempotente (ON CONFLICT + índice único) y todas las llamadas tocan las
  // filas de sesión/conversación en el mismo orden, así que no hay riesgo de
  // duplicados ni de deadlock. La concurrencia se acota para no agotar el pool.
  const PERSIST_CONCURRENCY = 5;
  for (let i = 0; i < toPersist.length; i += PERSIST_CONCURRENCY) {
    const batch = toPersist.slice(i, i + PERSIST_CONCURRENCY);
    await Promise.all(
      batch.map((message) => {
        // Identidad canónica del mensaje. El eco de un saliente que devuelve
        // Evolution puede venir SOLO con @lid en key.remoteJid (sin el número real
        // entre los candidatos), y entonces se guardaba bajo @lid, duplicando el
        // mismo mensaje (mismo messageId, fromMe=true) que el panel ya había
        // guardado bajo el número real. Aquí SIEMPRE conocemos el JID canónico de
        // la conversación (params.remoteJid), así que lo damos como candidato para
        // que gane el número real cuando exista; el @lid pasa a remoteJidAlt, nunca
        // como clave. Así el eco choca por ON CONFLICT en vez de duplicar.
        const rawMsgJid = message.key?.remoteJid || params.remoteJid;
        const canonicalMsgJid = normalizeStoredRemoteJid(rawMsgJid, [
          message.key?.remoteJidAlt,
          message.key?.senderPn,
          message.senderPn,
          params.remoteJid,
        ]);
        const altFromRaw =
          rawMsgJid && rawMsgJid !== canonicalMsgJid ? rawMsgJid : undefined;
        return persistChatMessage({
          // Esto es historial que se resincroniza, no novedad: el reloj del chat
          // abierto pasa por aqui cada pocos segundos con los MISMOS mensajes.
          // Si se dejara reabrir, cada vuelta despausaria la conversacion que el
          // asesor acaba de pausar al escribir.
          puedeReabrir: false,
          userId: params.userId,
          instanceName: params.instanceName,
          instanceType: params.instanceType ?? 'evolution',
          remoteJid: canonicalMsgJid,
          remoteJidAlt: message.key?.remoteJidAlt || altFromRaw,
          senderPn: message.key?.senderPn || message.senderPn,
          messageId: message.key?.id || message.id,
          fromMe: Boolean(message.key?.fromMe),
          pushName: message.pushName,
          messageType: message.messageType || 'conversation',
          content: extractMessageText(message),
          mediaUrl: message.message?.mediaUrl,
          raw: message as unknown as Prisma.InputJsonValue,
          messageTimestamp: message.messageTimestamp,
        }).catch((error) => {
          // Una falla puntual no debe abortar el resto del lote.
          console.error('[chat-persistence] persistChatMessage falló:', error);
        });
      }),
    );
  }
}

export async function getPersistedMessages(params: {
  /** Conjunto de cuentas autorizadas (dueño de la línea + cuentas del equipo/quien
   *  ve). Se consulta con IN (...) para no perder historial guardado bajo un userId
   *  distinto tras cambios de propiedad de la línea. */
  userIds: string[];
  remoteJid: string;
  instanceName?: string | null;
  aliases?: string[];
  take?: number;
  skip?: number;
}) {
  const userIds = Array.from(new Set((params.userIds ?? []).filter(Boolean)));
  if (!userIds.length) return [];
  const candidates = buildWhatsAppJidCandidates(params.remoteJid, params.aliases ?? []);

  return readWithTablesFallback(async () => {
  const __t0 = performance.now();
  const rows = await db.$queryRaw<PersistedChatMessageRow[]>`
    WITH matched AS (
      SELECT *
      FROM "chat_messages"
      WHERE "userId" IN (${Prisma.join(userIds)})
        ${params.instanceName ? Prisma.sql`AND "instanceName" = ${params.instanceName}` : Prisma.empty}
        AND "messageType" <> 'reactionMessage'
        AND NOT (
          "messageType" IN ('conversation', 'extendedTextMessage')
          AND COALESCE(NULLIF(BTRIM("content"), ''), '-') = '-'
          AND "mediaUrl" IS NULL
        )
        AND "remoteJid" IN (${Prisma.join(candidates)})
      UNION ALL
      SELECT *
      FROM "chat_messages"
      WHERE "userId" IN (${Prisma.join(userIds)})
        ${params.instanceName ? Prisma.sql`AND "instanceName" = ${params.instanceName}` : Prisma.empty}
        AND "messageType" <> 'reactionMessage'
        AND NOT (
          "messageType" IN ('conversation', 'extendedTextMessage')
          AND COALESCE(NULLIF(BTRIM("content"), ''), '-') = '-'
          AND "mediaUrl" IS NULL
        )
        AND "remoteJidAlt" IN (${Prisma.join(candidates)})
      UNION ALL
      SELECT *
      FROM "chat_messages"
      WHERE "userId" IN (${Prisma.join(userIds)})
        ${params.instanceName ? Prisma.sql`AND "instanceName" = ${params.instanceName}` : Prisma.empty}
        AND "messageType" <> 'reactionMessage'
        AND NOT (
          "messageType" IN ('conversation', 'extendedTextMessage')
          AND COALESCE(NULLIF(BTRIM("content"), ''), '-') = '-'
          AND "mediaUrl" IS NULL
        )
        AND "senderPn" IN (${Prisma.join(candidates)})
    ),
    deduped AS (
      -- "deleted" DESC primero: si un mismo mensaje quedó en varias filas (típico
      -- con @lid: número real + @lid) y una resync creó una fila nueva sin la marca
      -- después del borrado, igual gana la fila eliminada → se conserva el badge.
      -- Por el id de WhatsApp, no por la forma en que lo entrego el proveedor.
      -- Waha lo serializa (true_573001@c.us_3EB0A1B2) y Evolution entrega el
      -- mismo mensaje pelado (3EB0A1B2): guardados los dos, la conversacion
      -- pintaba el mensaje DOS VECES. Pasa al cambiar una linea de proveedor,
      -- cuando el historial trae mensajes escritos con las dos formas. Solo se
      -- desarma la forma de Waha; los ids de Meta pueden llevar guiones bajos
      -- dentro y recortarlos por ahi si podria confundir dos mensajes distintos.
      SELECT DISTINCT ON (regexp_replace("messageId", '^(true|false)_.*_', ''), "fromMe") *
      FROM matched
      ORDER BY regexp_replace("messageId", '^(true|false)_.*_', ''), "fromMe", "deleted" DESC, ("raw"->'key' IS NOT NULL) DESC, "messageTimestamp" DESC, "id" DESC
      )
    SELECT *
    FROM deduped
    ORDER BY "messageTimestamp" DESC, "id" DESC
    OFFSET ${params.skip ?? 0}
    LIMIT ${params.take ?? 50}
  `;
  const __ms = performance.now() - __t0;
  if (__ms > 500) console.error(`[PERF] getPersistedMessages ${Math.round(__ms)}ms accounts=${userIds.length} rows=${rows.length}`);

  return rows.map(persistedRowToEvolutionMessage);
  });
}

/**
 * JIDs cuyo ÚLTIMO mensaje fue eliminado por el cliente, para pintar el
 * marcador "🚫 Mensaje eliminado" en la lista.
 *
 * Antes esto se sacaba de getPersistedInboxChats, que arma toda la bandeja
 * (cruza conversaciones con sesiones y ordena) y tarda entre 0,5s y 6s. Para un
 * marcador visual basta leer la columna, que ya trae la marca: es una consulta
 * directa sobre chat_conversations, cubierta por su índice de (userId,
 * instanceName, remoteJid) y con muy pocas filas.
 */
export async function getDeletedLastMessageJids(params: {
  userIds: string[];
  instanceName?: string | null;
}): Promise<Array<{ remoteJid: string; remoteJidAlt: string | null; senderPn: string | null }>> {
  const userIds = params.userIds.filter(Boolean);
  if (!userIds.length) return [];

  return readWithTablesFallback(async () =>
    db.$queryRaw<Array<{ remoteJid: string; remoteJidAlt: string | null; senderPn: string | null }>>`
      SELECT "remoteJid", "remoteJidAlt", "senderPn"
      FROM "chat_conversations"
      WHERE "userId" IN (${Prisma.join(userIds)})
        AND "lastMessageDeleted" = TRUE
        ${params.instanceName ? Prisma.sql`AND "instanceName" = ${params.instanceName}` : Prisma.empty}
    `,
  );
}

function getChatTimestamp(chat: ChatData) {
  return (
    chat.lastMessage?.messageTimestamp ??
    (chat.updatedAt ? Math.floor(new Date(chat.updatedAt).getTime() / 1000) : 0)
  );
}

/**
 * Caché muy corta de la bandeja, compartida por proceso.
 *
 * Armar la bandeja cuesta entre 0,5s y 6s, y se rehacía ENTERA en cada visita a
 * Chats: salir a otra sección y volver pagaba el precio completo otra vez. Se
 * guarda la promesa (no el resultado) para que, además, varias cargas
 * simultáneas de la misma cuenta compartan una sola consulta en vez de lanzar
 * una cada una, que es lo que disparaba los tiempos cuando había concurrencia.
 *
 * La ventana es deliberadamente corta: la lista se refresca en vivo desde el
 * cliente al montar, así que un mensaje que llegue dentro de esos segundos
 * aparece igual sin esperar a que caduque.
 */
const INBOX_CACHE_TTL_MS = 10_000;
const inboxCache = new Map<string, { at: number; rows: Promise<ChatData[]> }>();


function inboxCacheKey(
  userIds: string[],
  instanceNames: string[] | undefined,
  take?: number,
  antesDe?: Date,
) {
  return JSON.stringify([
    [...userIds].sort(),
    [...(instanceNames ?? [])].sort(),
    take ?? TOPE_DE_LA_BANDEJA,
    antesDe ? antesDe.getTime() : 0,
  ]);
}

/**
 * Longitud a partir de la cual un texto dentro de `message` se considera un
 * adjunto codificado y no contenido: las miniaturas y sidecars en base64 pasan
 * de largo de este umbral, y ningún texto real de vista previa se acerca (la
 * lista recorta el suyo a pocas decenas de caracteres).
 */
const RAW_BLOB_MIN_LENGTH = 512;

/** Campos de texto que se conservan aunque sean largos: son contenido, no adjuntos. */
const RAW_TEXT_KEYS = ['conversation', 'text', 'caption', 'title', 'description'];

/**
 * `lastMessageRaw` sin los adjuntos en base64, para la bandeja.
 *
 * Conserva todo el JSON tal cual salvo dos cosas, ambas inútiles en la lista de
 * chats y responsables de casi todo su peso:
 *
 * - dentro de `message`, los textos largos que no son contenido (miniaturas
 *   `jpegThumbnail`, `streamingSidecar`, la onda del audio…);
 * - el mensaje citado (`contextInfo.quotedMessage`), que es otro mensaje entero
 *   con sus propios adjuntos.
 *
 * El filtro es por forma, no por lista de tipos de mensaje: así cubre también
 * los tipos que WhatsApp añada más adelante sin tener que enumerarlos.
 */
/** Columna sin recortar: el comportamiento anterior, usado como red de seguridad. */
const RAW_COMPLETO_SQL = Prisma.sql`c."lastMessageRaw"`;

/** Se apaga si el recorte falla una vez, para no reintentarlo en cada carga. */
let slimRawDisponible = true;

/**
 * Mismo recorte que `recortarRawSql`, pero en JavaScript, para aplicarlo al
 * GUARDAR.
 *
 * Recortar solo al leer evitaba mover los adjuntos por la red, pero seguían
 * guardándose: `chat_conversations` creció un 70 % (105 → 179 MB) con apenas 312
 * filas más. Aplicándolo también aquí, cada fila nueva nace pequeña y la tabla
 * deja de engordar.
 *
 * El criterio es el mismo —por forma, no por lista de tipos de mensaje— para que
 * lo guardado y lo leído coincidan: fuera los textos largos que no son contenido
 * (miniaturas, sidecars, la onda del audio) y fuera el mensaje citado.
 *
 * Solo afecta a `chat_conversations`, que alimenta la vista previa de la lista.
 * El mensaje completo se conserva intacto en `chat_messages`, que es de donde se
 * lee la conversación abierta.
 */
/**
 * `raw` sin los adjuntos en base64, para la CONVERSACIÓN.
 *
 * `chat_messages.raw` guardaba el payload entero de WhatsApp, miniaturas y
 * sidecars incluidos: la columna suma 167 MB, tiene filas de hasta 20 MB y la
 * tabla crece ~6.000 filas al día. Nada de ese base64 se lee nunca — la media se
 * pinta desde `mediaUrl`, la URL de S3 — así que era peso puro.
 *
 * Se distingue de `recortarRawParaBandeja` en una cosa: aquí SÍ se conserva el
 * mensaje citado. En la lista de chats se puede tirar porque solo se muestra una
 * vista previa de una línea; esto es la conversación abierta, donde la cita
 * forma parte de lo que se lee.
 *
 * Solo afecta a lo que se guarda de aquí en adelante; las filas existentes se
 * quedan como están.
 */
function recortarRawAdjuntos(raw: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (raw === null || raw === undefined) return Prisma.JsonNull;
  if (typeof raw !== 'object' || Array.isArray(raw)) return raw as Prisma.InputJsonValue;

  const objeto = raw as Record<string, unknown>;
  const message = objeto.message;
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return raw as Prisma.InputJsonValue;
  }

  const messageRecortado: Record<string, unknown> = {};

  for (const [tipo, valor] of Object.entries(message as Record<string, unknown>)) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
      messageRecortado[tipo] = valor;
      continue;
    }

    const campos: Record<string, unknown> = {};
    for (const [campo, contenido] of Object.entries(valor as Record<string, unknown>)) {
      if (
        typeof contenido === 'string' &&
        contenido.length > RAW_BLOB_MIN_LENGTH &&
        !RAW_TEXT_KEYS.includes(campo)
      ) {
        continue;
      }
      campos[campo] = contenido;
    }
    messageRecortado[tipo] = campos;
  }

  return { ...objeto, message: messageRecortado } as Prisma.InputJsonValue;
}

function recortarRawParaBandeja(raw: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (raw === null || raw === undefined) return Prisma.JsonNull;
  if (typeof raw !== 'object' || Array.isArray(raw)) return raw as Prisma.InputJsonValue;

  const objeto = raw as Record<string, unknown>;
  const message = objeto.message;
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return raw as Prisma.InputJsonValue;
  }

  const esContenido = (clave: string) => RAW_TEXT_KEYS.includes(clave);
  const messageRecortado: Record<string, unknown> = {};

  for (const [tipo, valor] of Object.entries(message as Record<string, unknown>)) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
      messageRecortado[tipo] = valor;
      continue;
    }

    const campos: Record<string, unknown> = {};
    for (const [campo, contenido] of Object.entries(valor as Record<string, unknown>)) {
      if (
        typeof contenido === 'string' &&
        contenido.length > RAW_BLOB_MIN_LENGTH &&
        !esContenido(campo)
      ) {
        continue;
      }

      if (campo === 'contextInfo' && contenido && typeof contenido === 'object' && !Array.isArray(contenido)) {
        const { quotedMessage: _descartado, ...resto } = contenido as Record<string, unknown>;
        campos[campo] = resto;
        continue;
      }

      campos[campo] = contenido;
    }
    messageRecortado[tipo] = campos;
  }

  return { ...objeto, message: messageRecortado } as Prisma.InputJsonValue;
}

function recortarRawSql(col: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
  CASE
    WHEN ${col} IS NULL
      OR jsonb_typeof(${col}) <> 'object'
      OR NOT jsonb_exists(${col}, 'message')
      OR jsonb_typeof(${col} -> 'message') <> 'object'
    THEN ${col}
    ELSE (${col} - 'message'::text) || jsonb_build_object(
      'message',
      COALESCE(
        (
          SELECT jsonb_object_agg(
            tipo.clave,
            CASE
              WHEN jsonb_typeof(tipo.valor) <> 'object' THEN tipo.valor
              ELSE COALESCE(
                (
                  SELECT jsonb_object_agg(
                    campo.clave,
                    CASE
                      WHEN campo.clave = 'contextInfo'
                        AND jsonb_typeof(campo.valor) = 'object'
                        THEN campo.valor - 'quotedMessage'::text
                      ELSE campo.valor
                    END
                  )
                  FROM jsonb_each(tipo.valor) AS campo(clave, valor)
                  WHERE jsonb_typeof(campo.valor) <> 'string'
                     OR length(campo.valor #>> '{}'::text[]) <= ${RAW_BLOB_MIN_LENGTH}
                     OR campo.clave IN (${Prisma.join(RAW_TEXT_KEYS)})
                ),
                '{}'::jsonb
              )
            END
          )
          FROM jsonb_each(${col} -> 'message') AS tipo(clave, valor)
        ),
        '{}'::jsonb
      )
    )
  END
`;
}

/**
 * Cuantas conversaciones tiene cada linea DE VERDAD.
 *
 * El numero y la lista son dos cosas distintas y llegaron a ser la misma: el
 * contador de cada canal se sacaba contando las filas cargadas, asi que con el
 * tope de la bandeja mordiendo decia 290 en una linea de 576. Nadie baja mas
 * alla de los primeros chats, asi que la LISTA puede seguir acotada; lo que no
 * puede estar recortado es el NUMERO.
 *
 * Es **un solo `COUNT`** sobre `Session`, sin tocar `chat_conversations` ni el
 * JSON pesado de `lastMessageRaw`, que es lo que obligaba a poner tope.
 *
 * Dos cosas que lo hacen dar el numero bueno y no uno parecido:
 *
 * 1. **`COUNT(DISTINCT remoteJid)`, no `COUNT(*)`.** La bandeja mira las lineas
 *    de VARIAS cuentas a la vez (`allSessionUserIds`: la propia, la de sesion,
 *    las vinculadas), y una misma linea puede tener la ficha del mismo contacto
 *    bajo mas de un `userId` -pasa con las conversaciones viejas guardadas bajo
 *    el dueño anterior de la linea-. Contando filas, una linea de 576 decia
 *    **1036**: el mismo contacto contado dos veces.
 * 2. **Las borradas y las archivadas se descuentan dentro de la consulta**, con
 *    un `NOT EXISTS`, para que siga cumpliendose lo de siempre: limpiar chats
 *    baja el numero de la linea. Restar marcas por fuera no vale: una sola
 *    conversacion borrada deja marca bajo todas sus identidades (`remoteJid`,
 *    `remoteJidAlt`, `senderPn`, el `@lid`), asi que restaria hasta cuatro
 *    veces de mas.
 */
export async function contarChatsPorLinea(params: {
  userIds: string[];
  instanceNames?: string[];
}): Promise<Record<string, number>> {
  const userIds = params.userIds.filter(Boolean);
  if (!userIds.length) return {};

  // SOLO las lineas de la bandeja, las mismas que se le piden a la lista.
  //
  // Sin esto el contador contaba TODAS las lineas que aparecen en `Session`
  // —las borradas, los restos `_V2`, los canales `_wh`— y volvian al
  // desplegable las filas «Linea sin ficha» que se habian quitado del lado de
  // los chats: con numero, pero al elegirlas la lista salia vacia («No hay
  // chats que coincidan con el filtro»). Un filtro que promete 18 y enseña 0.
  const lineas = params.instanceNames?.filter(Boolean) ?? [];
  if (params.instanceNames && !lineas.length) return {};

  try {
    const __t0 = performance.now();
    // Las marcas se sacan UNA vez y se cruzan con un hash join, no con un
    // `NOT EXISTS` correlacionado.
    //
    // El primer intento era `NOT EXISTS (... p."remoteJid" = s."remoteJid" OR
    // p."remoteJid" = s."remoteJidAlt")`, o sea la misma trampa que ya costo
    // caro en `levantarMarcasSiElContactoEscribio`: un `OR` sobre dos columnas
    // dentro de un correlacionado no puede usar indice y se ejecuta UNA VEZ POR
    // SESION. Con 15.000 leads son 15.000 busquedas.
    //
    // Asi son dos pasadas y ya: la tabla de marcas es pequeña -solo hay fila
    // por chat borrado o archivado- y entra entera en memoria.
    const filas = await db.$queryRaw<{ linea: string | null; total: bigint }[]>`
      WITH marcas AS (
        SELECT DISTINCT "userId", "remoteJid"
        FROM "ChatConversationPreference"
        WHERE "userId" IN (${Prisma.join(userIds)})
          AND ("deletedAt" IS NOT NULL OR "archivedAt" IS NOT NULL)
      )
      SELECT s."instanceId" AS linea, COUNT(DISTINCT s."remoteJid") AS total
      FROM "Session" s
      LEFT JOIN marcas m  ON m."userId"  = s."userId" AND m."remoteJid"  = s."remoteJid"
      LEFT JOIN marcas ma ON ma."userId" = s."userId" AND ma."remoteJid" = s."remoteJidAlt"
      WHERE s."userId" IN (${Prisma.join(userIds)})
        AND s."remoteJid" NOT LIKE '%@lid'
        ${lineas.length ? Prisma.sql`AND s."instanceId" IN (${Prisma.join(lineas)})` : Prisma.empty}
        AND m."remoteJid" IS NULL
        AND ma."remoteJid" IS NULL
      GROUP BY s."instanceId"
    `;

    // Un contador nunca deberia costar; si algun dia cuesta, que se vea.
    const __ms = performance.now() - __t0;
    if (__ms > 300) {
      console.warn(`[PERF] contarChatsPorLinea ${Math.round(__ms)}ms`, {
        cuentas: userIds.length,
        lineas: lineas.length || 'todas',
      });
    }

    const conteos: Record<string, number> = {};
    for (const f of filas) {
      const linea = f.linea ?? "";
      if (!linea) continue;
      conteos[linea] = Number(f.total);
    }
    return conteos;
  } catch (error) {
    // Sin numero se cae al conteo de las filas cargadas, que es lo de antes.
    // Callarlo aqui seria volver a un numero corto sin explicacion.
    console.error("[chats] no se pudo contar las conversaciones por linea", error);
    return {};
  }
}

export async function getPersistedInboxChats(params: {
  userIds: string[];
  instanceNames?: string[];
  take?: number;
  /** Solo las anteriores a esta fecha: es la «pagina siguiente» de la bandeja. */
  antesDe?: Date;
}): Promise<ChatData[]> {
  const userIds = params.userIds.filter(Boolean);
  if (!userIds.length) return [];

  const key = inboxCacheKey(userIds, params.instanceNames, params.take, params.antesDe);
  const now = Date.now();

  const cached = inboxCache.get(key);
  if (cached && now - cached.at < INBOX_CACHE_TTL_MS) return cached.rows;

  // Limpieza de entradas caducadas: el mapa crece con cada combinación de
  // cuentas/instancias y sin esto se quedarían todas en memoria.
  for (const [k, v] of Array.from(inboxCache.entries())) {
    if (now - v.at >= INBOX_CACHE_TTL_MS) inboxCache.delete(k);
  }

  const rows = loadPersistedInboxChats(params, userIds);
  inboxCache.set(key, { at: now, rows });
  // Si la consulta falla no se deja el error cacheado: la siguiente visita
  // reintenta en vez de arrastrar el fallo durante toda la ventana.
  rows.catch(() => inboxCache.delete(key));
  return rows;
}

/** Invalida la bandeja cacheada. Se llama tras cambiarla (borrar, archivar…). */
export function invalidatePersistedInboxCache(): void {
  inboxCache.clear();
}

async function loadPersistedInboxChats(
  params: { userIds: string[]; instanceNames?: string[]; take?: number; antesDe?: Date },
  userIds: string[],
): Promise<ChatData[]> {
  return readWithTablesFallback(async () => {
  const __t0 = performance.now();
  // Mapa instanceId -> instanceName resuelto UNA sola vez por llamada. Antes esto
  // vivía como un EXISTS correlacionado contra "Instancias" DENTRO del JOIN, y se
  // evaluaba por cada combinación conversación × sesión (millones de veces). Ahora
  // se pasa como lista literal al query y el planificador lo resuelve con un hash.
  const instRows = await db.instancia.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, instanceId: true, instanceName: true },
  });
  const instMapExtra = instRows.length
    ? Prisma.sql`, ${Prisma.join(
        instRows.map((r) => Prisma.sql`(${r.userId}, ${r.instanceId}, ${r.instanceName})`),
      )}`
    : Prisma.empty;
  // El emparejamiento conversación↔sesión se descompone en igualdades simples:
  // 2 claves de la sesión (remoteJid, remoteJidAlt) × 3 de la conversación
  // (remoteJid, remoteJidAlt, senderPn) = exactamente las 6 reglas del OR anterior,
  // pero unidas por UN SOLO hash join (índice-friendly) en lugar del JOIN con 6
  // ORs + EXISTS que obligaba a un nested-loop cuadrático. Mismas columnas, mismo
  // DISTINCT ON y mismo orden que antes → mismos resultados (verificado con un
  // dataset de equivalencia: todas las reglas, multi-match, Meta, aislamiento).
  // El recorte va DELANTE del cruce, no detras.
  //
  // Esto montaba `conv` y `sess` con TODAS las conversaciones y TODAS las
  // sesiones de la cuenta, las desapilaba en claves (hasta 3 filas por
  // conversacion y 2+ por sesion), las cruzaba, hacia el `DISTINCT ON` con su
  // ordenacion... y recortaba a 300 al final. En una cuenta de 15.000 leads eso
  // son unas 45.000 + 30.000 filas cruzadas y ordenadas para devolver 300: el
  // `LIMIT` no ahorraba el trabajo, solo tiraba el resultado. Y crecia con la
  // cuenta, asi que cada cliente que crecia se comia el ahorro anterior.
  //
  // Ahora se preseleccionan las mas recientes de cada fuente y solo esas entran.
  // Es correcto por el argumento de mezcla de dos listas ordenadas: cada fila
  // del resultado ordena por `c_ts` -si viene de una conversacion- o por
  // `s_updated` -si es una sesion sin conversacion-, asi que el top-N global
  // esta contenido en el top-N de cada fuente por su propio reloj.
  //
  // Con dos cuidados, que son los que lo hacen seguro:
  //
  //  - Las conversaciones SIN `lastMessageTimestamp` entran SIEMPRE. Esas
  //    ordenan por el reloj de su sesion, no por el suyo, asi que recortarlas
  //    por una columna que no tienen las dejaria fuera por sorpresa.
  //  - La ventana es `VENTANA_DE_CANDIDATOS` veces la pagina, no exacta. El
  //    motivo y lo que cubre estan escritos en esa constante.
  const ventana = (params.take ?? TOPE_DE_LA_BANDEJA) * VENTANA_DE_CANDIDATOS;

  const consultarBandeja = (rawExpr: Prisma.Sql) => db.$queryRaw<InboxRow[]>`
    WITH pre_conv AS (
      -- Entra por "chat_conversations_user_last_ts_idx" (userId, lastMessageTimestamp DESC).
      SELECT c."id"
      FROM "chat_conversations" c
      WHERE c."userId" IN (${Prisma.join(userIds)})
        AND c."lastMessageTimestamp" IS NOT NULL
      ORDER BY c."lastMessageTimestamp" DESC
      LIMIT ${ventana}
    ),
    pre_sess AS (
      -- OJO: "Session" NO tiene indice por "updatedAt" -sus indices son
      -- (userId, remoteJid), (userId, createdAt DESC) y el unico
      -- (userId, instanceId, remoteJid)-, asi que esto ordena sin indice. Sigue
      -- siendo mucho mas barato que arrastrar la cuenta entera por todo el
      -- cruce, pero el indice que lo haria gratis lo tiene que crear el motor,
      -- que es el dueño de las migraciones.
      SELECT s."id"
      FROM "Session" s
      WHERE s."userId" IN (${Prisma.join(userIds)})
      ORDER BY s."updatedAt" DESC
      LIMIT ${ventana}
    ),
    conv AS (
      SELECT
        c."id" AS c_id, c."userId" AS c_user, c."instanceName" AS c_instance,
        c."instanceType" AS c_instance_type, c."remoteJid" AS c_jid,
        c."remoteJidAlt" AS c_alt, c."senderPn" AS c_sender, c."pushName" AS c_push, c."profilePicUrl" AS c_pic,
        c."lastMessageId" AS c_msg_id, c."lastMessageFromMe" AS c_from_me,
        c."lastMessageType" AS c_msg_type, c."lastMessageContent" AS c_content,
        c."lastMessageMediaUrl" AS c_media,
        c."lastMessageTimestamp" AS c_ts, c."lastMessageDeleted" AS c_deleted,
        c."updatedAt" AS c_updated
      FROM "chat_conversations" c
      WHERE c."userId" IN (${Prisma.join(userIds)})
        AND (
          -- Las que no traen hora ordenan por el reloj de su sesion: entran
          -- siempre, no se pueden recortar por una columna que tienen vacia.
          c."lastMessageTimestamp" IS NULL
          OR c."id" IN (SELECT "id" FROM pre_conv)
        )
    ),
    sess AS (
      SELECT
        s."id" AS s_id, s."userId" AS s_user, s."instanceId" AS s_instance,
        s."remoteJid" AS s_jid, s."remoteJidAlt" AS s_alt, s."pushName" AS s_push,
        s."updatedAt" AS s_updated
      FROM "Session" s
      WHERE s."userId" IN (${Prisma.join(userIds)})
        AND s."id" IN (SELECT "id" FROM pre_sess)
    ),
    -- Mapa (userId, instanceId, instanceName) como lista literal. La fila centinela
    -- (NULL,NULL,NULL) fija los tipos a text y nunca casa (NULL <> nada).
    inst_map(user_id, instance_id, instance_name) AS (
      VALUES (NULL::text, NULL::text, NULL::text)${instMapExtra}
    ),
    -- Cada sesión con los nombres de instancia con los que puede casar: su propio
    -- instanceId + el/los instanceName mapeados en Instancias.
    sess_named AS (
      SELECT s_id, s_user, s_jid, s_alt, s_instance AS inst_name FROM sess
      UNION
      SELECT sess.s_id, sess.s_user, sess.s_jid, sess.s_alt, im.instance_name
      FROM sess
      JOIN inst_map im ON im.user_id = sess.s_user AND im.instance_id = sess.s_instance
    ),
    -- Claves de emparejamiento "desapiladas": una fila por (entidad, clave).
    sess_keys AS (
      SELECT s_id, s_user, inst_name, s_jid AS k FROM sess_named
      UNION ALL
      SELECT s_id, s_user, inst_name, s_alt FROM sess_named WHERE s_alt IS NOT NULL
    ),
    conv_keys AS (
      SELECT c_id, c_user, c_instance, c_jid AS k FROM conv
      UNION ALL
      SELECT c_id, c_user, c_instance, c_alt FROM conv WHERE c_alt IS NOT NULL
      UNION ALL
      SELECT c_id, c_user, c_instance, c_sender FROM conv WHERE c_sender IS NOT NULL
    ),
    -- Pares (conversación, sesión) que casan: mismo usuario + misma instancia +
    -- alguna clave en común. Un único hash join en vez del cruce con 6 ORs.
    pairs AS (
      SELECT DISTINCT ck.c_id, sk.s_id
      FROM conv_keys ck
      JOIN sess_keys sk
        ON sk.s_user = ck.c_user AND sk.inst_name = ck.c_instance AND sk.k = ck.k
    ),
    merged AS (
      -- Cada conversación con su sesión emparejada (o NULL): cubre "c con s" y "c sin s"
      SELECT
        c.c_id, c.c_user, c.c_instance, c.c_instance_type, c.c_jid, c.c_alt, c.c_sender,
        c.c_push, c.c_pic, c.c_msg_id, c.c_from_me, c.c_msg_type, c.c_content, c.c_media,
        c.c_ts, c.c_deleted, c.c_updated,
        s.s_id, s.s_user, s.s_instance, s.s_jid, s.s_alt, s.s_push, s.s_updated
      FROM conv c
      LEFT JOIN pairs p ON p.c_id = c.c_id
      LEFT JOIN sess s ON s.s_id = p.s_id

      UNION ALL

      -- Sesiones que NO tienen conversación: cubre "s sin c"
      SELECT
        NULL::bigint AS c_id, NULL::text AS c_user, NULL::text AS c_instance,
        NULL::text AS c_instance_type, NULL::text AS c_jid,
        NULL::text AS c_alt, NULL::text AS c_sender, NULL::text AS c_push, NULL::text AS c_pic,
        NULL::text AS c_msg_id, NULL::boolean AS c_from_me,
        NULL::text AS c_msg_type, NULL::text AS c_content,
        NULL::text AS c_media,
        NULL::timestamp(3) AS c_ts, NULL::boolean AS c_deleted,
        NULL::timestamp(3) AS c_updated,
        s.s_id, s.s_user, s.s_instance, s.s_jid, s.s_alt, s.s_push, s.s_updated
      FROM sess s
      WHERE NOT EXISTS (SELECT 1 FROM pairs p WHERE p.s_id = s.s_id)
    ),
    inbox_rows AS (
      SELECT DISTINCT ON (
        COALESCE(m.c_user, m.s_user),
        COALESCE(m.c_instance, i."instanceName", m.s_instance),
        COALESCE(m.c_jid, m.s_jid)
      )
        COALESCE(m.s_id, m.c_id) AS "sessionId",
        -- Se conserva el id de la conversación para poder traer su JSON al final,
        -- una vez recortado a las filas que de verdad se devuelven.
        m.c_id AS "convId",
        COALESCE(m.c_user, m.s_user) AS "userId",
        COALESCE(m.c_jid, m.s_jid) AS "remoteJid",
        COALESCE(m.c_alt, m.s_alt) AS "remoteJidAlt",
        COALESCE(m.c_push, m.s_push) AS "pushName",
        m.c_pic AS "profilePicUrl",
        COALESCE(m.c_instance, i."instanceName", m.s_instance) AS "instanceName",
        COALESCE(m.c_instance_type, i."instanceType") AS "instanceType",
        m.c_msg_id AS "messageId",
        m.c_from_me AS "fromMe",
        m.c_msg_type AS "messageType",
        m.c_content AS "content",
        m.c_media AS "mediaUrl",
        m.c_ts AS "messageTimestamp",
        m.c_deleted AS "lastMessageDeleted",
        COALESCE(m.s_updated, m.c_updated) AS "sessionUpdatedAt"
      FROM merged m
      LEFT JOIN "Instancias" i
        ON i."userId" = COALESCE(m.s_user, m.c_user)
        AND (
          i."instanceName" = COALESCE(m.c_instance, m.s_instance)
          OR i."instanceId" = COALESCE(m.c_instance, m.s_instance)
        )
      WHERE COALESCE(m.c_msg_type, '') <> 'reactionMessage'
        ${params.instanceNames?.length ? Prisma.sql`AND COALESCE(m.c_instance, i."instanceName", m.s_instance) IN (${Prisma.join(params.instanceNames)})` : Prisma.empty}
      ORDER BY
        COALESCE(m.c_user, m.s_user),
        COALESCE(m.c_instance, i."instanceName", m.s_instance),
        COALESCE(m.c_jid, m.s_jid),
        COALESCE(m.c_ts, m.s_updated) DESC,
        -- Desempate determinista cuando una conversación casa con varias sesiones
        -- (antes la sesión elegida era arbitraria/plan-dependiente): gana la más
        -- recientemente actualizada, luego el id mayor.
        m.s_updated DESC NULLS LAST, m.s_id DESC NULLS LAST
    )
    -- El JSON del último mensaje (lastMessageRaw) se trae AQUÍ, ya recortado a
    -- las filas que se devuelven. Antes viajaba dentro del CTE y por tanto se
    -- arrastraba por todos los cruces, el DISTINCT ON y el ordenamiento: esa
    -- columna promedia ~18 KB por fila y la tabla ocupa 105 MB para 5.902 filas,
    -- así que se movían ~100 MB por consulta para acabar usando 300 filas.
    -- Mismas filas y mismo orden; solo cambia CUÁNDO se lee la columna pesada.
    --
    -- Y se trae ADELGAZADO. Lo que engorda ese JSON son los adjuntos en base64
    -- que WhatsApp mete dentro de "message" (miniaturas jpegThumbnail, el
    -- streamingSidecar de vídeo/audio, la onda del audio) y el mensaje citado
    -- dentro de contextInfo. La bandeja NO usa nada de eso: de "message" solo
    -- lee el texto, audioMessage.ptt, el emoji de la reacción, el cuerpo de la
    -- respuesta interactiva y los datos de llamada: todos campos cortos.
    -- Esos megabytes no aparecen en un EXPLAIN (que no envía resultados), pero sí
    -- se pagan al descomprimirlos, mandarlos por la red y convertirlos a objetos
    -- JavaScript, y eran la mayor parte del tiempo de esta consulta.
    SELECT ir.*, ${rawExpr} AS "raw"
    FROM (
      SELECT *
      FROM inbox_rows
      -- Paginado por FECHA, no por posicion.
      --
      -- Con OFFSET se saltaban filas: la primera pagina se pide para TODAS
      -- las lineas juntas con un solo LIMIT, asi que de una linea concreta
      -- pueden haber entrado 250 y no 300, y saltar 300 de esa linea se comia
      -- 50 conversaciones. Con la fecha del ultimo que ya tiene la pantalla no
      -- hay nada que suponer, y ademas aguanta que entren mensajes nuevos entre
      -- una pagina y la siguiente.
      ${
        params.antesDe
          ? Prisma.sql`WHERE COALESCE("messageTimestamp", "sessionUpdatedAt") < ${params.antesDe}`
          : Prisma.empty
      }
      ORDER BY COALESCE("messageTimestamp", "sessionUpdatedAt") DESC
      LIMIT ${params.take ?? TOPE_DE_LA_BANDEJA}
    ) ir
    LEFT JOIN "chat_conversations" c ON c."id" = ir."convId"
    ORDER BY COALESCE(ir."messageTimestamp", ir."sessionUpdatedAt") DESC
  `;

  // El adelgazado del JSON es una optimización, no un requisito: si el motor lo
  // rechazara, la bandeja debe seguir cargando. Ante un fallo se repite la
  // consulta con la columna completa (el comportamiento anterior) y se deja de
  // intentar la versión ligera hasta el próximo reinicio, para no pagar dos
  // consultas en cada carga.
  let rows: InboxRow[];
  if (slimRawDisponible) {
    try {
      rows = await consultarBandeja(recortarRawSql(Prisma.sql`c."lastMessageRaw"`));
    } catch (error) {
      if (isMissingTableError(error)) throw error;
      slimRawDisponible = false;
      console.error(
        '[chat-persistence] la bandeja no pudo recortar lastMessageRaw; se usa la columna completa.',
        error,
      );
      rows = await consultarBandeja(RAW_COMPLETO_SQL);
    }
  } else {
    rows = await consultarBandeja(RAW_COMPLETO_SQL);
  }

  const __ms = performance.now() - __t0;

  // Lo que se recorta, se dice.
  //
  // Ya no es un fallo —el contador de cada línea sale aparte de un COUNT, así
  // que el número sigue siendo el real— pero saber que la LISTA viene tocando
  // el tope es lo que separa "esta cuenta es grande" de "faltan chats", y esa
  // distinción costó una sesión entera. Va como `info` y no como `warn`
  // justamente porque es lo esperado en una cuenta grande.
  const tope = params.take ?? TOPE_DE_LA_BANDEJA;
  if (rows.length >= tope) {
    console.info(
      `[chats] la lista viene al tope: ${rows.length} de ${tope}. El contador de cada línea NO depende de esto.`,
      { cuentas: userIds.length, lineas: params.instanceNames?.length ?? 'todas' },
    );
  }

  // El armado de los chats (parsear el JSON de cada mensaje y ordenar) también
  // se mide: es trabajo por fila y hasta ahora quedaba fuera del cronómetro.
  const __tMap = performance.now();
  const chats = rows
    .map(inboxRowToChat)
    .sort((a, b) => getChatTimestamp(b) - getChatTimestamp(a));
  const __msMap = performance.now() - __tMap;

  // Cuantas filas salen SIN ultimo mensaje.
  //
  // Es el numero que vigila el unico riesgo del recorte previo: una fila cuya
  // sesion entro en la ventana pero cuya conversacion se quedo fuera sale sin
  // su ultimo mensaje. `convId` a null es exactamente eso: una fila que salio
  // de `Session` sin conversacion emparejada.
  //
  // No es cero por definicion —una conversacion que WhatsApp todavia no ha
  // devuelto tampoco tiene fila en `chat_conversations`, y eso ya pasaba
  // antes—, asi que lo que interesa es la TENDENCIA: si empieza a subir con el
  // tamaño de la cuenta, la ventana se esta quedando corta. Medido, no
  // estimado.
  const sinUltimoMensaje = rows.reduce((n, r) => (r.convId == null ? n + 1 : n), 0);

  if (__ms + __msMap > 500 || sinUltimoMensaje > 0) {
    console.error(
      `[PERF] getPersistedInboxChats consulta=${Math.round(__ms)}ms ` +
        `armado=${Math.round(__msMap)}ms ` +
        `accounts=${userIds.length} rows=${rows.length} ` +
        `sinUltimoMensaje=${sinUltimoMensaje} ventana=${ventana}`,
    );
  }

  return chats;
  });
}

