/**
 * Lo que la lista de Chats enseña bajo «Todos», y cuantas son por linea.
 *
 * El numero de «Todos» y la lista salian de dos sitios distintos y por eso no
 * cuadraban (Rca decia 32 y al marcar todas salian 16; un cliente con 14
 * conversaciones veia 34). El numero era un `COUNT` sobre `Session` —los LEADS
 * de la linea—, y la lista son las CONVERSACIONES que pasan por media docena de
 * filtros del navegador: repetidos por identidad y por el puente `@lid`, la
 * marca de borrado elegida por linea, archivadas, resueltas, y lo que un agente
 * no ve. Un lead sin conversacion, uno cuya marca estaba guardada bajo otra de
 * sus identidades, el mismo numero guardado en dos formas… contaban en uno y no
 * en la otra.
 *
 * Aqui esta la regla UNA vez, y la usan los tres que tienen que decir lo mismo:
 *
 *  - la barra lateral, para ordenar y quitar repetidos (`ordenDeLaLista`,
 *    `claveEnLaLista`);
 *  - el navegador, para el numero de cada linea con lo que tiene cargado;
 *  - el SERVIDOR, que pasa por aqui la bandeja ENTERA —sin el tope de la
 *    pagina— para el numero de las lineas que todavia no se han cargado del
 *    todo (`lib/conteo-de-todos.server.ts`).
 *
 * Es puro: sin red, sin estado y sin nada del navegador.
 */
import type { ChatData } from "@/actions/chat-actions";
import type { ChatConversationPreferenceMap } from "@/types/chat";
import { elegirPreferenciaDelChat } from "@/lib/chat-preference-key";
import { estaResuelta } from "@/lib/total-de-todos";
import { epochToMs } from "@/lib/epoch";
import {
  getChatIdentityCandidates,
  isChatDeletedByPreference,
  isGroupJid,
} from "./chat-sidebar.utils";
import { applyLidMappingToChats, type LidPhoneMap } from "./lid-mapping";

export function getChatSortTimestamp(chat: ChatData) {
  return (
    chat.lastMessage?.messageTimestamp ??
    (chat.updatedAt ? Math.floor(new Date(chat.updatedAt).getTime() / 1000) : 0)
  );
}

function getChatMessageDuplicateKey(chat: ChatData) {
  const messageId = chat.lastMessage?.key?.id || chat.lastMessage?.id;
  if (!messageId) return "";

  return [
    chat.instanceName ?? "",
    messageId,
    chat.lastMessage?.key?.fromMe ? "1" : "0",
    chat.lastMessage?.messageType ?? "",
  ].join(":");
}

/**
 * Quita los repetidos de la lista y la ordena. Es la puerta por la que entra
 * TODO lo que la lista enseña (la carga, el refresco, la pagina siguiente).
 *
 * Los chats 1-a-1 se deduplican POR LINEA: el mismo cliente que escribe a dos
 * numeros son DOS conversaciones. Solo los grupos se unifican entre lineas.
 */
export function dedupeAndSortChats(chats: ChatData[], lidMap?: LidPhoneMap) {
  const seenIdentities = new Set<string>();
  const seenMessages = new Set<string>();
  // Canonicaliza los @lid con numero conocido antes de deduplicar, para que se
  // fusionen con el contacto real de forma estable.
  return [...applyLidMappingToChats(chats, lidMap)]
    .sort((a, b) => getChatSortTimestamp(b) - getChatSortTimestamp(a))
    .filter((chat) => {
      if (!chat.remoteJid) return false;

      const isGroup = chat.remoteJid.endsWith("@g.us");
      const scope = isGroup ? "" : `${chat.instanceName ?? ""}::`;
      const identityCandidates = getChatIdentityCandidates(chat).map((c) => `${scope}${c}`);
      const messageKey = getChatMessageDuplicateKey(chat);
      if (
        identityCandidates.some((candidate) => seenIdentities.has(candidate)) ||
        (messageKey && seenMessages.has(messageKey))
      ) {
        return false;
      }

      for (const candidate of identityCandidates) seenIdentities.add(candidate);
      if (messageKey) seenMessages.add(messageKey);
      return true;
    });
}

/** Lo que la lista filtra antes de pintar nada. */
export function esFilaDeLaLista(chat: ChatData): boolean {
  return Boolean(chat.remoteJid) && chat.remoteJid !== "status@broadcast";
}

/** Lo que ordenar y quitar repetidos necesita de una fila ya armada. */
export type FilaOrdenable = {
  id: string;
  isGroup: boolean;
  instanceName?: string | null;
  isPinned: boolean;
  pinnedAtMs: number;
  ts: number;
};

/**
 * El orden de la barra lateral: ancladas arriba (la mas reciente primero) y el
 * resto por su ultimo mensaje.
 */
export function ordenDeLaLista(a: FilaOrdenable, b: FilaOrdenable): number {
  if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
  if (a.pinnedAtMs !== b.pinnedAtMs) return b.pinnedAtMs - a.pinnedAtMs;
  return b.ts - a.ts;
}

/**
 * Una fila por LINEA y numero; los grupos, una por grupo (es el mismo sitio se
 * entre por donde se entre).
 */
