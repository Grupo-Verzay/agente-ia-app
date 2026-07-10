import { type LucideIcon } from "lucide-react";
import { extractWhatsAppDigits, fmtPhone } from "@/lib/whatsapp-jid";
import { avatarSrcFor } from "@/lib/avatar";
import type { ChatData } from "@/actions/chat-actions";

// Sin timeZone fijo: usa la zona horaria LOCAL del navegador de cada usuario
// (México, R. Dominicana, etc.), no la de Colombia.
export const CHAT_TIME_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
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
  // Sin nombre real: mostrar el número limpio (+57 300 123 4567) en vez del JID.
  const phone = fmtPhone(jid);
  if (phone) return phone;

  const digits = extractWhatsAppDigits(jid);
  if (digits) return digits;

  const base = jid.includes("@") ? jid.split("@")[0] : jid;
  return base || "Sin nombre";
}

export function avatarFrom(chat: ChatData): string {
  return avatarSrcFor(chat.profilePicUrl, chat.remoteJid);
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
    case "videoMessage":
    case "audioMessage":
    case "documentMessage":
    case "fileMessage":
    case "locationMessage":
    case "reactionMessage":
    case "interactiveResponseMessage":
    case "meta_call":
      return null;
    default:
      return null;
  }
}

function normalizePreviewText(text: string): string {
  const value = text.trim();
  const labels: Record<string, string> = {
    "[imagen]": "🖼️ Imagen",
    "imagen": "🖼️ Imagen",
    "[video]": "🎥 Video",
    "video": "🎥 Video",
    "[audio]": "🎧 Audio",
    "audio": "🎧 Audio",
    "[nota de voz]": "🎙️ Nota de voz",
    "nota de voz": "🎙️ Nota de voz",
    "[documento]": "📄 Documento",
    "documento": "📄 Documento",
    "[sticker]": "🏷️ Sticker",
    "sticker": "🏷️ Sticker",
    "[media]": "📎 Archivo",
    "media": "📎 Archivo",
  };
  return labels[value.toLowerCase()] ?? value;
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
  const typedPreviewTypes = new Set([
    "imageMessage",
    "videoMessage",
    "audioMessage",
    "documentMessage",
    "fileMessage",
    "locationMessage",
    "stickerMessage",
    "reactionMessage",
    "interactiveResponseMessage",
    "meta_call",
  ]);
  let text = "";

  if (!msg) {
    text = "";
  } else if (msg.conversation && !typedPreviewTypes.has(type ?? "")) {
    text = normalizePreviewText(msg.conversation);
  } else {
    switch (type) {
      case "imageMessage":
        text = "🖼️ Imagen";
        break;
      case "videoMessage":
        text = "🎥 Video";
        break;
      case "audioMessage":
        text = msg?.audioMessage?.ptt === false ? "🎧 Audio" : "🎙️ Nota de voz";
        break;
      case "documentMessage":
      case "fileMessage":
        text = "📄 Documento";
        break;
      case "locationMessage":
        text = "📍 Ubicación";
        break;
      case "stickerMessage":
        text = "🏷️ Sticker";
        break;
      case "reactionMessage": {
        const emoji = msg?.reactionMessage?.text;
        text = emoji ? `👍 Reacción: ${emoji}` : "👍 Reacción";
        break;
      }
      case "interactiveResponseMessage": {
        const bodyText = msg?.interactiveResponseMessage?.body?.text;
        const flowName = msg?.interactiveResponseMessage?.nativeFlowResponseMessage?.name;
        if (flowName === "call_permission_request") {
          text = bodyText?.toLowerCase?.().includes("permitir")
            ? "📞 Permiso de llamada aprobado"
            : "📞 Permiso de llamada";
        } else {
          text = bodyText || "↩️ Respuesta";
        }
        break;
      }
      case "meta_call": {
        const metaCall = msg?.metaCall;
        const duration = Number(metaCall?.duration ?? 0) || 0;
        const direction = metaCall?.direction === "BUSINESS_INITIATED" ? "realizada" : "recibida";
        text = duration > 0 ? `📞 Llamada ${direction}` : "📞 Llamada";
        break;
      }
      default:
        text = `[${type || "Mensaje desconocido"}]`;
        break;
    }
  }

  return { text, messageType: type, id, fromMe };
}
