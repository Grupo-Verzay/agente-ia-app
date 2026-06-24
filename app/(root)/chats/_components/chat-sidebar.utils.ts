import {
  Image as ImageIcon,
  Video,
  Mic,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { extractWhatsAppDigits } from "@/lib/whatsapp-jid";
import { avatarSrcFor } from "@/lib/avatar";
import type { ChatData } from "@/actions/chat-actions";

export const CHAT_TIME_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "America/Bogota",
});

export function epochToMs(epoch?: number): number {
  if (!epoch) return 0;
  return epoch < 2_000_000_000 ? epoch * 1000 : epoch;
}

export function formatTimeFromEpoch(epoch?: number): string {
  const ms = epochToMs(epoch);
  if (!ms) return "";
  return CHAT_TIME_FORMATTER.format(new Date(ms));
}

const BAD_NAMES = new Set(['você', 'voce', 'desconocido', '.', '']);

export function isBadContactName(name?: string | null): boolean {
  return !name || BAD_NAMES.has(name.toLowerCase().trim());
}

export function nameFrom(chat: ChatData): string {
  const name = chat.pushName?.trim();
  if (name && !isBadContactName(name)) return name;

  const jid = chat.remoteJid || "";
  const digits = extractWhatsAppDigits(jid);
  if (digits) return digits;

  const base = jid.includes("@") ? jid.split("@")[0] : jid;
  return base || "Sin nombre";
}

export function avatarFrom(chat: ChatData): string {
  return avatarSrcFor(chat.profilePicUrl);
}

export function isGroupJid(jid: string): boolean {
  return jid?.includes("@g.us");
}

export function getIconForMessageType(type?: string): LucideIcon | null {
  if (!type) return null;

  switch (type) {
    case "conversation":
    case "extendedTextMessage":
      return null;
    case "imageMessage":
    case "stickerMessage":
      return ImageIcon;
    case "videoMessage":
      return Video;
    case "audioMessage":
      return Mic;
    case "documentMessage":
    case "fileMessage":
      return FileText;
    default:
      return null;
  }
}

export function lastTextFrom(chat: ChatData): {
  text: string;
  messageType?: string;
  id: string;
  fromMe: boolean;
} {
  const msg = chat.lastMessage?.message;
  const type = chat.lastMessage?.messageType;
  const id = chat.lastMessage?.key.id ?? "";
  const fromMe = chat.lastMessage?.key.fromMe ?? false;
  let text = "";

  if (!msg) {
    text = "";
  } else if (msg.conversation) {
    text = msg.conversation;
  } else {
    switch (type) {
      case "imageMessage":
        text = "Imagen";
        break;
      case "videoMessage":
        text = "Video";
        break;
      case "audioMessage":
        text = "Nota de voz";
        break;
      case "documentMessage":
      case "fileMessage":
        text = "Documento";
        break;
      case "locationMessage":
        text = "Ubicacion";
        break;
      case "stickerMessage":
        text = "Sticker";
        break;
      case "reactionMessage": {
        const emoji = msg?.reactionMessage?.text;
        text = emoji ? `Reaccionó: ${emoji}` : "Reaccion";
        break;
      }
      default:
        text = `[${type || "Mensaje desconocido"}]`;
        break;
    }
  }

  return { text, messageType: type, id, fromMe };
}
