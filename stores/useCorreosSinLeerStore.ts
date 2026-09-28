import { create } from "zustand";

import { correosSinLeerAction } from "@/actions/correo-actions";

/**
 * Cuántos correos sin leer tiene la persona, sumando sus buzones.
 *
 * Lo leen DOS sitios —el numerito de Correos del menú lateral y el del selector
 * Chats ⇄ Correos de la barra de arriba— y tienen que decir lo mismo, así que
 * el número vive aquí y no en cada uno. Cada uno pide con `pedirSiHaceFalta`,
 * y la pregunta al proveedor sale UNA vez por periodo aunque la pidan los dos:
 * si ya hay una en vuelo se espera esa, y si la última es reciente no se
 * vuelve a preguntar. Preguntarle a Gmail dos veces para pintar el mismo
 * número es trabajo tirado.
 *
 * `null` es «no se sabe» (algún buzón no contestó, o no se ha preguntado):
 * no se pinta, igual que en el menú. Un fallo deja el número que había.
 */
interface CorreosSinLeerStore {
    sinLeer: number | null;
    /** Cuándo volvió la última respuesta buena (ms), 0 si nunca. */
    pedidoEn: number;
    pedirSiHaceFalta: (edadMaximaMs: number) => Promise<void>;
}

let enVuelo: Promise<void> | null = null;

export const useCorreosSinLeerStore = create<CorreosSinLeerStore>((set, get) => ({
    sinLeer: null,
    pedidoEn: 0,
    pedirSiHaceFalta: (edadMaximaMs) => {
        if (enVuelo) return enVuelo;
        if (get().pedidoEn > 0 && Date.now() - get().pedidoEn < edadMaximaMs) return Promise.resolve();
        enVuelo = (async () => {
            try {
                const res = await correosSinLeerAction();
                if (res.success) set({ sinLeer: res.sinLeer, pedidoEn: Date.now() });
            } catch (error) {
                console.warn("[correo] no se pudieron contar los correos sin leer", error);
            } finally {
                enVuelo = null;
            }
        })();
        return enVuelo;
    },
}));
