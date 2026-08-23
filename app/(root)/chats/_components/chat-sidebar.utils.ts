import { type LucideIcon } from "lucide-react";
import { extractWhatsAppDigits, fmtPhone } from "@/lib/whatsapp-jid";
import { avatarSrcFor } from "@/lib/avatar";
import { esSobreInternoDeWhatsapp } from "@/lib/whatsapp-message-kinds";
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

const DIA_DE_LA_SEMANA = new Intl.DateTimeFormat("es", { weekday: "long" });
const FECHA_CORTA = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});
export const FECHA_COMPLETA = new Intl.DateTimeFormat("es", {
  dateStyle: "full",
  timeStyle: "short",
});

/** Medianoche de ese día, para comparar días y no horas. */
function inicioDelDia(fecha: Date): number {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();
}

/**
 * La marca de tiempo de la lista de chats.
 *
 * Antes siempre era la hora, así que un mensaje de hace tres semanas se leía
 * "04:55 p. m." y no había forma de saber de cuándo era. Ahora la hora se
 * reserva para hoy y el resto dice el día, como en WhatsApp: "Ayer", el nombre
 * del día dentro de la semana, y la fecha en adelante.
 */
export function formatTimeFromEpoch(epoch?: number): string {
  const ms = epochToMs(epoch);
  if (!ms) return "";

  const fecha = new Date(ms);
  const dias = Math.round((inicioDelDia(new Date()) - inicioDelDia(fecha)) / 86_400_000);

  if (dias <= 0) return CHAT_TIME_FORMATTER.format(fecha);
  if (dias === 1) return "Ayer";
  if (dias < 7) {
    // El nombre completo: "Mar" se confundía con el mes de marzo.
    const dia = DIA_DE_LA_SEMANA.format(fecha);
    return dia.charAt(0).toUpperCase() + dia.slice(1);
  }
  return FECHA_CORTA.format(fecha);
}

const BAD_NAMES = new Set(['você', 'voce', 'desconocido', '.', '']);

