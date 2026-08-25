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
    await db.$executeRaw`
      INSERT INTO "chat_conversations" (
        "userId", "instanceName", "instanceType", "remoteJid", "remoteJidAlt", "senderPn",
        "pushName", "lastMessageId", "lastMessageFromMe", "lastMessageType",
        "lastMessageContent", "lastMessageMediaUrl", "lastMessageRaw",
        "lastMessageTimestamp", "createdAt", "updatedAt"
      )
      SELECT DISTINCT ON ("userId", "instanceName", "remoteJid")
        "userId", "instanceName", "instanceType", "remoteJid", "remoteJidAlt", "senderPn",
        "pushName", "messageId", "fromMe", "messageType",
        "content", "mediaUrl", ${recortarRawSql(Prisma.sql`"raw"`)}, "messageTimestamp", NOW(), NOW()
      FROM "chat_messages"
      WHERE NOT (
        "messageType" IN ('conversation', 'extendedTextMessage')
        AND COALESCE(NULLIF(BTRIM("content"), ''), '-') = '-'
        AND "mediaUrl" IS NULL
      )
      ORDER BY "userId", "instanceName", "remoteJid", "messageTimestamp" DESC, "id" DESC
      ON CONFLICT ("userId", "instanceName", "remoteJid")
      DO UPDATE SET
        "instanceType" = COALESCE(EXCLUDED."instanceType", "chat_conversations"."instanceType"),
        "remoteJidAlt" = COALESCE(EXCLUDED."remoteJidAlt", "chat_conversations"."remoteJidAlt"),
        "senderPn" = COALESCE(EXCLUDED."senderPn", "chat_conversations"."senderPn"),
        "pushName" = COALESCE(EXCLUDED."pushName", "chat_conversations"."pushName"),
        "lastMessageId" = EXCLUDED."lastMessageId",
        "lastMessageFromMe" = EXCLUDED."lastMessageFromMe",
        "lastMessageType" = EXCLUDED."lastMessageType",
        "lastMessageContent" = EXCLUDED."lastMessageContent",
        "lastMessageMediaUrl" = EXCLUDED."lastMessageMediaUrl",
        "lastMessageRaw" = EXCLUDED."lastMessageRaw",
        "lastMessageTimestamp" = EXCLUDED."lastMessageTimestamp",
        "updatedAt" = NOW()
      WHERE "chat_conversations"."lastMessageTimestamp" IS NULL
         OR "chat_conversations"."lastMessageTimestamp" <= EXCLUDED."lastMessageTimestamp"
    `;
  })();

  return ensureTablePromise;
}

function epochToDate(value?: Date | number | string | null) {
  if (value instanceof Date) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value < 2_000_000_000 ? value * 1000 : value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
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
    profilePicUrl: null,
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
  const sessionUserId = (await resolveInstanceOwnerId(input.instanceName)) ?? input.userId;

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

  const existing = await db.session.findFirst({
    where: {
      userId: sessionUserId,
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
    try {
      await db.session.update({
        where: { id: existing.id },
        data: {
          remoteJid,
          remoteJidAlt,
          pushName: nombreAEscribir,
          instanceId,
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
  const messageTimestamp = epochToDate(input.messageTimestamp);
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
      "content" = COALESCE(EXCLUDED."content", "chat_messages"."content"),
      "mediaUrl" = COALESCE(EXCLUDED."mediaUrl", "chat_messages"."mediaUrl"),
      "raw" = CASE
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
      "messageTimestamp" = CASE
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
      SELECT DISTINCT ON ("messageId", "fromMe") *
      FROM matched
      ORDER BY "messageId", "fromMe", "deleted" DESC, ("raw"->'key' IS NOT NULL) DESC, "messageTimestamp" DESC, "id" DESC
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

function inboxCacheKey(userIds: string[], instanceNames: string[] | undefined, take?: number) {
  return JSON.stringify([[...userIds].sort(), [...(instanceNames ?? [])].sort(), take ?? 300]);
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

export async function getPersistedInboxChats(params: {
  userIds: string[];
  instanceNames?: string[];
  take?: number;
}): Promise<ChatData[]> {
  const userIds = params.userIds.filter(Boolean);
  if (!userIds.length) return [];

  const key = inboxCacheKey(userIds, params.instanceNames, params.take);
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
  params: { userIds: string[]; instanceNames?: string[]; take?: number },
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
  const consultarBandeja = (rawExpr: Prisma.Sql) => db.$queryRaw<InboxRow[]>`
    WITH conv AS (
      SELECT
        c."id" AS c_id, c."userId" AS c_user, c."instanceName" AS c_instance,
        c."instanceType" AS c_instance_type, c."remoteJid" AS c_jid,
        c."remoteJidAlt" AS c_alt, c."senderPn" AS c_sender, c."pushName" AS c_push,
        c."lastMessageId" AS c_msg_id, c."lastMessageFromMe" AS c_from_me,
        c."lastMessageType" AS c_msg_type, c."lastMessageContent" AS c_content,
        c."lastMessageMediaUrl" AS c_media,
        c."lastMessageTimestamp" AS c_ts, c."lastMessageDeleted" AS c_deleted,
        c."updatedAt" AS c_updated
      FROM "chat_conversations" c
      WHERE c."userId" IN (${Prisma.join(userIds)})
    ),
    sess AS (
      SELECT
        s."id" AS s_id, s."userId" AS s_user, s."instanceId" AS s_instance,
        s."remoteJid" AS s_jid, s."remoteJidAlt" AS s_alt, s."pushName" AS s_push,
        s."updatedAt" AS s_updated
      FROM "Session" s
      WHERE s."userId" IN (${Prisma.join(userIds)})
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
        c.c_push, c.c_msg_id, c.c_from_me, c.c_msg_type, c.c_content, c.c_media,
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
        NULL::text AS c_alt, NULL::text AS c_sender, NULL::text AS c_push,
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
      ORDER BY COALESCE("messageTimestamp", "sessionUpdatedAt") DESC
      LIMIT ${params.take ?? 300}
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

  // El armado de los chats (parsear el JSON de cada mensaje y ordenar) también
  // se mide: es trabajo por fila y hasta ahora quedaba fuera del cronómetro.
  const __tMap = performance.now();
  const chats = rows
    .map(inboxRowToChat)
    .sort((a, b) => getChatTimestamp(b) - getChatTimestamp(a));
  const __msMap = performance.now() - __tMap;

  if (__ms + __msMap > 500) {
    console.error(
      `[PERF] getPersistedInboxChats consulta=${Math.round(__ms)}ms ` +
        `armado=${Math.round(__msMap)}ms ` +
        `accounts=${userIds.length} rows=${rows.length}`,
    );
  }

  return chats;
  });
}

