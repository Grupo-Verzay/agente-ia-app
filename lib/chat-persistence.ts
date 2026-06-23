import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import {
  buildWhatsAppJidCandidates,
  normalizeWhatsAppConversationJid,
  pickExplicitWhatsAppPhoneJid,
  pickObservedAlternateRemoteJid,
  pickPreferredWhatsAppRemoteJid,
} from '@/lib/whatsapp-jid';
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
};

type InboxRow = {
  sessionId: number;
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
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "chat_messages_user_jid_ts_idx"
      ON "chat_messages" ("userId", "remoteJid", "messageTimestamp" DESC)
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
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "chat_conversations_user_last_ts_idx"
      ON "chat_conversations" ("userId", "lastMessageTimestamp" DESC)
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
        "content", "mediaUrl", "raw", "messageTimestamp", NOW(), NOW()
      FROM "chat_messages"
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

export function extractMessageText(message: EvolutionMessage) {
  const body = message.message ?? {};
  return (
    body.conversation ||
    body.extendedTextMessage?.text ||
    body.imageMessage?.caption ||
    body.videoMessage?.caption ||
    body.documentMessage?.caption ||
    body.audioMessage?.caption ||
    body.reactionMessage?.text ||
    ''
  );
}

function buildMessageContent(row: Pick<PersistedChatMessageRow | InboxRow, 'messageType' | 'content' | 'mediaUrl' | 'raw'>): MessageContent {
  const raw = row.raw as { message?: MessageContent } | MessageContent | null;
  const rawMessage = raw && 'message' in raw ? raw.message : raw;
  if (rawMessage && typeof rawMessage === 'object') {
    return {
      ...(rawMessage as MessageContent),
      ...(row.mediaUrl ? { mediaUrl: row.mediaUrl } : {}),
    };
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

export function persistedRowToEvolutionMessage(row: PersistedChatMessageRow): EvolutionMessage {
  const rawSnapshot = getRawEvolutionSnapshot(row.raw);

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

  return {
    id: String(row.sessionId),
    remoteJid: row.remoteJid,
    remoteJidAlt: row.remoteJidAlt,
    pushName: row.pushName,
    profilePicUrl: null,
    unreadCount: 0,
    updatedAt: timestamp.toISOString(),
    lastMessage,
    instanceName: row.instanceName,
    instanceType: row.instanceType ?? undefined,
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

  const existing = await db.session.findFirst({
    where: {
      userId: input.userId,
      OR: [
        { remoteJid: { in: candidates } },
        { remoteJidAlt: { in: candidates } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });

  if (existing) {
    await db.session.update({
      where: { id: existing.id },
      data: {
        remoteJid,
        remoteJidAlt,
        pushName: input.pushName?.trim() || undefined,
        instanceId,
        updatedAt: new Date(),
      },
    });
    return;
  }

  await db.session.create({
    data: {
      userId: input.userId,
      remoteJid,
      remoteJidAlt,
      pushName: input.pushName?.trim() || remoteJid,
      instanceId,
      status: true,
    },
  });
}

export async function persistChatMessage(input: PersistChatMessageInput) {
  if (!input.userId || !input.instanceName || !input.remoteJid) return;
  await ensureChatMessagesTable();

  const normalizedRemoteJid = normalizeStoredRemoteJid(input.remoteJid, [
    input.remoteJidAlt,
    input.senderPn,
  ]);
  const messageId =
    input.messageId?.trim() ||
    randomMessageId(input.fromMe ? 'outgoing' : 'incoming');
  const messageTimestamp = epochToDate(input.messageTimestamp);

  await upsertSessionFromChatMessage({
    ...input,
    remoteJid: normalizedRemoteJid,
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
      ${input.remoteJidAlt ?? null}, ${input.senderPn ?? null}, ${messageId}, ${input.fromMe},
      ${input.pushName ?? null}, ${input.messageType ?? 'conversation'}, ${input.content ?? null},
      ${input.mediaUrl ?? null}, ${input.raw ?? Prisma.JsonNull}, ${messageTimestamp}, NOW(), NOW()
    )
    ON CONFLICT ("userId", "instanceName", "remoteJid", "messageId", "fromMe")
    DO UPDATE SET
      "remoteJidAlt" = COALESCE(EXCLUDED."remoteJidAlt", "chat_messages"."remoteJidAlt"),
      "senderPn" = COALESCE(EXCLUDED."senderPn", "chat_messages"."senderPn"),
      "pushName" = COALESCE(EXCLUDED."pushName", "chat_messages"."pushName"),
      "messageType" = EXCLUDED."messageType",
      "content" = COALESCE(EXCLUDED."content", "chat_messages"."content"),
      "mediaUrl" = COALESCE(EXCLUDED."mediaUrl", "chat_messages"."mediaUrl"),
      "raw" = COALESCE(EXCLUDED."raw", "chat_messages"."raw"),
      "messageTimestamp" = EXCLUDED."messageTimestamp",
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
      ${input.remoteJidAlt ?? null}, ${input.senderPn ?? null}, ${input.pushName ?? null},
      ${messageId}, ${input.fromMe}, ${input.messageType ?? 'conversation'},
      ${input.content ?? null}, ${input.mediaUrl ?? null}, ${input.raw ?? Prisma.JsonNull},
      ${messageTimestamp}, NOW(), NOW()
    )
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
}

export async function persistEvolutionMessages(params: {
  userId: string;
  instanceName: string;
  instanceType?: string | null;
  remoteJid: string;
  messages: EvolutionMessage[];
}) {
  for (const message of params.messages) {
    await persistChatMessage({
      userId: params.userId,
      instanceName: params.instanceName,
      instanceType: params.instanceType ?? 'evolution',
      remoteJid: message.key?.remoteJid || params.remoteJid,
      remoteJidAlt: message.key?.remoteJidAlt,
      senderPn: message.key?.senderPn || message.senderPn,
      messageId: message.key?.id || message.id,
      fromMe: Boolean(message.key?.fromMe),
      pushName: message.pushName,
      messageType: message.messageType || 'conversation',
      content: extractMessageText(message),
      mediaUrl: message.message?.mediaUrl,
      raw: message as unknown as Prisma.InputJsonValue,
      messageTimestamp: message.messageTimestamp,
    });
  }
}

export async function getPersistedMessages(params: {
  userId: string;
  remoteJid: string;
  instanceName?: string | null;
  aliases?: string[];
  take?: number;
  skip?: number;
}) {
  await ensureChatMessagesTable();
  const candidates = buildWhatsAppJidCandidates(params.remoteJid, params.aliases ?? []);
  const rows = await db.$queryRaw<PersistedChatMessageRow[]>`
    SELECT *
    FROM "chat_messages"
    WHERE "userId" = ${params.userId}
      ${params.instanceName ? Prisma.sql`AND "instanceName" = ${params.instanceName}` : Prisma.empty}
      AND (
        "remoteJid" IN (${Prisma.join(candidates)})
        OR "remoteJidAlt" IN (${Prisma.join(candidates)})
        OR "senderPn" IN (${Prisma.join(candidates)})
      )
    ORDER BY "messageTimestamp" DESC, "id" DESC
    OFFSET ${params.skip ?? 0}
    LIMIT ${params.take ?? 50}
  `;

  return rows.map(persistedRowToEvolutionMessage);
}

export async function getPersistedInboxChats(params: {
  userIds: string[];
  instanceNames?: string[];
  take?: number;
}): Promise<ChatData[]> {
  const userIds = params.userIds.filter(Boolean);
  if (!userIds.length) return [];
  await ensureChatMessagesTable();

  const rows = await db.$queryRaw<InboxRow[]>`
    SELECT
      s."id" AS "sessionId",
      s."userId",
      s."remoteJid",
      s."remoteJidAlt",
      s."pushName",
      COALESCE(i."instanceName", s."instanceId") AS "instanceName",
      COALESCE(i."instanceType", c."instanceType") AS "instanceType",
      c."lastMessageId" AS "messageId",
      c."lastMessageFromMe" AS "fromMe",
      c."lastMessageType" AS "messageType",
      c."lastMessageContent" AS "content",
      c."lastMessageMediaUrl" AS "mediaUrl",
      c."lastMessageRaw" AS "raw",
      c."lastMessageTimestamp" AS "messageTimestamp",
      s."updatedAt" AS "sessionUpdatedAt"
    FROM "Session" s
    LEFT JOIN "Instancias" i
      ON i."userId" = s."userId"
      AND (i."instanceName" = s."instanceId" OR i."instanceId" = s."instanceId")
    LEFT JOIN LATERAL (
      SELECT *
      FROM "chat_conversations" cc
      WHERE cc."userId" = s."userId"
        AND (
          cc."remoteJid" = s."remoteJid"
          OR cc."remoteJidAlt" = s."remoteJid"
          OR cc."senderPn" = s."remoteJid"
          OR (s."remoteJidAlt" IS NOT NULL AND cc."remoteJid" = s."remoteJidAlt")
          OR (s."remoteJidAlt" IS NOT NULL AND cc."remoteJidAlt" = s."remoteJidAlt")
          OR (s."remoteJidAlt" IS NOT NULL AND cc."senderPn" = s."remoteJidAlt")
        )
      ORDER BY cc."lastMessageTimestamp" DESC, cc."id" DESC
      LIMIT 1
    ) c ON TRUE
    WHERE s."userId" IN (${Prisma.join(userIds)})
      ${params.instanceNames?.length ? Prisma.sql`AND s."instanceId" IN (${Prisma.join(params.instanceNames)})` : Prisma.empty}
    ORDER BY COALESCE(c."lastMessageTimestamp", s."updatedAt") DESC
    LIMIT ${params.take ?? 300}
  `;

  return rows.map(inboxRowToChat);
}
