import { cn, SERVER_TIME_ZONE } from '@/lib/utils';
import type { EvolutionMessage } from '@/actions/chat-actions';
import type { MediaType } from './attachment-menu';
import type { MediaData, MessageDeliveryState, UIBubble } from './chat-message-types';

/* ─── Formatters ─── */
export const CHAT_TIME_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: SERVER_TIME_ZONE,
});

const CHAT_DAY_KEY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: SERVER_TIME_ZONE,
});

const CHAT_DATE_BADGE_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: SERVER_TIME_ZONE,
});

/* ─── Helpers ─── */
export function two(n: number) {
  return n.toString().padStart(2, '0');
}

export function formatSecs(s: number) {
  return `${two(Math.floor(s / 60))}:${two(s % 60)}`;
}

export function initialFromName(name?: string) {
  const c = (name || '').trim().charAt(0);
  return c ? c.toUpperCase() : 'U';
}

export function getCalendarDayKey(timestamp?: number): string {
  if (!timestamp) return '';
  const parts = CHAT_DAY_KEY_FORMATTER.formatToParts(new Date(timestamp));
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
}

export function formatConversationDateLabel(timestamp?: number): string {
  if (!timestamp) return '';
  const formatted = CHAT_DATE_BADGE_FORMATTER.format(new Date(timestamp));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function base64FromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Error leyendo blob'));
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const commaIndex = dataUrl.indexOf(',');
      if (commaIndex === -1) return reject(new Error('Formato de Data URL inválido.'));
      resolve(dataUrl.substring(commaIndex + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export function extractMediaInfo(msg: any, type: MediaType): MediaData | null {
  const typeKey = `${type}Message`;
  const mediaObj = msg?.[typeKey] || {};
  const url = msg?.mediaUrl || mediaObj.mediaUrl || mediaObj.url || mediaObj.directPath;
  const mimeType = mediaObj.mimetype || 'application/octet-stream';
  const caption = mediaObj.caption;
  if (url) return { type, url, mimeType, caption: caption || undefined };
  return null;
}

export function resolveEvolutionMessageStatus(message: EvolutionMessage): string {
  const updates = Array.isArray(message.MessageUpdate) ? message.MessageUpdate : [];

  for (let i = updates.length - 1; i >= 0; i--) {
    const candidate = updates[i];
    const status =
      candidate?.status ||
      candidate?.messageStatus ||
      candidate?.update?.status ||
      candidate?.update?.messageStatus;

    if (typeof status === 'string' && status.trim()) {
      return status.trim();
    }
  }

  return message.status?.trim() || '';
}

export function normalizeDeliveryState(status?: string): MessageDeliveryState {
  const s = status?.trim().toUpperCase();

  if (!s || s === 'PENDING' || s === 'SENT') return 'sent';

  if (s === 'SERVER_ACK' || s === 'DELIVERY_ACK' || s === 'DELIVERED' || s === 'DEVICE_ACK') return 'delivered';

  if (s === 'READ' || s === 'READ_ACK' || s === 'PLAYED' || s === 'PLAYED_ACK') return 'read';

  if (s === 'ERROR' || s === 'FAILED' || s === 'FAIL') return 'failed';

  return 'sent';
}

/** Convierte EvolutionMessage[] → UIBubble[] inyectando base64 del caché si existe */
export function toUIMessages(
  messages: EvolutionMessage[],
  avatarUrl: string | undefined,
  base64Map: Map<string, { dataUrl: string; mime: string; length: number }>,
): UIBubble[] {
  return messages.map((m) => {
    const isUser = m.key?.fromMe === true;
    const sender: 'user' | 'other' = isUser ? 'user' : 'other';
    const ts = m.messageTimestamp;
    let content = '';
    let media: MediaData | null = null;
    let kind: UIBubble['kind'];
    const messageData = (m.message || {}) as any;

    switch (m.messageType) {
      case 'conversation':
        content = messageData?.conversation || '';
        break;
      case 'extendedTextMessage':
        content = messageData?.extendedTextMessage?.text || '';
        break;
      case 'imageMessage':
        media = extractMediaInfo(messageData, 'image');
        content = media?.caption || '';
        break;
      case 'videoMessage':
        media = extractMediaInfo(messageData, 'video');
        content = media?.caption || '';
        break;
      case 'audioMessage':
        media = extractMediaInfo(messageData, 'audio');
        content = '';
        break;
      case 'documentMessage':
        media = extractMediaInfo(messageData, 'document');
        content = media?.caption || '';
        break;
      case 'stickerMessage': {
        const s = messageData.stickerMessage || {};
        const url = messageData.mediaUrl || s.mediaUrl || s.url || s.directPath;
        if (url) media = { type: 'image', url, mimeType: s.mimetype || 'image/webp' };
        kind = 'sticker';
        break;
      }
      case 'reactionMessage':
        content = messageData.reactionMessage?.text || '';
        kind = 'reaction';
        break;
      default:
        content = `[Mensaje ${m.messageType || 'desconocido'}]`;
    }

    // Inyección de base64 desde caché
    const msgId = m.key?.id || m.id;
    if (msgId && base64Map.has(msgId) && media) {
      const cached = base64Map.get(msgId)!;
      media = { ...media, url: cached.dataUrl, mimeType: cached.mime };
    }

    return {
      id: m.id || (ts ? String(ts) : '') + (m.key?.id || Math.random().toString(36).slice(2)),
      sender,
      content,
      avatarSrc: sender === 'user' ? '/default.png' : avatarUrl,
      ts: ts ? ts * 1000 : undefined,
      media: media || undefined,
      status: isUser ? normalizeDeliveryState(resolveEvolutionMessageStatus(m)) : undefined,
      kind,
    };
  });
}

// Re-export cn for convenience in chat components
export { cn };
