'use server';

import type { ApiKey } from '@prisma/client';
import { Buffer } from 'buffer';
import {
  buildWhatsAppJidCandidates,
  normalizeWhatsAppConversationJid,
  pickExplicitWhatsAppPhoneJid,
  pickPreferredWhatsAppRemoteJid,
} from '@/lib/whatsapp-jid';

/* ===== Utils compactos ===== */

const maskKey = (k?: string) => (!k ? '' : k.length <= 8 ? '****' : `${k.slice(0, 4)}…${k.slice(-4)}`);
const isDataUrl = (v?: string) => !!v && /^data:[^;]+;base64,/i.test(v);
const safeJsonPreview = (o: unknown, max = 4000) => {
  try {
    const s = JSON.stringify(o, null, 2);
    return s.length > max ? s.slice(0, max) + `…(${s.length - max} chars)` : s;
  } catch {
    return '[unserializable]';
  }
};
const parseTextAsJson = async (t: string) => {
  try {
    return { json: JSON.parse(t), kind: 'json' as const };
  } catch {
    return { json: null, kind: 'text' as const };
  }
};
const normalizeBaseUrl = (u: string) => {
  const x = (u || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(x) ? x : `https://${x}`;
};
const isChatData = (x: any): x is ChatData => x && typeof x === 'object' && typeof x.remoteJid === 'string' && x.unreadCount !== undefined;
const ensureArrayResponse = (p: unknown): ChatData[] => {
  const a =
    (Array.isArray(p) && p) ||
    ((p as any)?.data && Array.isArray((p as any).data) && (p as any).data) ||
    ((p as any)?.chats && Array.isArray((p as any).chats) && (p as any).chats);
  return Array.isArray(a) ? (a as any[]).filter(isChatData) : [];
};
const normalizeFindMessagesPayload = (p: any) => {
  if (p?.messages?.records && Array.isArray(p.messages.records)) {
    const m = p.messages;
    return {
      items: m.records as EvolutionMessage[],
      meta: {
        total: Number(m.total ?? 0) || undefined,
        pages: Number(m.pages ?? 0) || undefined,
        currentPage: Number(m.currentPage ?? 1) || undefined,
        nextPage: m.currentPage < m.pages ? m.currentPage + 1 : null,
      },
    };
  }
  const items = (Array.isArray(p) && p) || (p?.data && Array.isArray(p.data) && p.data) || [];
  return { items: items as EvolutionMessage[], meta: {} };
};
const trimText = (value?: string | null) => value?.trim() ?? '';
const epochToMs = (epoch?: number | null) => {
  if (!epoch) return 0;
  return epoch < 2_000_000_000 ? epoch * 1000 : epoch;
};
const normalizeComparableChatLabel = (value?: string | null) =>
  trimText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const isJidLikeChatLabel = (value?: string | null) => {
  const raw = trimText(value);
  if (!raw) return true;
  if (raw.includes('@')) return true;

  const digits = raw.replace(/[^\d]/g, '');
  return digits.length >= 6 && digits.length === raw.replace(/\s+/g, '').length;
};
const isHumanReadableChatLabel = (value?: string | null) => {
  const raw = trimText(value);
  return Boolean(raw) && !isJidLikeChatLabel(raw);
};
const mergeAliases = (...values: Array<Array<string | null | undefined> | undefined>) =>
  Array.from(
    new Set(
      values
        .flatMap((list) => list ?? [])
        .map((value) => trimText(value))
        .filter(Boolean),
    ),
  );
const getObservedChatAliases = (chat: ChatData) =>
  mergeAliases(
    [chat.remoteJid],
    [chat.remoteJidAlt ?? null, chat.senderPn ?? null],
    chat.aliases,
    [
      chat.lastMessage?.key?.remoteJid ?? null,
      chat.lastMessage?.key?.remoteJidAlt ?? null,
      chat.lastMessage?.key?.senderLid ?? null,
      chat.lastMessage?.key?.senderPn ?? null,
      chat.lastMessage?.senderPn ?? null,
    ],
  );
const getChatIdentityCandidates = (chat: ChatData) =>
  buildWhatsAppJidCandidates(chat.remoteJid, getObservedChatAliases(chat));
const getObservedPhoneJid = (chat: ChatData) =>
  pickExplicitWhatsAppPhoneJid([
    chat.remoteJid,
    chat.remoteJidAlt,
    chat.senderPn,
    chat.lastMessage?.key?.remoteJid,
    chat.lastMessage?.key?.remoteJidAlt,
    chat.lastMessage?.key?.senderPn,
    chat.lastMessage?.senderPn,
  ]);
const hasLidSignal = (chat: ChatData) =>
  getObservedChatAliases(chat).some((alias) => alias.toLowerCase().endsWith('@lid')) ||
  Boolean(trimText(chat.lastMessage?.key?.senderLid));
const chatActivityTimestamp = (chat: ChatData) =>
  epochToMs(chat.lastMessage?.messageTimestamp) ||
  (chat.updatedAt ? new Date(chat.updatedAt).getTime() : 0) ||
  (chat.windowStart ? new Date(chat.windowStart).getTime() : 0);
const normalizeLastMessage = (
  lastMessage: LastMessage | null,
  fallbackRemoteJid: string,
): LastMessage | null => {
  if (!lastMessage) return null;

  const normalizedRemoteJid =
    pickPreferredWhatsAppRemoteJid([
      lastMessage.key?.remoteJid,
      lastMessage.key?.remoteJidAlt,
      lastMessage.key?.senderPn,
      lastMessage.senderPn,
      fallbackRemoteJid,
      lastMessage.key?.senderLid,
    ]) || fallbackRemoteJid;

  return {
    ...lastMessage,
    key: {
      ...lastMessage.key,
      remoteJid: normalizedRemoteJid,
    },
  };
};
const mergeChatEntries = (current: ChatData, next: ChatData) => {
  const currentTs = chatActivityTimestamp(current);
  const nextTs = chatActivityTimestamp(next);
  const primary = nextTs >= currentTs ? next : current;
  const secondary = primary === next ? current : next;
  const aliases = mergeAliases(
    getObservedChatAliases(current),
    getObservedChatAliases(next),
    [current.lastMessage?.key?.remoteJid ?? null, next.lastMessage?.key?.remoteJid ?? null],
    [current.lastMessage?.key?.senderLid ?? null, next.lastMessage?.key?.senderLid ?? null],
  );
  const mergedRemoteJid =
    pickPreferredWhatsAppRemoteJid([
      getObservedPhoneJid(primary),
      getObservedPhoneJid(secondary),
      primary.remoteJid,
      secondary.remoteJid,
      ...aliases,
    ]) ||
    primary.remoteJid ||
    secondary.remoteJid;
  const primaryLastMessageTs = epochToMs(primary.lastMessage?.messageTimestamp);
  const secondaryLastMessageTs = epochToMs(secondary.lastMessage?.messageTimestamp);
  const latestLastMessage =
    primaryLastMessageTs >= secondaryLastMessageTs ? primary.lastMessage : secondary.lastMessage;

  return {
    ...secondary,
    ...primary,
    remoteJid: mergedRemoteJid,
    pushName: primary.pushName || secondary.pushName,
    remoteJidAlt: primary.remoteJidAlt || secondary.remoteJidAlt,
    senderPn: primary.senderPn || secondary.senderPn,
    profilePicUrl: primary.profilePicUrl || secondary.profilePicUrl,
    lastMessage: normalizeLastMessage(latestLastMessage, mergedRemoteJid),
    unreadCount: Number(current.unreadCount ?? 0) + Number(next.unreadCount ?? 0),
    updatedAt: primary.updatedAt || secondary.updatedAt,
    windowStart: primary.windowStart || secondary.windowStart,
    windowExpires: primary.windowExpires || secondary.windowExpires,
    windowActive: Boolean(current.windowActive || next.windowActive),
    isSaved: primary.isSaved ?? secondary.isSaved,
    aliases,
  };
};
const canMergeChatsByProfileHeuristic = (current: ChatData, next: ChatData) => {
  const currentProfilePic = trimText(current.profilePicUrl);
  const nextProfilePic = trimText(next.profilePicUrl);

  if (!currentProfilePic || currentProfilePic !== nextProfilePic) {
    return false;
  }

  const currentName = normalizeComparableChatLabel(current.pushName);
  const nextName = normalizeComparableChatLabel(next.pushName);
  const currentHuman = isHumanReadableChatLabel(current.pushName);
  const nextHuman = isHumanReadableChatLabel(next.pushName);
  const currentJidLike = isJidLikeChatLabel(current.pushName);
  const nextJidLike = isJidLikeChatLabel(next.pushName);

  if (currentHuman && nextHuman && currentName && currentName === nextName) {
    return true;
  }

  if (!(hasLidSignal(current) || hasLidSignal(next))) {
    return false;
  }

  return (currentHuman && nextJidLike) || (nextHuman && currentJidLike);
};
const mergeChatDataByConversation = (chats: ChatData[]) => {
  const groupedChats = new Map<string, ChatData>();
  const aliasToGroupKey = new Map<string, string>();

  for (const chat of chats) {
    const normalizedChat: ChatData = {
      ...chat,
      aliases: getObservedChatAliases(chat),
    };
    normalizedChat.remoteJid =
      pickPreferredWhatsAppRemoteJid([
        getObservedPhoneJid(normalizedChat),
        normalizedChat.remoteJid,
        ...(normalizedChat.aliases ?? []),
      ]) ||
      normalizedChat.remoteJid;
    normalizedChat.lastMessage = normalizeLastMessage(
      normalizedChat.lastMessage,
      normalizedChat.remoteJid,
    );

    const matchedGroupKey = getChatIdentityCandidates(normalizedChat).find((alias) =>
      aliasToGroupKey.has(alias),
    );
    if (!matchedGroupKey) {
      const groupKey = normalizedChat.remoteJid;
      groupedChats.set(groupKey, normalizedChat);
      for (const alias of getChatIdentityCandidates(normalizedChat)) {
        aliasToGroupKey.set(alias, groupKey);
      }
      continue;
    }

    const existingGroupKey = aliasToGroupKey.get(matchedGroupKey) ?? matchedGroupKey;
    const current = groupedChats.get(existingGroupKey);
    if (!current) {
      groupedChats.set(existingGroupKey, normalizedChat);
      for (const alias of getChatIdentityCandidates(normalizedChat)) {
        aliasToGroupKey.set(alias, existingGroupKey);
      }
      continue;
    }

    const mergedChat = mergeChatEntries(current, normalizedChat);
    groupedChats.set(existingGroupKey, mergedChat);
    for (const alias of getChatIdentityCandidates(mergedChat)) {
      aliasToGroupKey.set(alias, existingGroupKey);
    }
  }

  const profileMergedChats: ChatData[] = [];
  for (const chat of Array.from(groupedChats.values())) {
    const existingIndex = profileMergedChats.findIndex((candidate) =>
      canMergeChatsByProfileHeuristic(candidate, chat),
    );

    if (existingIndex === -1) {
      profileMergedChats.push(chat);
      continue;
    }

    profileMergedChats[existingIndex] = mergeChatEntries(profileMergedChats[existingIndex], chat);
  }

  return profileMergedChats.sort(
    (a, b) => chatActivityTimestamp(b) - chatActivityTimestamp(a),
  );
};
const buildEvolutionMessageFingerprint = (message: EvolutionMessage) => {
  const explicitId = message.key?.id || message.id;
  if (explicitId) return explicitId;

  const body = message.message || {};
  const content =
    body.conversation ||
    body.extendedTextMessage?.text ||
    body.imageMessage?.caption ||
    body.videoMessage?.caption ||
    body.documentMessage?.caption ||
    '';

  return JSON.stringify([
    message.messageType ?? '',
    message.messageTimestamp ?? 0,
    message.key?.fromMe ?? false,
    content,
  ]);
};
const sortMessagesNewestFirst = (messages: EvolutionMessage[]) =>
  [...messages].sort((a, b) => {
    const tsDiff = epochToMs(b.messageTimestamp) - epochToMs(a.messageTimestamp);
    if (tsDiff !== 0) return tsDiff;

    const aId = a.key?.id || a.id || '';
    const bId = b.key?.id || b.id || '';
    return bId.localeCompare(aId);
  });

async function fetchMessagesForRemoteJid(
  endpoint: string,
  apiKey: string,
  remoteJid: string,
  options?: {
    timeoutMs?: number;
    page?: number;
    pageSize?: number;
    limit?: number;
  },
) {
  const payload: Record<string, any> = {
    where: {
      key: { remoteJid },
    },
  };

  if (options?.page) payload.page = options.page;
  if (options?.pageSize) payload.offset = options.pageSize;
  else if (options?.limit) payload.offset = options.limit;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), options?.timeoutMs ?? 15000);

  try {
    const res = await doRequest(endpoint, apiKey, ctrl.signal, 'POST', payload);
    clearTimeout(t);
    const raw = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false as const,
        message: (raw?.message as string) || `Error ${res.status} en la API.`,
        raw,
      };
    }

    if (!raw) {
      return {
        success: false as const,
        message: 'Respuesta inválida o vacía.',
      };
    }

    const { items, meta } = normalizeFindMessagesPayload(raw);
    return {
      success: true as const,
      items,
      meta,
      raw,
    };
  } catch (e: any) {
    clearTimeout(t);
    return {
      success: false as const,
      message: e?.name === 'AbortError' ? 'Timeout de solicitud.' : `Error de red: ${e?.message || String(e)}`,
    };
  }
}

