"use client";

import { useLayoutEffect } from "react";

import { MARCA_DE_LA_CAJA, MARCA_DEL_CONTENIDO, laFranjaDelContenido } from "@/lib/panel-lateral";

/**
 * Mide la caja del contenido de la plataforma y se la cuenta a los paneles
 * laterales, para que FUERA de Chats también empujen el contenido en vez de
 * taparlo. Es la hermana de `MedidaDeChats`, y la regla de CSS que la usa vive
 * al lado de la de Chats en `app/globals.css`. Ver `lib/panel-lateral.ts`,
 * «FUERA de Chats, el panel también EMPUJA el contenido».
 *
 * Cuelga del layout —una vez, para todas las pantallas— y publica:
 * `--contenido-arriba`, `--contenido-alto`, `--contenido-derecha`,
 * `--contenido-relleno` y la marca `data-contenido-medido` en la raíz.
 *
 * Se vuelve a medir al cambiar de tamaño la caja o la envoltura (plegar el
 * menú, una fila de pestañas que aparece encima) y la ventana. No pinta nada.
 */
export function MedidaDelContenido() {
    useLayoutEffect(() => {
        const raiz = document.documentElement;
        const envoltura = document.querySelector<HTMLElement>(`[${MARCA_DEL_CONTENIDO}]`);
        const caja = document.querySelector<HTMLElement>(`[${MARCA_DE_LA_CAJA}]`);
        if (!envoltura || !caja) {
            // Sin ellas los paneles se quedan contra la ventana, como antes. No
            // es mudo: las dos marcas las pone el mismo layout que monta esto.
            console.warn("[panel-lateral] no se encontró la caja del contenido; el panel se abrirá encima");
            return;
        }

        const medir = () => {
            const relleno = parseFloat(getComputedStyle(envoltura).paddingLeft);
            const m = laFranjaDelContenido(
                caja.getBoundingClientRect(),
                envoltura.getBoundingClientRect(),
                relleno,
                raiz.clientWidth,
            );
            raiz.style.setProperty("--contenido-arriba", `${m.arriba}px`);
            raiz.style.setProperty("--contenido-alto", `${m.alto}px`);
            raiz.style.setProperty("--contenido-derecha", `${m.derecha}px`);
            raiz.style.setProperty("--contenido-relleno", `${Number.isFinite(relleno) ? relleno : 0}px`);
            raiz.setAttribute("data-contenido-medido", "");
        };

        medir();
        const observador = new ResizeObserver(medir);
        observador.observe(envoltura);
        observador.observe(caja);
        window.addEventListener("resize", medir);
        return () => {
            observador.disconnect();
            window.removeEventListener("resize", medir);
            raiz.removeAttribute("data-contenido-medido");
            for (const v of ["arriba", "alto", "derecha", "relleno"]) {
                raiz.style.removeProperty(`--contenido-${v}`);
            }
        };
    }, []);

    return null;
}
