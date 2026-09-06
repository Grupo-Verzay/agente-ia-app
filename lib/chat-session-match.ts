import {
  normalizeWhatsAppConversationJid,
  pickExplicitWhatsAppPhoneJid,
  pickPreferredWhatsAppRemoteJid,
} from "@/lib/whatsapp-jid";
import type { ChatContactSessionMap, ChatContactSessionSummary } from "@/types/session";

/**
 * Emparejar los chats de la bandeja con las sesiones de la cuenta.
 *
 * Esto vivia en el servidor (`getChatContactSessions`): el navegador subia la
 * agenda ENTERA cada minuto -3.900 chats, 500 KB- para que el servidor la
 * validara fila a fila, armara ~10.000 identidades y las buscara con consultas
 * de miles de parametros. Medido en produccion: 1,3 s en un buen momento, 11,
 * 13 y 25 s cuando la base estaba ocupada, y en esos ratos la consulta de
 * mensajes del chat abierto tambien se pasaba de su plazo. Era la misma cola.
 *
 * Ahora el servidor devuelve las sesiones de la cuenta -una consulta por
 * `userId`, con indice- y el emparejamiento se hace aqui, que es puro: solo
 * compara cadenas. Es el mismo criterio de siempre, movido de sitio; los
 * empates se deshacen igual (preferida > alterna > pedida > candidata; luego
 * nombre bueno; luego la mas reciente).
 */
export type ChatParaEmparejar = {
  /** Tal cual viene en la fila. Es la llave con la que la pantalla pregunta. */
  remoteJid: string;
  instanceName?: string | null;
  /** Forma "canonica" del contacto (numero@s.whatsapp.net si se conoce). */
  preferredRemoteJid: string;
  /** TODAS las formas conocidas del contacto. Ver `getChatIdentityCandidates`. */
  candidates: string[];
};

export function resolvePreferredRemoteJid(values: Array<string | null | undefined>) {
  return (
    pickExplicitWhatsAppPhoneJid(values) ||
    pickPreferredWhatsAppRemoteJid(values) ||
    normalizeWhatsAppConversationJid(values.find((value) => value?.trim()) ?? "") ||
    values.find((value) => value?.trim())?.trim() ||
    ""
  );
}

export function scoreSessionMatch(
  session: { remoteJid: string; remoteJidAlt?: string | null },
  requestedRemoteJid: string,
  preferredRemoteJid: string,
  candidates: string[],
) {
  if (session.remoteJid === preferredRemoteJid) return 0;
  if (session.remoteJidAlt === preferredRemoteJid) return 1;
  if (session.remoteJid === requestedRemoteJid) return 2;
  if (session.remoteJidAlt === requestedRemoteJid) return 3;
  if (candidates.includes(session.remoteJid)) return 4;
  if (session.remoteJidAlt && candidates.includes(session.remoteJidAlt)) return 5;
  return 99;
}

function tieneNombreBueno(s: ChatContactSessionSummary) {
  const n = (s.customName ?? s.pushName ?? "").toLowerCase().trim();
  return n !== "" && n !== "você" && n !== "voce" && n !== "desconocido" && n !== ".";
}

/** Sesiones indexadas por cada una de sus identidades, para buscar en O(1). */
export function indexarSesionesPorIdentidad(sesiones: ChatContactSessionSummary[]) {
  const porIdentidad = new Map<string, ChatContactSessionSummary[]>();
  for (const sesion of sesiones) {
    for (const identidad of [sesion.remoteJid, sesion.remoteJidAlt]) {
      if (!identidad) continue;
      const lista = porIdentidad.get(identidad);
      if (lista) lista.push(sesion);
      else porIdentidad.set(identidad, [sesion]);
    }
  }
  return porIdentidad;
}

export function emparejarSesionesConChats(
  chats: ChatParaEmparejar[],
  sesiones: ChatContactSessionSummary[],
): ChatContactSessionMap {
  const porIdentidad = indexarSesionesPorIdentidad(sesiones);
  const data: ChatContactSessionMap = {};

  for (const chat of chats) {
    const encontradas = new Map<number, ChatContactSessionSummary>();
    for (const candidata of chat.candidates) {
      for (const sesion of porIdentidad.get(candidata) ?? []) {
        encontradas.set(sesion.id, sesion);
      }
    }
    if (encontradas.size === 0) continue;

    const ordenadas = Array.from(encontradas.values()).sort((a, b) => {
      const aScore = scoreSessionMatch(a, chat.remoteJid, chat.preferredRemoteJid, chat.candidates);
      const bScore = scoreSessionMatch(b, chat.remoteJid, chat.preferredRemoteJid, chat.candidates);
      if (aScore !== bScore) return aScore - bScore;
      const aNombre = tieneNombreBueno(a) ? 0 : 1;
      const bNombre = tieneNombreBueno(b) ? 0 : 1;
      if (aNombre !== bNombre) return aNombre - bNombre;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });

    // "La sesion global" del contacto: para quien no distingue linea.
    data[chat.remoteJid] = ordenadas[0];

    // Y la de SU linea, si se conoce. Se calcula SIEMPRE que hay linea, no solo
    // cuando hay mas de una sesion, porque el caso a blindar es el contrario:
    // un contacto SIN sesion en esta linea no debe heredar en silencio la de
    // otra (verse "asignado" o con etiquetas que aqui no le pusieron). Si no
    // hay sesion para esta linea, no se escribe nada bajo la llave compuesta:
    // `getSessionForChat` no cae de vuelta a la global cuando ya sabe la linea.
    if (chat.instanceName) {
      const deSuLinea = ordenadas.find((s) => s.instanceId === chat.instanceName);
      if (deSuLinea) data[`${chat.instanceName}::${chat.remoteJid}`] = deSuLinea;
    }
  }

  return data;
}
