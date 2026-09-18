import type { MediaType } from './attachment-menu';

/* ─── Outgoing payload types ─── */
export type OutgoingTextPayload = {
  kind: 'text';
  text: string;
  delay?: number;
  linkPreview?: boolean;
  mentionsEveryOne?: boolean;
  mentioned?: string[];
  quotedMessage?: { key: { id: string; fromMe?: boolean; remoteJid?: string }; message: { conversation: string } };
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
  quotedMessage?: { key: { id: string; fromMe?: boolean; remoteJid?: string }; message: { conversation: string } };
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
  contactName?: string;
};

export type MediaData = {
  type: MediaType;
  url: string;
  mimeType: string;
  caption?: string;
  /** Nombre del archivo tal y como lo mandó el contacto. Es lo que se rotula. */
  fileName?: string;
};

/**
 * Lo lejos que llegó un mensaje NUESTRO.
 *
 * `played` es el tercer estado de una nota de voz: el contacto no solo la
 * recibió y abrió el chat, la ESCUCHÓ. WhatsApp lo enseña en el micrófono, no
 * en las palomitas, porque escuchada implica leída.
 *
 * OJO al añadir un valor aquí: quien compare contra uno concreto y no lo
 * contemple se cae a su rama por defecto sin dar error. Los dos sitios que
 * pintan esto son `MessageStatusIndicator` (la burbuja) y `PalomitaDeLaFila`
 * (la fila de la lista), y los dos tratan `played` como `read`.
 */
export type MessageDeliveryState = 'sending' | 'sent' | 'delivered' | 'read' | 'played' | 'failed';

export type UIBubble = {
  id: string;
  sender: 'user' | 'other';
  content: string;
  avatarSrc?: string;
  ts?: number;
  media?: MediaData;
  status?: MessageDeliveryState;
  kind?: 'sticker' | 'reaction' | 'call';
  /** Info de llamada (cuando kind === 'call') */
  call?: { direction: 'incoming' | 'outgoing'; isVideo?: boolean; durationSecs?: number; status?: string };
  /** Emoji de reacción pegado a este mensaje (estilo WhatsApp) */
  reaction?: string;
  /** El texto de una nota de voz, transcrito. Va debajo del audio, no en su lugar. */
  transcripcion?: string;
  /** Por qué esa nota no tiene texto, cuando hay algo que contar. */
  transcripcionMotivo?: 'muy_larga' | 'fallo';
  quotedMessage?: {
    id: string;
    content: string;
    sender: 'user' | 'other';
    mediaType?: string;
    /** Quién lo escribió, cuando no basta con «el contacto»: un grupo. */
    author?: string;
  };
  adPreview?: {
    title?: string;
    body?: string;
    sourceUrl?: string;
    thumbnailUrl?: string;
  };
  /**
   * Quién escribió, SOLO en chats de grupo. En un chat 1-a-1 el autor ya está en
   * la cabecera, así que ahí se deja vacío y la burbuja se ve como siempre.
   */
  groupSenderName?: string | null;
  groupSenderPhone?: string | null;
  sentByAi?: boolean;
  /**
   * La nota que la IA le deja al asesor al escalar la conversación.
   *
   * NO es un mensaje: no se le mandó a nadie, se escribió directamente en
   * nuestra base. La burbuja tiene que dejarlo claro de un vistazo, porque un
   * asesor que la confunda con un mensaje real creerá que el cliente leyó eso.
   */
  notaInterna?: boolean;
  /** El cliente eliminó este mensaje ("eliminar para todos"); se conserva con badge. */
  clientDeleted?: boolean;
  /** Alguien corrigió este mensaje desde la App; se pinta el badge «Editado». */
  editado?: boolean;
  // Nota interna
  isNote?: boolean;
  noteAuthorName?: string | null;
  noteAuthorEmail?: string;
  noteId?: number;
  noteMentionNames?: string[];
};

/**
 * Lo grabado por el microfono.
 *
 * **El tipo vive en `lib/audio-del-navegador`** desde que el chat del equipo
 * tambien graba notas de voz: uno solo, no dos que se separen. Se re-exporta
 * aqui para que nada de Chats tenga que cambiar de import.
 */
export type { RecordedAudioData } from "@/lib/audio-del-navegador";