async function doRequest(
  url: string,
  apikey: string,
  signal: AbortSignal,
  method: 'POST' | 'GET',
  body?: Record<string, any>,
  _log = false // se mantiene la firma, pero no se loggea nada
) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', apikey },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    cache: 'no-store',
    signal,
  });
  return res;
}

/* base64 helpers */
const fileToBase64Raw = async (f: File) => ({
  base64: Buffer.from(await f.arrayBuffer()).toString('base64').replace(/(\r\n|\n|\r)/g, ''),
  mime: f.type || 'application/octet-stream',
});

const bufferToBase64Raw = (b: Buffer) => b.toString('base64').replace(/(\r\n|\n|\r)/g, '');

const fetchUrlToBase64 = async (u: string, hinted?: string) => {
  const r = await fetch(u, { cache: 'no-store' });
  if (!r.ok) throw new Error(`No se pudo descargar la media: ${r.status}`);
  const mime = hinted || r.headers.get('content-type') || 'application/octet-stream';
  const base64 = bufferToBase64Raw(Buffer.from(await r.arrayBuffer()));
  let fileName: string | undefined;
  try {
    const last = new URL(u).pathname.split('/').filter(Boolean).pop();
    fileName = last || undefined;
  } catch { }
  return { base64, mime, fileName };
};
function normalizeBase64(b64: string) {
  let s = (b64 || '').trim().replace(/-/g, '+').replace(/_/g, '/').replace(/(\s|\r\n|\n|\r)/g, '');
  const mod = s.length % 4;
  if (mod === 2) s += '==';
  else if (mod === 3) s += '=';
  else if (mod === 1) throw new Error('Cadena base64 inválida (longitud no válida).');
  return s;
}
async function ensureBase64FromString(mediaUrl: string, mimetype?: string) {
  const input = (mediaUrl || '').trim();
  if (isDataUrl(input)) {
    const i = input.indexOf(','),
      head = input.slice(0, i),
      m = head.match(/^data:([^;]+);base64/i);
    const mime = m?.[1] || mimetype || 'application/octet-stream';
    const base64 = normalizeBase64(input.slice(i + 1).replace(/(\s|\r\n|\n|\r)/g, ''));
    Buffer.from(base64, 'base64');
    return { base64, mime };
  }
  if (/^https?:\/\//i.test(input)) {
    const { base64, mime, fileName } = await fetchUrlToBase64(input, mimetype);
    Buffer.from(base64, 'base64');
    return { base64, mime, inferredName: fileName };
  }
  const base64 = normalizeBase64(input.replace(/^base64,?/i, '').replace(/(\s|\r\n|\n|\r)/g, ''));
  Buffer.from(base64, 'base64');
  return { base64, mime: mimetype || 'application/octet-stream' };
}
const mediaTypeFromMime = (m: string): MediaType =>
  (m = (m || '').toLowerCase()).startsWith('image/')
    ? 'image'
    : m.startsWith('video/')
      ? 'video'
      : m.startsWith('audio/')
        ? 'audio'
        : 'document';

