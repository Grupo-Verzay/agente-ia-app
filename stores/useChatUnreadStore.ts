import { create } from "zustand";

import { elNumeroDeChats } from "@/lib/insignia-del-favicon";

/**
 * Cuántos chats de clientes esperan respuesta.
 *
 * Lo leen la pastilla de «Chats» del menú, la campanita y el número de la
 * pestaña, y tiene **dos fuentes que no sobran ninguna**:
 *
 * - **La bandeja** (`chat-sidebar`), que es la única que conoce las marcas de
 *   leído de este navegador (`seenMessages`, en `localStorage`) y que va en
 *   vivo con el socket. Pero solo escribe mientras está montada: fuera de
 *   Chats no dice nada, y en frío no ha dicho nada todavía.
 * - **El servidor**, que llega en la vuelta de quince segundos que ya corre en
 *   todas las pantallas (`sinLeerDelEquipoAction`). Cuenta las conversaciones
 *   cuyo último mensaje es del contacto, pero no sabe qué se ha leído.
 *
 * Quién manda entre las dos lo decide `elNumeroDeChats`
 * (`lib/insignia-del-favicon.ts`), que es puro y está probado. Aquí solo se
 * guardan las dos, cada una con **su marca de hasta cuándo** — sin la hora no
 * hay forma de saber si la bandeja se quedó atrás, y entonces o el número no
 * baja nunca al leer o resucita cada quince segundos.
 */
interface ChatUnreadStore {
  /**
   * Lo último que dijo la bandeja. `null` significa **que no ha hablado**, que
   * no es lo mismo que cero: es el caso de quien abre la App en cualquier otra
   * pantalla, y es justo donde antes salía un cero fijo.
   */
  unreadCount: number | null;
  /** La hora del mensaje más nuevo que la bandeja llegó a juzgar. */
  hastaLaBandeja: number;
  /** Lo que cuenta el servidor. */
  delServidor: number;
  /** La hora del más nuevo de esos, para saber si desmiente a la bandeja. */
  masNuevoDelServidor: number;
  setUnreadCount: (n: number, hastaMs?: number) => void;
  setDelServidor: (n: number, masNuevoMs: number) => void;
}

export const useChatUnreadStore = create<ChatUnreadStore>((set) => ({
  unreadCount: null,
  hastaLaBandeja: 0,
  delServidor: 0,
  masNuevoDelServidor: 0,
  setUnreadCount: (n, hastaMs = 0) =>
    // La marca solo AVANZA: una vuelta de la lista que llega tarde no puede
    // devolver la bandeja a un instante anterior y hacer que el servidor la
    // desmienta sin motivo. Es la misma regla que `leidoHasta` del equipo.
    set((s) => ({
      unreadCount: n,
      hastaLaBandeja: Math.max(s.hastaLaBandeja, Number.isFinite(hastaMs) ? hastaMs : 0),
    })),
  setDelServidor: (n, masNuevoMs) =>
    set({ delServidor: n, masNuevoDelServidor: masNuevoMs }),
}));

/**
 * El número que se enseña, ya resuelto entre las dos fuentes.
 *
 * **Los tres sitios que lo pintan van por aquí** —la pastilla del menú, la
 * campanita y el número de la pestaña— y ninguno lee `unreadCount` a pelo: ese
 * campo puede ser `null` («la bandeja no ha hablado»), y quien lo leyera
 * directamente volvería a enseñar un cero en frío, que es el fallo del que
 * viene todo esto.
 */
export function useChatsQueEsperan(): number {
  const deLaBandeja = useChatUnreadStore((s) => s.unreadCount);
  const hastaLaBandeja = useChatUnreadStore((s) => s.hastaLaBandeja);
  const delServidor = useChatUnreadStore((s) => s.delServidor);
  const masNuevoDelServidor = useChatUnreadStore((s) => s.masNuevoDelServidor);
  return elNumeroDeChats({ deLaBandeja, hastaLaBandeja, delServidor, masNuevoDelServidor });
}
