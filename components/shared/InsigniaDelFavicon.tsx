"use client";

import { useEffect, useRef } from "react";

import { useChatsQueEsperan } from "@/stores/useChatUnreadStore";
import {
    dibujarLaInsignia,
    elIconoDeLaPestana,
    loQueSePinta,
    ponerElIcono,
    quitarElIcono,
} from "@/lib/insignia-del-favicon";

/**
 * El número de pendientes, pintado encima del favicon.
 *
 * Con la pestaña de fondo entre otras diez, el icono de 16 píxeles es lo único
 * que se ve de la App. Qué se cuenta y qué no está en `lib/insignia-del-favicon`.
 *
 * # De dónde salen los números: de lo que YA corre
 *
 * - **Los chats** de `useChatsQueEsperan`, que resuelve entre lo que dice la
 *   bandeja —en vivo, y con las marcas de leído de este navegador— y lo que
 *   cuenta el servidor en la misma vuelta de quince segundos. Antes esto leía
 *   `unreadCount` a pelo, que **solo escribe la bandeja**: en cualquier
 *   pantalla que no fuera Chats valía cero y el icono no se pintaba nunca.
 * - **El equipo** por prop, desde el reloj del contador que ya cuelga del
 *   layout. Llamar aquí a `useSinLeerDelEquipo` otra vez montaría un SEGUNDO
 *   `setInterval` de quince segundos en todas las pantallas de todo el mundo
 *   —el hook no comparte estado entre llamadas—, o sea el sondeo nuevo que
 *   esto no debía traer. Por eso el número baja por prop desde el único sitio
 *   que ya lo tiene.
 *
 * # Y no pinta nada en el árbol
 *
 * Es solo un efecto: devuelve `null`. Va donde va porque necesita el número
 * del equipo, no porque tenga nada que ver con lo que haya alrededor.
 */
export function InsigniaDelFavicon({ delEquipo }: { delEquipo: number }) {
    const chatsSinLeer = useChatsQueEsperan();
    const { texto } = loQueSePinta(chatsSinLeer, delEquipo);

    /**
     * El icono de base, ya cargado.
     *
     * Se guarda porque esto se redibuja con cada número que cambia y volver a
     * pedir la imagen en cada vuelta sería una petición por mensaje que entra.
     */
    const base = useRef<HTMLImageElement | null>(null);
    /** Si ya se intentó y no se pudo, para no repetirlo en cada cambio. */
    const imposible = useRef(false);

    useEffect(() => {
        if (typeof document === "undefined") return;
        let vivo = true;

        // Sin pendientes se quita LO NUESTRO y reaparece el de siempre. No se
        // reescribe el `<link>` de Next con la dirección original: si algún
        // día esa etiqueta cambia —otro branding, otra navegación— se estaría
        // restaurando una dirección vieja encima de la buena.
        if (!texto) {
            quitarElIcono();
            return;
        }

        void (async () => {
            if (imposible.current) return;
            const icono = base.current ?? (await elIconoDeLaPestana());
            if (!vivo) return;
            if (!icono) {
                imposible.current = true;
                // No es un fallo que tumbe nada —se queda el icono normal—
                // pero mudo se ve como que la insignia no funciona, y no hay
                // forma de adivinar que fue el navegador negándose a dibujar.
                console.info("[insignia] no se pudo leer el icono de la pestaña");
                return;
            }
            base.current = icono;
            const url = dibujarLaInsignia(icono, texto);
            if (!url || !vivo) return;
            ponerElIcono(url);
        })();

        return () => {
            vivo = false;
        };
    }, [texto]);

    // Y al desmontar se deja la pestaña como estaba.
    useEffect(() => () => quitarElIcono(), []);

    return null;
}