/* ===== Tipos exportados ===== */

type MediaMessagePayload = {
  url?: string;
  mediaUrl?: string;
  mediaKey?: string;
  mimetype?: string;
  fileLength?: string | number;
  fileSha256?: string;
  fileEncSha256?: string;
  jpegThumbnail?: string;
  width?: number;
  height?: number;
  seconds?: number;
  ptt?: boolean;
  caption?: string;
};

export type MessageContent = {
  conversation?: string;
  extendedTextMessage?: { text: string };
  imageMessage?: MediaMessagePayload;
  documentMessage?: MediaMessagePayload;
  videoMessage?: MediaMessagePayload;
  audioMessage?: MediaMessagePayload;
  stickerMessage?: MediaMessagePayload & { isAnimated?: boolean };
  reactionMessage?: {
    text: string;
    key?: { id?: string; fromMe?: boolean; remoteJid?: string };
    senderTimestampMs?: number;
  };
  mediaUrl?: string;
  messageContextInfo?: Record<string, unknown>;
};

export type EvolutionMessage = {
  id?: string;
  key?: {
    id?: string;
    fromMe?: boolean;
    remoteJid?: string;
    remoteJidAlt?: string;
    senderLid?: string;
    senderPn?: string;
  };
  pushName?: string | null;
  senderPn?: string | null;
  participant?: string | null;
  messageType?: string;
  message: MessageContent;
  contextInfo?: Record<string, unknown> | null;
  source?: string;
  messageTimestamp?: number;
  instanceId?: string;
  sessionId?: string | null;
  status?: string;
  MessageUpdate?: Array<any>;
};

