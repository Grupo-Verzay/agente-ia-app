import { type LucideIcon } from "lucide-react";
import { buildWhatsAppJidCandidates, extractWhatsAppDigits } from "@/lib/whatsapp-jid";
import { puedeVerTelefonoCompleto, telefonoParaMostrar } from "@/lib/telefono-visible";
import { avatarSrcFor } from "@/lib/avatar";
import { esSobreInternoDeWhatsapp } from "@/lib/whatsapp-message-kinds";
import { epochToMs } from "@/lib/epoch";
import type { ChatData } from "@/actions/chat-actions";
import type { ChatConversationPreference } from "@/types/chat";

export { epochToMs };

// Sin timeZone fijo: usa la zona horaria LOCAL del navegador de cada usuario
// (México, R. Dominicana, etc.), no la de Colombia.
export const CHAT_TIME_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});


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

/**
 * Todas las formas conocidas de nombrar al contacto de un chat.
 *
 * Cachea por el propio objeto del chat. La misma conversacion pasa por aqui
 * varias veces en cada refresco -al deduplicar la lista, al fusionarla con la
 * anterior y al armar cada fila-, y cada llamada montaba un `Set` y pasaba
 * varias expresiones regulares. Con miles de chats eso se notaba. El objeto no
 * cambia nunca, asi que la respuesta tampoco; cuando llega uno nuevo, el mapa es
 * debil y el anterior se recoge solo.
 */
const IDENTIDADES_POR_CHAT = new WeakMap<ChatData, string[]>();

export function getChatIdentityCandidates(chat: ChatData): string[] {
  const guardado = IDENTIDADES_POR_CHAT.get(chat);
  if (guardado) return guardado;

  const candidatos = buildWhatsAppJidCandidates(chat.remoteJid, [
    chat.remoteJidAlt,
    chat.senderPn,
    ...(chat.aliases ?? []),
    chat.lastMessage?.key?.remoteJid,
    chat.lastMessage?.key?.remoteJidAlt,
    chat.lastMessage?.key?.senderPn,
    chat.lastMessage?.senderPn,
  ]);

  IDENTIDADES_POR_CHAT.set(chat, candidatos);
  return candidatos;
}

/**
 * ¿Sigue eliminada esta conversación?
 *
 * Eliminada se queda, PERO vuelve sola si el contacto escribe despues de que la
 * borraran: un mensaje nuevo es una conversacion nueva, y no tiene sentido que
 * el cliente escriba y nadie lo vea.
 *
 * Esto ya existio y se quito, y conviene saber por que para no repetirlo: antes
 * revivia con solo recargar la pagina, sin que el contacto hubiera escrito. La
 * comparacion es la parte delicada, y aqui se hace con las dos partes en la
 * MISMA unidad —`deletedAt` es una fecha ISO en milisegundos y
 * `messageTimestamp` llega unas veces en segundos y otras en milisegundos— y
 * mirando SOLO la marca del ultimo mensaje. No vale `updatedAt` del chat:
 * WhatsApp la mueve por cualquier cosa, no solo por un mensaje nuevo, y eso es
 * lo que hacia que reviviera sola.
 *
 * Estrictamente posterior: un mensaje del mismo instante del borrado es el que
 * ya estaba, no uno nuevo.
 */
export function isChatDeletedByPreference(
  chat: Pick<ChatData, "lastMessage">,
  preference?: ChatConversationPreference,
): boolean {
  if (!preference?.deletedAt) return false;

  const borradoMs = new Date(preference.deletedAt).getTime();
  if (!Number.isFinite(borradoMs)) return true;

  const ultimoMensajeMs = epochToMs(chat.lastMessage?.messageTimestamp);
  return !(ultimoMensajeMs > borradoMs);
}

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
/**
 * Lo ya formateado, para no volver a formatearlo.
 *
 * Esto se llama una vez por chat cada vez que se reconstruye la lista, y con
 * miles de chats era de lo mas caro de la pasada: dos `Date` y un
 * `Intl.DateTimeFormat` por fila, y formatear con `Intl` no es barato. La marca
 * de un chat no cambia mientras no llegue otro mensaje, asi que la segunda vez
 * ya esta hecha.
 *
 * Se vacia al cambiar el dia, porque lo de hoy pasa a leerse "Ayer" y lo de
 * "Ayer" pasa a decir el nombre del dia. `finDeHoy` es el inicio del dia
 * siguiente y no una suma de 24 horas, que en los cambios de hora no son 24.
 */
