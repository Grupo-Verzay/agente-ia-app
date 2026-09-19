"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
    dentroDeLaPantalla,
    queHacerConLaVentana,
    type Punto,
} from "@/lib/ventana-flotante";

/**
 * Una ventana flotante que se arrastra — y que **no se puede perder**.
 *
 * La usan las tres cosas que flotan encima de la plataforma: la tarjeta de
 * llamada del directo, la de WhatsApp en Chats y el panel de una reunión.
 * Copiada, el día que se afine la captura del puntero se afina en una y las
 * otras se quedan atrás, y eso no se ve como un error: se ve como que «la
 * reunión a veces no se deja mover».
 *
 * Todo lo delicado de aquí ya costó una vuelta, y el porqué de cada línea está
 * en la tarjeta de llamada. Resumido:
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
 *
 * # Y la cuarta, que es la que faltaba: acotar al mover NO basta
 *
 * Esto ya acotaba al arrastrar, y la ventana acababa fuera igual — porque se
 * sale **sin que nadie la arrastre**: la tarjeta crece donde está al encender
 * la cámara, la ventana del navegador encoge al girar un móvil, y una medida
 * tomada antes de maquetar devuelve un recuadro de 0×0 contra el que el tope
 * sale pegado al borde contrario. Los tres dejan una posición que ya no vale.
 *
 * Así que se comprueba en los **cuatro** momentos en que puede dejar de valer
 * —al agarrarla, al redimensionar la ventana, al cambiar de tamaño la propia
 * tarjeta (`ResizeObserver`) y al moverla— y quien decide es
 * `lib/ventana-flotante.ts`, que es puro y está probado. Lo que no se puede
 * arreglar acotando **se olvida**: la ventana vuelve a su esquina de siempre,
 * que es donde se sabe encontrarla.
 */
export function useVentanaArrastrable(opciones: {
    /** Mientras sea `false` no se puede agarrar. */
    activa: boolean;
    /**
     * Algo que cambia cuando la ventana cambia de tamaño —plegada o no—.
     *
     * Se queda por comodidad de quien la usa, pero **ya no es lo que sostiene
     * la regla**: de eso se encarga el `ResizeObserver`, que se entera también
     * de los cambios de tamaño que nadie declara —la tarjeta que se ensancha al
     * encenderse la cámara, el nombre largo que añade una línea—. Con solo
     * este aviso, esos se quedaban fuera y la tarjeta crecía hacia el borde.
     */
    tamano?: unknown;
}) {
    const { activa, tamano } = opciones;

    const [posicion, setPosicion] = useState<Punto | null>(null);
    const cajaRef = useRef<HTMLDivElement | null>(null);
    /** Dónde se agarró la ventana, para que no salte bajo el cursor. */
    const agarreRef = useRef<{ dx: number; dy: number } | null>(null);

    /** El tamaño de la pantalla, medido ahora. */
    const laPantalla = () => ({ ancho: window.innerWidth, alto: window.innerHeight });

    /**
     * Vuelve a mirar si la posición guardada sigue valiendo.
     *
     * Las tres salidas son las de `queHacerConLaVentana`, y la tercera es la
     * que hacía falta: **olvidar**. Acotar una posición calculada contra un
     * tamaño que no era el suyo la deja igual de inalcanzable; devolverla a su
     * esquina, no.
     */
    const recolocar = useCallback(() => {
        const caja = cajaRef.current;
        if (!caja) return;
        const r = caja.getBoundingClientRect();
        setPosicion((p) => {
            if (!p) return p;
            const que = queHacerConLaVentana(
                p,
                { ancho: r.width, alto: r.height },
                laPantalla(),
            );
            if (que.que === "dejar") return p;
            if (que.que === "olvidar") return null;
            return { x: que.x, y: que.y };
        });
    }, []);

    useEffect(() => {
        window.addEventListener("resize", recolocar);
        // En un móvil, la barra del navegador que aparece y desaparece cambia
        // el alto útil **sin** disparar `resize` en algunos navegadores; el
        // viewport visual sí lo cuenta.
        const vv = window.visualViewport;
        vv?.addEventListener("resize", recolocar);
        return () => {
            window.removeEventListener("resize", recolocar);
            vv?.removeEventListener("resize", recolocar);
        };
    }, [recolocar]);

    useEffect(() => {
        recolocar();
    }, [tamano, recolocar]);

    /**
     * Y lo que de verdad cierra el agujero: la propia caja avisa cuando cambia
     * de tamaño.
     *
     * No hay bucle: `ResizeObserver` mira el **tamaño**, y lo único que esto
     * cambia es dónde está. Mover no redimensiona.
     */
    useEffect(() => {
        const caja = cajaRef.current;
        if (!caja || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => recolocar());
        ro.observe(caja);
        return () => ro.disconnect();
    }, [recolocar]);

    const agarrar = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            // Solo el botón principal: con el derecho se abre el menú del
            // navegador y el arrastre se quedaría pegado al cursor.
            if (!activa || e.button !== 0) return;
            const caja = cajaRef.current;
            if (!caja) return;
            const r = caja.getBoundingClientRect();
            // Se acota TAMBIÉN al agarrar. Antes se guardaba el rectángulo tal
            // cual: si la ventana ya estaba fuera —creció ahí, o encogió la
            // pantalla— el arrastre arrancaba desde fuera y el primer
            // movimiento la traía de golpe bajo el cursor, saltando.
            const desde = dentroDeLaPantalla(
                r.left,
                r.top,
                r.width,
                r.height,
                laPantalla(),
            );
            setPosicion(desde);
            agarreRef.current = { dx: e.clientX - desde.x, dy: e.clientY - desde.y };
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
                laPantalla(),
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