export type LastMessage = {
  id: string | null;
  key: {
    id: string;
    fromMe: boolean;
    remoteJid: string;
    remoteJidAlt?: string;
    senderLid?: string;
    senderPn?: string;
  };
  pushName: string | null;
  senderPn?: string | null;
  participant: string | null;
  messageType: string;
  message: MessageContent;
  contextInfo: Record<string, unknown> | null;
  source: string;
  messageTimestamp: number;
  instanceId: string;
  sessionId: string | null;
  status: string;
};

export type ChatData = {
  id: string | null;
  remoteJid: string;
  remoteJidAlt?: string | null;
  senderPn?: string | null;
  aliases?: string[];
  pushName: string | null;
  profilePicUrl: string | null;
  updatedAt?: string;
  windowStart?: string;
  windowExpires?: string;
  windowActive?: boolean;
  lastMessage: LastMessage | null;
  unreadCount: number;
  isSaved?: number | boolean;
};
type ChatArray = ChatData[];

export type FetchChatsResult =
  | { success: true; message: string; data: ChatArray }
  | { success: false; message: string };

export type FindMessagesResult =
  | {
    success: true;
    message: string;
    data: EvolutionMessage[];
    total?: number;
    pages?: number;
    currentPage?: number;
    nextPage?: number | null;
    raw?: unknown;
    queriedRemoteJid?: string;
  }
  | { success: false; message: string; raw?: unknown; queriedRemoteJid?: string };

export type SendMessageResult =
  | { success: true; message: string; data?: unknown; remoteJid: string }
  | { success: false; message: string; raw?: unknown; remoteJid: string };

export type MediaType = 'image' | 'video' | 'audio' | 'document';

export interface SendMediaUrlParams {
  mediatype: MediaType;
  mediaUrl: string;
  fileName?: string;
  mimetype?: string;
  caption?: string;
  ptt?: boolean;
  delay?: number;
  linkPreview?: boolean;
  mentionsEveryOne?: boolean;
  mentioned?: string[];
  quotedMessage?: { key: { id: string }; message: { conversation: string } };
}

export type GetMediaResult =
  | {
    success: true;
    message: string;
    data: { base64: string; mimetype: string; fileLength: number };
    raw?: unknown;
    messageId: string;
  }
  | { success: false; message: string; raw?: unknown; messageId: string };

/* ===== Acciones exportadas ===== */

