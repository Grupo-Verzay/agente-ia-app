"use client";

import { useLayoutEffect } from "react";

import { laFranjaDeLaBandeja } from "@/lib/panel-lateral";

/**
 * Mide la bandeja de Chats y se la cuenta a los paneles laterales.
 *
 * Los paneles se pintan en un portal al `<body>` y se colocan con `fixed`, así
 * que no saben dónde está la bandeja: la franja iba de la barra de arriba al
 * borde de la ventana, y en Chats eso la dejaba 5 px más arriba que las otras
 * dos columnas y con un hueco entre ella y la conversación. Ver
 * `lib/panel-lateral.ts`, «En Chats, el panel es la TERCERA COLUMNA».
 *
 * Publica tres variables y una marca en la raíz, y la regla de
 * `app/globals.css` las usa. **Se MIDE, no se resta**: encima de la bandeja hay
 * una barra que mide lo que mida (`--alto-de-la-barra`), a veces una fila de
 * pestañas del módulo, y el relleno y el borde de la caja. Restando variables
 * se acierta en una pantalla y se falla en la otra.
 *
 * Cuándo se vuelve a medir: al cambiar de tamaño la bandeja (`ResizeObserver`:
 * cubre plegar el menú lateral, que la estrecha, y cualquier cosa que aparezca
 * encima, que la acorta) y al cambiar la ventana. Al desmontar se borra todo:
 * fuera de Chats el panel vuelve a colocarse contra la ventana.
 *
 * No pinta nada.
 */
export function MedidaDeChats() {
    useLayoutEffect(() => {
        const raiz = document.documentElement;
        const bandeja = document.querySelector<HTMLElement>("[data-chat-view]");
        if (!bandeja) {
            // Sin bandeja no hay nada que medir, y los paneles se quedan
            // contra la ventana. No es mudo: esto se monta DENTRO de la
            // bandeja, así que no encontrarla es que alguien quitó la marca.
            console.warn("[chats] no se encontró la bandeja para colocar los paneles laterales");
            return;
        }

        const medir = () => {
            const m = laFranjaDeLaBandeja(bandeja.getBoundingClientRect(), raiz.clientWidth);
            raiz.style.setProperty("--chats-arriba", `${m.arriba}px`);
            raiz.style.setProperty("--chats-alto", `${m.alto}px`);
            raiz.style.setProperty("--chats-derecha", `${m.derecha}px`);
            raiz.setAttribute("data-chats-medidos", "");
        };

        medir();
        const observador = new ResizeObserver(medir);
        observador.observe(bandeja);
        window.addEventListener("resize", medir);
        return () => {
            observador.disconnect();
            window.removeEventListener("resize", medir);
            raiz.removeAttribute("data-chats-medidos");
            raiz.style.removeProperty("--chats-arriba");
            raiz.style.removeProperty("--chats-alto");
            raiz.style.removeProperty("--chats-derecha");
        };
    }, []);

    return null;
}
