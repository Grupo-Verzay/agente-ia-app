import type { MediaType } from './attachment-menu';

/* ─── Outgoing payload types ─── */
export type OutgoingTextPayload = {
  kind: 'text';
  text: string;
  delay?: number;
  linkPreview?: boolean;
  mentionsEveryOne?: boolean;
  mentioned?: string[];
  quotedMessage?: { key: { id: string }; message: { conversation: string } };
};

export type OutgoingMediaPayload = {
  kind: 'media';
  mediatype: MediaType;
  /** Base64 puro (audio) o Data URL (adjuntos) */
  mediaUrl: string;
  mimetype?: string;
  fileName?: string;
  caption?: string;
  ptt?: boolean;
  delay?: number;
  linkPreview?: boolean;
  mentionsEveryOne?: boolean;
  mentioned?: string[];
  quotedMessage?: { key: { id: string }; message: { conversation: string } };
};

export type OutgoingMessagePayload = OutgoingTextPayload | OutgoingMediaPayload;

/* ─── UI types ─── */
export type ChatHeader = {
  name: string;
  avatarSrc?: string;
  status?: string;
  isPinned?: boolean;
};

export type ChatInfoMeta = {
  total?: number;
  pages?: number;
  currentPage?: number;
  nextPage?: number | null;
  instanceName?: string;
  remoteJid?: string;
  remoteJidAliases?: string[];
  apiKeyData?: { url: string; key: string };
};

export type MediaData = {
  type: MediaType;
  url: string;
  mimeType: string;
  caption?: string;
};

export type MessageDeliveryState = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type UIBubble = {
  id: string;
  sender: 'user' | 'other';
  content: string;
  avatarSrc?: string;
  ts?: number;
  media?: MediaData;
  status?: MessageDeliveryState;
  kind?: 'sticker' | 'reaction';
};

export type RecordedAudioData = {
  /** Base64 puro sin prefijo */
  base64Pure: string;
  /** Data URL completa para el reproductor de audio */
  dataUrlWithPrefix: string;
  mimetype: string;
  durationSecs: number;
};