export async function fetchChatsFromEvolution(
  apiKeyData: Pick<ApiKey, 'url' | 'key'>,
  instanceName: string,
  options?: { timeoutMs?: number; allowInsecureTLS?: boolean; path?: 'findChats' }
): Promise<FetchChatsResult> {
  const { url: baseUrlRaw, key } = apiKeyData;

  // LOG 1: Inicio de la llamada

  if (!baseUrlRaw || !key || !instanceName) {
    // LOG 2: Error de parámetros de entrada
    console.error(`[SERVER/FETCH] 🛑 ERROR CRÍTICO: Parámetros de conexión faltantes (URL, KEY o INSTANCE).`);
    return { success: false, message: 'Parámetros de conexión faltantes.' };
  }

  const baseURL = normalizeBaseUrl(baseUrlRaw);
  const endpoint = `${baseURL}/chat/findChats/${encodeURIComponent(instanceName)}`;
  const ctrl = new AbortController();
  // const timeoutMs = options?.timeoutMs ?? 2000;
  const timeoutMs = 15000;

  const t = setTimeout(() => ctrl.abort(), timeoutMs);


  try {
    // Intento POST, luego fallback a GET
    let res = await doRequest(endpoint, key, ctrl.signal, 'POST');

    if (!res.ok && (res.status === 404 || res.status === 405)) {
      res = await doRequest(endpoint, key, ctrl.signal, 'GET');
    }

    clearTimeout(t);
    const raw = await res.json().catch(() => null);

    if (!res.ok) {
      const status = res.status;
      const msg = (raw?.message as string) || `Error ${status} en la API.`;
      // LOG 3: Error de la API (Estatus HTTP no 2xx)
      console.error(`[SERVER/FETCH] ❌ ERROR API (Status ${status}): ${msg}`);
      if (raw) {
        console.error(`[SERVER/FETCH] 📄 Respuesta RAW del error: ${safeJsonPreview(raw, 500)}`);
      }
      return { success: false, message: msg };
    }

    if (!raw) {
      console.warn(`[SERVER/FETCH] ⚠️ Respuesta recibida pero JSON vacío/inválido.`);
      return { success: false, message: 'Respuesta inválida o vacía.' };
    }

    const chatData = mergeChatDataByConversation(ensureArrayResponse(raw));
    // LOG 4: Éxito
    return { success: true, message: `OK findChats ${instanceName}`, data: chatData };
  } catch (e: any) {
    clearTimeout(t);
    const errMsg = e?.name === 'AbortError' ? 'Timeout de solicitud.' : `Error de red: ${e?.message || String(e)}`;
    // LOG 5: Error de red/timeout
    console.error(`[SERVER/FETCH] 🛑 ERROR DE RED/TIMEOUT: ${errMsg}`);
    return {
      success: false,
      message: errMsg,
    };
  }
}
export async function findMessagesByRemoteJid(
  apiKeyData: Pick<ApiKey, 'url' | 'key'>,
  instanceName: string,
  remoteJid: string,
  options?: {
    timeoutMs?: number;
    page?: number;
    pageSize?: number;
    limit?: number;
    remoteJidAliases?: string[];
    // La lectura ahora es obligatoria, se eliminó la opción 'fetchAndMarkAsRead'
  }
): Promise<FindMessagesResult> {
  const { url: baseUrlRaw, key } = apiKeyData;

  if (!baseUrlRaw || !key || !instanceName || !remoteJid) {
    return {
      success: false,
      message: 'URL / API Key / instanceName / remoteJid faltantes.',
      queriedRemoteJid: remoteJid,
    };
  }

  const baseURL = normalizeBaseUrl(baseUrlRaw);
  const endpoint = `${baseURL}/chat/findMessages/${encodeURIComponent(instanceName)}`;
  const requestedRemoteJid = remoteJid.trim();
  const normalizedRemoteJid =
    normalizeWhatsAppConversationJid(requestedRemoteJid) || requestedRemoteJid;
  const rawCandidates = buildWhatsAppJidCandidates(
    requestedRemoteJid,
    options?.remoteJidAliases ?? [],
  );
  const apiCandidates = rawCandidates.filter((candidate) => candidate.includes('@'));
  const candidatesToQuery = apiCandidates.length ? apiCandidates : rawCandidates;
  const successfulResponses: Array<{
    remoteJid: string;
    items: EvolutionMessage[];
    raw: unknown;
  }> = [];
  let firstFailure: { message: string; raw?: unknown } | null = null;

  for (const candidateRemoteJid of candidatesToQuery) {
    const response = await fetchMessagesForRemoteJid(endpoint, key, candidateRemoteJid, options);

    if (!response.success) {
      if (!firstFailure) {
        firstFailure = {
          message: response.message,
          raw: response.raw,
        };
      }
      continue;
    }

    successfulResponses.push({
      remoteJid: candidateRemoteJid,
      items: response.items,
      raw: response.raw,
    });
  }

  if (!successfulResponses.length) {
    return {
      success: false,
      message: firstFailure?.message || 'Respuesta inválida o vacía.',
      raw: firstFailure?.raw,
      queriedRemoteJid: normalizedRemoteJid,
    };
  }

  const uniqueMessages = new Map<string, EvolutionMessage>();
  for (const response of successfulResponses) {
    for (const item of response.items) {
      const fingerprint = buildEvolutionMessageFingerprint(item);
      if (!uniqueMessages.has(fingerprint)) {
        uniqueMessages.set(fingerprint, item);
      }
    }
  }

  const items = sortMessagesNewestFirst(Array.from(uniqueMessages.values()));

  if (items.length > 0) {
    const messagesToMarkMap = new Map<string, MessageReadKey>();
    for (const msg of items) {
      if (msg.key?.fromMe ?? false) {
        continue;
      }

      const messageId = msg.key?.id || '';
      const messageRemoteJid = msg.key?.remoteJid || normalizedRemoteJid;
      if (!messageId || !messageRemoteJid) {
        continue;
      }

      messagesToMarkMap.set(`${messageRemoteJid}:${messageId}`, {
        remoteJid: messageRemoteJid,
        messageId,
        fromMe: false,
      });
    }

    const messagesToMark = Array.from(messagesToMarkMap.values());
    const resultRead =
      messagesToMark.length > 0
        ? await markMessagesAsReadByIds(apiKeyData, instanceName, messagesToMark)
        : { success: true, message: 'No había mensajes entrantes pendientes por marcar.' };

    if (!resultRead.success) {
      console.warn(`[READ] ⚠️ Falló la Lectura Mandatoria en ${normalizedRemoteJid}: ${resultRead.message}`);
    }
  }

  return {
    success: true,
    message: `OK findMessages ${instanceName} ${normalizedRemoteJid}`,
    data: items,
    total: items.length,
    pages: 1,
    currentPage: 1,
    nextPage: null,
    raw: successfulResponses.map((response) => response.raw),
    queriedRemoteJid: normalizedRemoteJid,
  };
}
export async function sendTextMessage(
  apiKeyData: Pick<ApiKey, 'url' | 'key'>,
  instanceName: string,
  remoteJid: string,
  textMessage: string,
  options?: {
    timeoutMs?: number;
    delay?: number;
    quotedMessage?: { key: { id: string }; message: { conversation: string } };
    linkPreview?: boolean;
    mentionsEveryOne?: boolean;
    mentioned?: string[];
  }
): Promise<SendMessageResult> {
  const { url: baseUrlRaw, key } = apiKeyData;
  if (!baseUrlRaw || !key || !instanceName || !remoteJid || !textMessage)
    return {
      success: false,
      message:
        'Parámetros de conexión faltantes (URL, API Key, instanceName, remoteJid, o textMessage).',
      remoteJid,
    };
  const baseURL = normalizeBaseUrl(baseUrlRaw);
  const endpoint = `${baseURL}/message/sendText/${encodeURIComponent(instanceName)}`;
  const body: Record<string, any> = { number: remoteJid, text: textMessage };
  if (options?.delay) body.delay = options.delay;
  if (options?.quotedMessage) body.quoted = options.quotedMessage;
  if (options?.linkPreview !== undefined) body.linkPreview = options.linkPreview;
  if (options?.mentionsEveryOne !== undefined) body.mentionsEveryOne = options.mentionsEveryOne;
  if (options?.mentioned?.length) body.mentioned = options.mentioned;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), options?.timeoutMs ?? 15000);
  try {
    const res = await doRequest(endpoint, key, ctrl.signal, 'POST', body, true);
    clearTimeout(t);
    const raw = await res.json().catch(() => null);
    if (!res.ok)
      return {
        success: false,
        message: (raw?.message as string) || `Error ${res.status} en la API al enviar mensaje.`,
        raw,
        remoteJid,
      };
    if (!raw) return { success: false, message: 'Respuesta inválida o vacía al enviar mensaje.', remoteJid };
    return { success: true, message: `Mensaje enviado OK a ${remoteJid}`, data: raw, remoteJid };
  } catch (e: any) {
    clearTimeout(t);
    return {
      success: false,
      message: e?.name === 'AbortError' ? 'Timeout de solicitud.' : `Error de red: ${e?.message || String(e)}`,
      remoteJid,
    };
  }
}

