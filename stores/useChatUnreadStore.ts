import { create } from "zustand";

import { losChatsSinLeer } from "@/lib/insignia-del-favicon";

/**
 * Cuántas conversaciones de clientes están SIN LEER.
 *
 * Lo escribe **la bandeja** (`chat-sidebar`) y nadie más, y es exactamente el
 * número de la pastilla «Sin leer»: el mismo dato, no una aproximación.
 *
 * # Por qué no hay una segunda fuente
 *
 * Porque no puede haberla. Lo «no leído» de un WhatsApp sale de cruzar el
 * `unreadCount` del proveedor con las marcas de `seenMessages`, que viven en
 * el `localStorage` de **este navegador**; en nuestra base no hay ni una
 * columna que lo diga. Hubo un tiempo en que el servidor mandaba aquí un
 * conteo propio —las conversaciones cuyo último mensaje es del contacto— para
 * que el icono se pintara también en frío. Ese número no era «sin leer» y se
 * vio en producción: `9+` con la campanita vacía, y `9+` otra vez con la
 * cuenta ENTERA borrada, porque contaba una tabla que sobrevive al borrado de
 * los leads. Está contado en `lib/insignia-del-favicon`.
 *
 * Así que solo queda una fuente, y `null` significa **que no ha hablado**:
 * fuera de Chats, o antes de que la lista cargue. De `null` sale cero y no se
 * pinta nada, que es lo honesto — **un contador que miente es peor que uno que
 * falta**.
 */
interface ChatUnreadStore {
  /**
   * Lo último que dijo la bandeja. `null` = no ha hablado, que **no es lo
   * mismo que cero**: cero es «los he leído todos» y `null` es «no lo sé».
   */
  sinLeer: number | null;
  setSinLeer: (n: number) => void;
}

export const useChatUnreadStore = create<ChatUnreadStore>((set) => ({
  sinLeer: null,
  setSinLeer: (n) => set({ sinLeer: n }),
}));

/**
 * El número que se enseña.
 *
 * **Los tres sitios que lo pintan van por aquí** —la pastilla del menú, la
 * campanita y el icono de la pestaña— y ninguno lee `sinLeer` a pelo: ese
 * campo puede ser `null`, y un `null` pintado es un `0` que parece un dato.
 */
export function useChatsQueEsperan(): number {
  const sinLeer = useChatUnreadStore((s) => s.sinLeer);
  return losChatsSinLeer(sinLeer);
}