export function isBadContactName(name?: string | null): boolean {
  if (!name) return true;

  const limpio = name.trim();
  if (BAD_NAMES.has(limpio.toLowerCase())) return true;

  // Una ristra de dígitos no es un nombre. Cuando WhatsApp no da el nombre del
  // contacto, lo que queda guardado es su identificador interno —los quince
  // dígitos de un `@lid`— y se mostraba tal cual en la cabecera del chat, en la
  // lista y en Contactos. Sin nombre es preferible el número, que al menos se
  // reconoce.
  //
  // El mínimo de seis evita descartar apodos numéricos cortos.
  return /^\d{6,}$/.test(limpio);
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
    case "lottieStickerMessage":
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
  const normalized = value.toLowerCase();
  if (normalized === "[lottiestickermessage]" || normalized === "lottiestickermessage" || normalized === "[mensaje lottiestickermessage]") {
    return labels["sticker"] ?? "Sticker";
  }
  return labels[normalized] ?? value;
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
    "lottieStickerMessage",
    "reactionMessage",
    "interactiveResponseMessage",
    "meta_call",
    "call",
    "templateMessage",
    "template",
    "contactMessage",
    "contactsArrayMessage",
  ]);
  let text = "";

  if (!msg) {
    text = "";
  } else if (esSobreInternoDeWhatsapp(type)) {
    // Un sobre interno (la edición de un mensaje) no es el "último mensaje" de
    // nadie: sin texto, en vez del nombre crudo del tipo. Los nuevos ya no se
    // guardan; esto cubre los que quedaron de antes.
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
      // En la lista solo cabe una línea, así que aquí va el NOMBRE del contacto y
      // no su teléfono: es lo que permite reconocer la conversación de un vistazo.
      // El número completo está en la burbuja, al abrir el chat.
      case "contactMessage":
      case "contactsArrayMessage": {
        const contactos = (msg as Record<string, any>)?.contactsArrayMessage?.contacts;
        const nombre =
          (msg as Record<string, any>)?.contactMessage?.displayName ??
          contactos?.[0]?.displayName;
        const extra = Array.isArray(contactos) && contactos.length > 1
          ? ` y ${contactos.length - 1} más`
          : "";
        text = nombre ? `👤 ${String(nombre).trim()}${extra}` : "👤 Contacto";
        break;
      }
      case "stickerMessage":
      case "lottieStickerMessage":
        text = "🏷️ Sticker";
        break;
      case "protocolMessage":
        text = "Mensaje eliminado";
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
      // Las plantillas salían como "[Mensaje templateMessage]" también aquí. En
      // una línea solo cabe el arranque del texto, que es lo que permite
      // reconocer cuál se mandó sin abrir el chat.
      case "templateMessage":
      case "template": {
        // El texto de la plantilla vive a distinta profundidad segun por donde
        // entre el mensaje, asi que se busca por nombre en vez de por ruta fija.
        const buscar = (obj: any, nombres: string[], nivel = 0): string => {
          if (!obj || typeof obj !== "object" || nivel > 6) return "";
          for (const n of nombres) {
            const v = obj[n];
            if (typeof v === "string" && v.trim()) return v.trim();
          }
          for (const v of Object.values(obj)) {
            if (v && typeof v === "object") {
              const hallado = buscar(v, nombres, nivel + 1);
              if (hallado) return hallado;
            }
          }
          return "";
        };
        // Las plantillas nuevas no usan los campos `hydrated…`: traen el texto en
        // `interactiveMessageTemplate.body.text`, un nivel mas adentro y con
        // otro nombre. Sin mirar ahi, la lista mostraba solo "Plantilla".
        const buscarSeccion = (obj: any, seccion: string, nivel = 0): string => {
          if (!obj || typeof obj !== "object" || nivel > 6) return "";
          const directo = obj[seccion];
          if (typeof directo === "string" && directo.trim()) return directo.trim();
          if (directo && typeof directo === "object") {
            const texto = directo.text ?? directo.title;
            if (typeof texto === "string" && texto.trim()) return texto.trim();
          }
          for (const v of Object.values(obj)) {
            if (v && typeof v === "object") {
              const hallado = buscarSeccion(v, seccion, nivel + 1);
              if (hallado) return hallado;
            }
          }
          return "";
        };
        const plantilla = (msg as Record<string, any>)?.templateMessage ?? msg ?? {};
        const cuerpo =
          buscar(plantilla, ["hydratedContentText", "hydratedTitleText", "hydratedContent"]) ||
          buscarSeccion(plantilla, "body") ||
          buscarSeccion(plantilla, "header") ||
          String(msg?.conversation ?? "").trim();
        text = cuerpo ? `📋 ${cuerpo}` : "📋 Plantilla";
        break;
      }
      case "templateButtonReplyMessage": {
        const r = (msg as Record<string, any>)?.templateButtonReplyMessage ?? {};
        const elegido = String(r?.selectedDisplayText ?? r?.selectedId ?? "").trim();
        text = elegido ? `↩️ ${elegido}` : "↩️ Respuesta";
        break;
      }
      // Los mensajes con botones o lista salían como "[interactiveMessage]".
      // En una línea cabe el arranque del texto, que es lo que permite saber de
      // qué iba sin abrir el chat.
      case "interactiveMessage":
      case "buttonsMessage":
      case "listMessage":
      case "buttonsResponseMessage":
      case "listResponseMessage": {
        const m = msg as Record<string, any>;
        const cuerpo = String(
          m?.interactiveMessage?.body?.text ??
          m?.interactiveMessage?.header?.title ??
          m?.buttonsMessage?.contentText ??
          m?.buttonsMessage?.headerText ??
          m?.listMessage?.description ??
          m?.listMessage?.title ??
          m?.buttonsResponseMessage?.selectedDisplayText ??
          m?.listResponseMessage?.title ??
          "",
        ).trim();
        text = cuerpo ? `🔘 ${cuerpo}` : "🔘 Mensaje con botones";
        break;
      }
      // Las llamadas del CRM ("Llamada realizada", "Videollamada realizada",
      // "Llamada con IA realizada") salían sin icono, como si fueran texto
      // suelto, mientras una nota de voz o una imagen sí lo llevaban.
      case "call": {
        const detalle = msg?.conversation?.trim();
        text = detalle ? `📞 ${detalle}` : "📞 Llamada";
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

  // Stub vacío: un mensaje de TEXTO que existe pero llega sin contenido es el
  // caso típico de un mensaje que el cliente eliminó y WhatsApp devuelve vacío.
  // Se muestra "Mensaje eliminado" en la vista previa de la lista, igual que ya
  // se ve dentro del chat. Acotado a tipos de texto para no tocar imágenes,
  // audios, encuestas, etc. (que tienen su propia vista previa).
  const isTextType = !type || type === "conversation" || type === "extendedTextMessage";
  if (msg && isTextType && !msg.conversation && !msg.extendedTextMessage?.text) {
    text = "Mensaje eliminado";
  }

  return { text, messageType: type, id, fromMe };
}