/* ===== Envío de Audio (number, audio[, encoding]) ===== */

export async function sendAudio(
  apiKeyData: Pick<ApiKey, 'url' | 'key'>,
  instanceName: string,
  remoteJid: string,
  audioSource: string,
  options?: {
    timeoutMs?: number;
    delay?: number;
    quotedMessage?: { key: { id: string }; message: { conversation: string } };
    mentionsEveryOne?: boolean;
    mentioned?: string[];
    ptt?: boolean;
    mimetype?: string;
    forceBase64?: boolean;
  }
): Promise<SendMessageResult> {
  const { url: baseUrlRaw, key } = apiKeyData;
  if (!baseUrlRaw || !key || !instanceName || !remoteJid || !audioSource)
    return { success: false, message: 'Parámetros faltantes para audio.', remoteJid };
  const baseURL = normalizeBaseUrl(baseUrlRaw);
  const endpoint = `${baseURL}/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`;
  const isHttp = /^https?:\/\//i.test(audioSource);
  let audio: string | undefined,
    encoding = false;
  if (!isHttp || options?.forceBase64) {
    const { base64 } = await ensureBase64FromString(audioSource, options?.mimetype || 'audio/ogg');
    audio = base64;
    encoding = true;
  } else audio = audioSource;
  const body: Record<string, any> = { number: remoteJid, audio };
  if (options?.delay !== undefined) body.delay = options.delay;
  if (options?.quotedMessage) body.quoted = options.quotedMessage;
  if (options?.mentionsEveryOne !== undefined) body.mentionsEveryOne = options.mentionsEveryOne;
  if (options?.mentioned?.length) body.mentioned = options.mentioned;
  if (options?.ptt !== undefined) body.ptt = options.ptt;
  if (encoding) body.encoding = true;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), options?.timeoutMs ?? 20000);
  try {
    const res = await doRequest(endpoint, key, ctrl.signal, 'POST', body, true);
    clearTimeout(t);
    const raw = await res.json().catch(() => null);
    if (!res.ok)
      return {
        success: false,
        message: (raw?.message as string) || `Error ${res.status} al enviar audio.`,
        raw,
        remoteJid,
      };
    if (!raw) return { success: false, message: 'Respuesta inválida o vacía al enviar audio.', remoteJid };
    return { success: true, message: `Audio enviado a ${remoteJid}`, data: raw, remoteJid };
  } catch (e: any) {
    clearTimeout(t);
    return {
      success: false,
      message: e?.name === 'AbortError' ? 'Timeout de solicitud.' : `Error de red: ${e?.message || String(e)}`,
      remoteJid,
    };
  }
}

/* ===== Envío de Media genérico (image/video/document) ===== */

