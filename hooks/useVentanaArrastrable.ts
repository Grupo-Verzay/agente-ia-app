"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { dentroDeLaPantalla } from "@/lib/llamada-de-voz";

/**
 * Una ventana flotante que se arrastra — **una sola vez**.
 *
 * La usan las dos cosas que flotan encima de la plataforma: la tarjeta de
 * llamada del directo y el panel de una reunión. Copiada, el día que se afine
 * la captura del puntero se afina en una y la otra se queda atrás, y eso no se
 * ve como un error: se ve como que «la reunión a veces no se deja mover».
 *
 * Todo lo delicado de aquí ya costó una vuelta en la tarjeta de llamada, y el
 * porqué de cada línea está en ella. Resumido:
 *
 * 1. **Antes del primer arrastre manda el CSS.** `posicion` en `null` no es lo
 *    mismo que `{x,y}` calculado: mientras nadie la toque, la ventana se
 *    recoloca sola al cambiar el ancho de la pantalla, que es lo que se quiere
 *    para algo que acaba de aparecer. Aplicarle un desplazamiento sin fijar
 *    antes dónde está de verdad la manda a la esquina en el primer píxel.
 * 2. **La captura del puntero va en el ASA**, que es quien lleva los
 *    manejadores: en otro elemento, los eventos siguientes se le redirigen a él
 *    y el arrastre se suelta a medias en cuanto el cursor sale de la ventana.
 *    De ahí sale la otra mitad: **ningún botón puede ir DENTRO del asa**,
 *    porque su `click` no llegaría a salir.
 * 3. **`touch-none` en el asa.** Sin él, en un móvil el navegador se queda el
 *    gesto para desplazar la página y la ventana no se mueve nunca.
 * 4. **Se recoloca al redimensionar y al cambiar de tamaño.** Lo segundo es lo
 *    que se olvida: plegar o desplegar cambia el alto, y desplegar una barra
 *    pegada al borde de abajo la sacaría por ahí. Y fuera está el botón de
 *    colgar.
 */
export function useVentanaArrastrable(opciones: {
    /** Mientras sea `false` no se puede agarrar. */
    activa: boolean;
    /**
     * Algo que cambia cuando la ventana cambia de tamaño —plegada o no—.
     *
     * Se pasa para volver a medirla: con la posición ya fijada y un tamaño
     * nuevo, lo que estaba dentro de la pantalla puede dejar de estarlo.
     */
    tamano?: unknown;
}) {
    const { activa, tamano } = opciones;

    const [posicion, setPosicion] = useState<{ x: number; y: number } | null>(null);
    const cajaRef = useRef<HTMLDivElement | null>(null);
    /** Dónde se agarró la ventana, para que no salte bajo el cursor. */
    const agarreRef = useRef<{ dx: number; dy: number } | null>(null);

    /** Volver a meterla en pantalla, midiéndola de verdad. */
    const recolocar = useCallback(() => {
        const caja = cajaRef.current;
        if (!caja) return;
        const r = caja.getBoundingClientRect();
        setPosicion((p) =>
            p
                ? dentroDeLaPantalla(p.x, p.y, r.width, r.height, {
                      ancho: window.innerWidth,
                      alto: window.innerHeight,
                  })
                : p,
        );
    }, []);

    useEffect(() => {
        window.addEventListener("resize", recolocar);
        return () => window.removeEventListener("resize", recolocar);
    }, [recolocar]);

    useEffect(() => {
        recolocar();
    }, [tamano, recolocar]);

    const agarrar = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            // Solo el botón principal: con el derecho se abre el menú del
            // navegador y el arrastre se quedaría pegado al cursor.
            if (!activa || e.button !== 0) return;
            const caja = cajaRef.current;
            if (!caja) return;
            const r = caja.getBoundingClientRect();
            setPosicion({ x: r.left, y: r.top });
            agarreRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
            e.currentTarget.setPointerCapture(e.pointerId);
        },
        [activa],
    );

    const mover = useCallback((e: React.PointerEvent<HTMLElement>) => {
        const agarre = agarreRef.current;
        const caja = cajaRef.current;
        if (!agarre || !caja) return;
        const r = caja.getBoundingClientRect();
        setPosicion(
            dentroDeLaPantalla(
                e.clientX - agarre.dx,
                e.clientY - agarre.dy,
                r.width,
                r.height,
                { ancho: window.innerWidth, alto: window.innerHeight },
            ),
        );
    }, []);

    const soltar = useCallback((e: React.PointerEvent<HTMLElement>) => {
        if (!agarreRef.current) return;
        agarreRef.current = null;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // El puntero ya se fue; no hay nada que soltar.
        }
    }, []);

    /** Lo que hace que un trozo sea asa. Se esparce con `{...asa}`. */
    const asa = activa
        ? {
              onPointerDown: agarrar,
              onPointerMove: mover,
              onPointerUp: soltar,
              onPointerCancel: soltar,
              className: "cursor-grab touch-none active:cursor-grabbing",
          }
        : { className: "" };

    return {
        cajaRef,
        posicion,
        /** Para el `style` de la caja: `undefined` mientras manda el CSS. */
        estilo: posicion ? { left: posicion.x, top: posicion.y } : undefined,
        asa,
        recolocar,
    };
}