const HORAS_FORMATEADAS = new Map<number, string>();
let inicioDeHoy = 0;
let finDeHoy = 0;

export function formatTimeFromEpoch(epoch?: number): string {
  const ms = epochToMs(epoch);
  if (!ms) return "";

  const ahora = Date.now();
  if (ahora >= finDeHoy || ahora < inicioDeHoy) {
    inicioDeHoy = inicioDelDia(new Date(ahora));
    finDeHoy = inicioDelDia(new Date(ahora + 86_400_000));
    HORAS_FORMATEADAS.clear();
  }

  const guardado = HORAS_FORMATEADAS.get(ms);
  if (guardado !== undefined) return guardado;

  const fecha = new Date(ms);
  const dias = Math.round((inicioDeHoy - inicioDelDia(fecha)) / 86_400_000);

  let texto: string;
  if (dias <= 0) {
    texto = CHAT_TIME_FORMATTER.format(fecha);
  } else if (dias === 1) {
    texto = "Ayer";
  } else if (dias < 7) {
    // El nombre completo: "Mar" se confundía con el mes de marzo.
    const dia = DIA_DE_LA_SEMANA.format(fecha);
    texto = dia.charAt(0).toUpperCase() + dia.slice(1);
  } else {
    texto = FECHA_CORTA.format(fecha);
  }

  // Tope por si esto acaba corriendo en el servidor, donde el proceso vive
  // mucho mas que una pestana: se vacia y se vuelve a llenar, que sigue saliendo
  // a cuenta.
  if (HORAS_FORMATEADAS.size > 50_000) HORAS_FORMATEADAS.clear();
  HORAS_FORMATEADAS.set(ms, texto);
  return texto;
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

export function nameFrom(chat: ChatData, advisorRole?: string | null): string {
  const name = chat.pushName?.trim();
  if (name && !isBadContactName(name)) return name;

  const jid = chat.remoteJid || "";
  // Sin nombre real: mostrar el número limpio (+57 300 123 4567) en vez del JID.
  //
  // Este es el sitio por donde MAS numeros ve un agente: toda conversacion sin
  // nombre guardado se lista por su numero. Por eso va tapado para quien no
  // deba verlos, igual que en el resto de la pantalla.
  const phone = telefonoParaMostrar(jid, advisorRole);
  if (phone) return phone;

  // Los digitos crudos son el mismo numero sin formato, asi que tambien se
  // esconden: dejarlos aqui haria inutil todo lo anterior.
  const digits = extractWhatsAppDigits(jid);
  if (digits) {
    return puedeVerTelefonoCompleto(advisorRole) ? digits : "Sin nombre";
  }

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

/**
 * Tipos cuyo texto NO se toma de `message.conversation`: llevan su propia
 * etiqueta ("Imagen", "Nota de voz"...).
 *
 * Estaba DENTRO de `lastTextFrom`, asi que se construia un `Set` de dieciseis
 * cadenas por cada chat de la lista. Con miles de chats eran miles de `Set`
 * identicos creados y tirados en cada reconstruccion, para consultarlos una vez
 * cada uno. No depende de nada: se hace una sola vez.
 */
const TIPOS_CON_ETIQUETA_PROPIA = new Set([
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
  } else if (esSobreInternoDeWhatsapp(type)) {
    // Un sobre interno (la edición de un mensaje) no es el "último mensaje" de
    // nadie: sin texto, en vez del nombre crudo del tipo. Los nuevos ya no se
    // guardan; esto cubre los que quedaron de antes.
    text = "";
  } else if (msg.conversation && !TIPOS_CON_ETIQUETA_PROPIA.has(type ?? "")) {
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