export async function sendMediaByUrl(
  apiKeyData: Pick<ApiKey, 'url' | 'key'>,
  instanceName: string,
  remoteJid: string,
  params: SendMediaUrlParams,
  options?: { timeoutMs?: number }
): Promise<SendMessageResult> {
  const { url: baseUrlRaw, key } = apiKeyData;
  if (!baseUrlRaw || !key || !instanceName || !remoteJid)
    return { success: false, message: 'Parámetros faltantes (URL/API Key/instanceName/remoteJid).', remoteJid };
  if (!params?.mediaUrl || !params?.mediatype)
    return { success: false, message: 'Faltan campos en params: mediatype y mediaUrl son obligatorios.', remoteJid };
  if (params.mediatype === 'audio')
    return sendAudio(apiKeyData, instanceName, remoteJid, params.mediaUrl, {
      timeoutMs: options?.timeoutMs,
      delay: params.delay,
      quotedMessage: params.quotedMessage,
      mentionsEveryOne: params.mentionsEveryOne,
      mentioned: params.mentioned,
      ptt: params.ptt,
      mimetype: params.mimetype,
    });

  const baseURL = normalizeBaseUrl(baseUrlRaw);
  const endpoint = `${baseURL}/message/sendMedia/${encodeURIComponent(instanceName)}`;
  const norm = await ensureBase64FromString(params.mediaUrl, params.mimetype);
  let fileName = params.fileName || norm.inferredName;
  if (params.mediatype === 'document' && !fileName) {
    const m = (norm.mime || '').toLowerCase();
    const ext =
      m.includes('pdf')
        ? 'pdf'
        : m.includes('zip')
          ? 'zip'
          : m.includes('msword')
            ? 'doc'
            : m.includes('excel')
              ? 'xls'
              : m.includes('powerpoint')
                ? 'ppt'
                : m.includes('text')
                  ? 'txt'
                  : m.includes('json')
                    ? 'json'
                    : m.includes('csv')
                      ? 'csv'
                      : m.includes('png')
                        ? 'png'
                        : m.includes('jpeg') || m.includes('jpg')
                          ? 'jpg'
                          : m.includes('mp4')
                            ? 'mp4'
                            : m.includes('mp3')
                              ? 'mp3'
                              : 'bin';
    fileName = `file.${ext}`;
  }
  const body: Record<string, any> = {
    number: remoteJid,
    mediatype: params.mediatype,
    mimetype: norm.mime,
    caption: params.caption,
    media: norm.base64,
    fileName,
  };
  if (params.delay !== undefined) body.delay = params.delay;
  if (params.linkPreview !== undefined) body.linkPreview = params.linkPreview;
  if (params.mentionsEveryOne !== undefined) body.mentionsEveryOne = params.mentionsEveryOne;
  if (params.mentioned?.length) body.mentioned = params.mentioned;
  if (params.quotedMessage) body.quoted = params.quotedMessage;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), options?.timeoutMs ?? 20000);
  try {
    const res = await doRequest(endpoint, key, ctrl.signal, 'POST', body, true);
    clearTimeout(t);
    const raw = await res.json().catch(() => null);
    if (!res.ok) {
      const em = raw?.response?.message;
      const msg =
        (Array.isArray(em) ? em.join(', ') : (em as string) || (raw?.message as string)) ||
        `Error ${res.status} al enviar media.`;
      return { success: false, message: msg, raw, remoteJid };
    }
    if (!raw) return { success: false, message: 'Respuesta inválida o vacía al enviar media.', remoteJid };
    return { success: true, message: `Media (${params.mediatype}) enviada a ${remoteJid}`, data: raw, remoteJid };
  } catch (e: any) {
    clearTimeout(t);
    return {
      success: false,
      message: e?.name === 'AbortError' ? 'Timeout de solicitud.' : `Error de red: ${e?.message || String(e)}`,
      remoteJid,
    };
  }
}

/* ===== Obtener Media Base64 ===== */

export async function getMediaBase64FromMessage(
  apiKeyData: Pick<ApiKey, 'url' | 'key'>,
  instanceName: string,
  messageId: string,
  options?: { timeoutMs?: number; convertToMp4?: boolean }
): Promise<GetMediaResult> {
  const { url: baseUrlRaw, key } = apiKeyData;
  if (!baseUrlRaw || !key || !instanceName || !messageId)
    return { success: false, message: 'URL / API Key / instanceName / messageId faltantes.', messageId };
  const baseURL = normalizeBaseUrl(baseUrlRaw);
  const endpoint = `${baseURL}/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`;

  const body: Record<string, any> = {
    message: {
      key: { id: messageId },
    },
    convertToMp4: options?.convertToMp4 === true,
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), options?.timeoutMs ?? 20000);

  try {
    const res = await doRequest(endpoint, key, ctrl.signal, 'POST', body, false);
    clearTimeout(t);
    const raw = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        message: (raw?.message as string) || `Error ${res.status} al obtener media.`,
        raw,
        messageId,
      };
    }
    if (!raw || !raw.base64) {
      return { success: false, message: 'Respuesta inválida o falta el campo base64.', messageId };
    }

    const { base64, mimetype, fileLength } = raw;

    return {
      success: true,
      message: `Media obtenida OK para el ID ${messageId}`,
      data: {
        base64: String(base64),
        mimetype: String(mimetype || 'application/octet-stream'),
        fileLength: Number(fileLength || 0),
      },
      raw,
      messageId,
    };
  } catch (e: any) {
    clearTimeout(t);
    return {
      success: false,
      message: e?.name === 'AbortError' ? 'Timeout de solicitud.' : `Error de red: ${e?.message || String(e)}`,
      messageId,
    };
  }
}

/* ===== Atajos ===== */