export function claveEnLaLista(fila: Pick<FilaOrdenable, "id" | "isGroup" | "instanceName">): string {
  return fila.isGroup ? fila.id : `${fila.instanceName ?? ""}::${fila.id}`;
}

/** Lo que la sesion de un chat aporta a la cuenta: si esta resuelta y de quien es. */
export type LoDeLaSesion = {
  resolvedAt?: number | null;
  assignedAdvisorId?: string | null;
} | null | undefined;

export type ContextoDeTodos = {
  preferencias: ChatConversationPreferenceMap;
  /** La cuenta dueña de la linea del chat (con la que se guardan sus marcas). */
  duenoDelChat: (chat: ChatData) => string;
  sesionDelChat: (chat: ChatData) => LoDeLaSesion;
  repartidasEntreLineas?: ReadonlySet<string>;
  /** Solo para un agente: ve lo suyo y, si puede tomar, lo sin asignar. */
  agente?: { advisorId: string; puedeTomarSinAsignar: boolean } | null;
};

/** Una fila de la lista, ya con su decision tomada. */
export type FilaDeTodos = FilaOrdenable & {
  clave: string;
  linea: string;
  borrada: boolean;
  archivada: boolean;
  resuelta: boolean;
  /** Sale bajo «Todos»: ni borrada, ni archivada, ni resuelta. */
  activa: boolean;
};

/**
 * Las filas de la lista, con la MISMA regla que la barra lateral.
 *
 * Recibe los chats tal cual los tiene la pantalla (ya pasados por
 * `dedupeAndSortChats`). Aplica el filtro del agente, arma cada fila, las
 * ordena como la barra y quita los repetidos por la misma llave.
 */
export function lasFilasDeLaLista(chats: ChatData[], ctx: ContextoDeTodos): FilaDeTodos[] {
  const filas: FilaDeTodos[] = [];
  for (const chat of chats) {
    if (!esFilaDeLaLista(chat)) continue;
    const sesion = ctx.sesionDelChat(chat) ?? null;
    if (ctx.agente) {
      const asignado = sesion?.assignedAdvisorId ?? null;
      const suyo = asignado === ctx.agente.advisorId;
      const libre = ctx.agente.puedeTomarSinAsignar && !asignado;
      if (!suyo && !libre) continue;
    }
    const preferencia = elegirPreferenciaDelChat(
      ctx.preferencias,
      ctx.duenoDelChat(chat),
      chat.instanceName,
      getChatIdentityCandidates(chat),
      ctx.repartidasEntreLineas,
    );
    const ts = epochToMs(chat.lastMessage?.messageTimestamp);
    const borrada = isChatDeletedByPreference(chat, preferencia);
    const archivada = Boolean(preferencia?.isArchived);
    const resuelta = estaResuelta(ts, sesion?.resolvedAt);
    const isGroup = isGroupJid(chat.remoteJid);
    const fila = {
      id: chat.remoteJid,
      isGroup,
      instanceName: chat.instanceName,
      isPinned: Boolean(preferencia?.isPinned),
      pinnedAtMs: preferencia?.pinnedAt ? new Date(preferencia.pinnedAt).getTime() : 0,
      ts,
    };
    filas.push({
      ...fila,
      clave: claveEnLaLista(fila),
      linea: chat.instanceName ?? "",
      borrada,
      archivada,
      resuelta,
      activa: !borrada && !archivada && !resuelta,
    });
  }

  filas.sort(ordenDeLaLista);
  const vistas = new Set<string>();
  return filas.filter((f) => {
    if (vistas.has(f.clave)) return false;
    vistas.add(f.clave);
    return true;
  });
}

/** Cuantas filas hay y cuantas salen bajo «Todos», por linea. */
export type ConteoDeLaLista = {
  /**
   * Las filas de la linea que la lista tiene: todas menos las borradas (una
   * borrada no esta en ninguna pestaña). Sirve para saber si la lista de esa
   * linea esta ENTERA: si el navegador ya tiene tantas como el servidor, el
   * numero se cuenta con lo cargado y no hay nada que suponer.
   */
  filas: Record<string, number>;
  /** Las que salen bajo «Todos». */
  todos: Record<string, number>;
};

export function contarLaLista(filas: FilaDeTodos[]): ConteoDeLaLista {
  const conteo: ConteoDeLaLista = { filas: {}, todos: {} };
  for (const f of filas) {
    if (!f.linea) continue;
    // Una linea con filas sale en `todos` aunque sea con cero: asi el menu de
    // canales la enseña con su 0 en vez de sin numero.
    conteo.todos[f.linea] = (conteo.todos[f.linea] ?? 0) + (f.activa ? 1 : 0);
    if (!f.borrada) conteo.filas[f.linea] = (conteo.filas[f.linea] ?? 0) + 1;
  }
  return conteo;
}

/**
 * La sesion de un chat, como la busca toda la pantalla: si se conoce su linea,
 * la de ESA linea y solo esa —un contacto sin sesion aqui no hereda la de
 * otra—; si no, la primera de sus identidades.
 */
export function laSesionDelChat<T>(
  chat: ChatData,
  sesiones: Record<string, T | undefined>,
): T | undefined {
  if (chat.instanceName) return sesiones[`${chat.instanceName}::${chat.remoteJid}`];
  return getChatIdentityCandidates(chat)
    .map((candidata) => sesiones[candidata])
    .find(Boolean);
}
