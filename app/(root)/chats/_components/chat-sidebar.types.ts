import type { ChatContactSessionMap } from "@/types/session";
import type { MessageDeliveryState } from "./chat-message-types";

export type SidebarContact = {
  id: string;
  chatSession: ChatContactSessionMap[string] | null;
  isArchived: boolean;
  /** Bloqueada: fuera de toda pestaña menos «Bloqueados», hasta que alguien la desbloquee. */
  isBlocked?: boolean;
  /** Silenciada: se ve igual, pero no suena ni avisa. */
  isMuted?: boolean;
  isDeleted: boolean;
  // Eliminado y ya sin rastro: sigue oculto, pero no se lista en Eliminados.
  isPurged: boolean;
  isGroup: boolean;
  isPinned: boolean;
  isUnreadLocal: boolean;
  lastMessage: string;
  /**
   * La vista previa es la ÚLTIMA NOTA INTERNA y no un mensaje: la nota es lo
   * último que pasó en la conversación (`lib/nota-en-la-vista-previa.ts`).
   */
  vistaPreviaEsNota?: boolean;
  lastMessageId: string;
  messageType?: string;
  /** Palomita del ultimo mensaje cuando lo mando la linea; null si lo mando el contacto. */
  estadoDelUltimo?: MessageDeliveryState | null;
  name: string;
  avatarSrc: string;
  pinnedAtMs: number;
  timestamp: string;
  ts: number;
  /**
   * Cuándo se inició la conversación, en ms. Para el filtro por rango de fechas
   * (campo por defecto). Cae a la última actividad (`ts`) si la fila no trae
   * `startedAt`.
   */
  inicio: number;
  instanceName?: string;
  instanceDisplayName?: string;
  hasNotes?: boolean;
  /**
   * TODAS las identidades del contacto (`getChatIdentityCandidates`). Con ellas
   * se busca su sentimiento: el análisis lo guarda bajo las del mensaje y la
   * fila puede venir por otra. Buscando solo por `id`, un contacto abierto por
   * su `@lid` y analizado por su número se quedaba sin color.
   */
  identidades?: string[];
};

// Sin "deleted": un chat eliminado no se ve en ninguna parte (ver `isDeleted`).
export type TabKey = "all" | "mine" | "dm" | "groups" | "archived" | "resolved" | "blocked" | "muted";

export type TabCounts = Record<TabKey, number>;

export type TabConfig = {
  key: TabKey;
  label: string;
  color: string;
  count: number;
};