export async function sendFileBase64(
  apiKeyData: Pick<ApiKey, 'url' | 'key'>,
  instanceName: string,
  remoteJid: string,
  file: File,
  caption?: string
): Promise<SendMessageResult> {
  try {
    const { base64, mime } = await fileToBase64Raw(file);
    const mediatype: MediaType = mime.startsWith('image/')
      ? 'image'
      : mime.startsWith('video/')
        ? 'video'
        : mime.startsWith('audio/')
          ? 'audio'
          : 'document';
    return await sendMediaByUrl(apiKeyData, instanceName, remoteJid, {
      mediatype,
      mediaUrl: base64,
      mimetype: mime,
      fileName: file.name,
      caption,
    });
  } catch (e: any) {
    return {
      success: false,
      message: `Error en la preparación/conversión: ${e?.message || String(e)}`,
      remoteJid,
    };
  }
}

export async function sendMediaAuto(
  apiKeyData: Pick<ApiKey, 'url' | 'key'>,
  instanceName: string,
  remoteJid: string,
  source: File | string,
  hinted?: {
    mimetype?: string;
    mediatype?: MediaType;
    fileName?: string;
    caption?: string;
    ptt?: boolean;
    delay?: number;
    linkPreview?: boolean;
    mentionsEveryOne?: boolean;
    mentioned?: string[];
    quotedMessage?: { key: { id: string }; message: { conversation: string } };
    timeoutMs?: number;
    forceAudioBase64?: boolean;
  }
): Promise<SendMessageResult> {
  let mime = hinted?.mimetype || 'application/octet-stream',
    fileName = hinted?.fileName;
  if (typeof source !== 'string') {
    mime = source.type || mime;
    fileName = fileName || source.name;
  }
  const mediatype: MediaType = hinted?.mediatype || mediaTypeFromMime(mime);
  if (mediatype === 'audio') {
    const audioSource = typeof source === 'string' ? source : (await fileToBase64Raw(source)).base64;
    return sendAudio(apiKeyData, instanceName, remoteJid, audioSource, {
      timeoutMs: hinted?.timeoutMs,
      delay: hinted?.delay,
      quotedMessage: hinted?.quotedMessage,
      mentionsEveryOne: hinted?.mentionsEveryOne,
      mentioned: hinted?.mentioned,
      ptt: hinted?.ptt,
      mimetype: mime,
      forceBase64: hinted?.forceAudioBase64,
    });
  }
  const mediaUrl = typeof source === 'string' ? source : (await fileToBase64Raw(source)).base64;
  return sendMediaByUrl(
    apiKeyData,
    instanceName,
    remoteJid,
    {
      mediatype,
      mediaUrl,
      mimetype: mime,
      fileName,
      caption: hinted?.caption,
      delay: hinted?.delay,
      linkPreview: hinted?.linkPreview,
      mentionsEveryOne: hinted?.mentionsEveryOne,
      mentioned: hinted?.mentioned,
      quotedMessage: hinted?.quotedMessage,
    },
    { timeoutMs: hinted?.timeoutMs }
  );
}

// Define el tipo para la entrada de la función
type MessageReadKey = {
  remoteJid: string;
  messageId: string; // ID del mensaje (key.id)
  fromMe: boolean;  // Si el mensaje fue enviado por la instancia de WhatsApp
};

export async function markMessagesAsReadByIds(
  apiKeyData: Pick<ApiKey, 'url' | 'key'>,
  instanceName: string,
  // Parámetro modificado para aceptar un array
  messagesToMark: MessageReadKey[],
  options?: { timeoutMs?: number }
): Promise<{ success: boolean; message: string; raw?: unknown }> {
  const { url, key } = apiKeyData;

  // 1. Validación de parámetros de conexión y entrada
  if (!url || !key || !instanceName) {
    console.error(`[READ] 🛑 Error markMessagesAsReadByIds: Parámetros de conexión faltantes.`);
    return { success: false, message: 'Parámetros de conexión (url, key, o instanceName) faltantes.' };
  }
  if (!messagesToMark || messagesToMark.length === 0) {
    console.warn(`[READ] ℹ️ markMessagesAsReadByIds: Array de mensajes vacío. Terminando sin acción.`);
    return { success: true, message: 'Array de mensajes para marcar como leídos estaba vacío.', raw: {} };
  }

  const endpoint = `${normalizeBaseUrl(url)}/chat/markMessageAsRead/${encodeURIComponent(instanceName)}`;

  // 2. Mapeo de la entrada al formato de la API
  const readMessagesPayload = messagesToMark.map(m => ({
    "remoteJid": m.remoteJid,
    "fromMe": m.fromMe,
    "id": m.messageId
  }));

  const body = {
    "readMessages": readMessagesPayload
  };

  // Logs para seguimiento
  const count = readMessagesPayload.length;
  const jid = readMessagesPayload[0].remoteJid; // JID del primer mensaje para log


  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 10000);

  try {
    const res = await doRequest(endpoint, key, controller.signal, 'POST', body, false);
    clearTimeout(timeout);

    const raw = await res.json().catch(() => null);
    if (!res.ok) {
      const errorMsg = raw?.message || `Error ${res.status} al marcar ${count} mensajes como leídos.`;
      console.error(`[READ] ❌ Falló markMessagesAsReadByIds (x${count}, JID: ${jid}): ${errorMsg}`);
      return {
        success: false,
        message: errorMsg,
        raw,
      };
    }


    return { success: true, message: `${count} mensajes marcados como leídos con éxito.`, raw };
  } catch (e: any) {
    clearTimeout(timeout);
    const errMsg = e?.name === 'AbortError' ? 'Timeout de solicitud.' : `Error de red: ${e.message || String(e)}`;
    console.error(`[READ] 🛑 Error de red/timeout en markMessagesAsReadByIds (x${count}, JID: ${jid}): ${errMsg}`);
    return {
      success: false,
      message: errMsg,
    };
  }
}
