"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import {
    AVISO_DE_PANEL_LATERAL,
    avisarDelPanelLateral,
    comoSeMueveLaHoja,
    hayOtroPanelAbierto,
} from "@/lib/panel-lateral";

/** `useLayoutEffect` en el navegador, `useEffect` en el servidor (sin aviso). */
const useEfectoAntesDePintar = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Lo que todo panel lateral hace igual: reservar la franja y apartar a los demás.
 *
 * # Dos cosas, y cada una tapa un fallo distinto
 *
 * 1. **Reserva la franja mientras esté abierto** (`avisarDelPanelLateral`), que
 *    es lo que hace que la conversación de Chats se acomode en vez de quedarse
 *    debajo. Va por el registro del módulo, no por un booleano: ver el porqué
 *    en `lib/panel-lateral.ts`.
 * 2. **Cierra a cualquier otro panel al abrirse.** Los cinco nacen en el mismo
 *    sitio, así que dos a la vez son uno tapando al otro sin decir cuál está
 *    delante.
 *
 * # Y por eso `cerrar` se lee por REFERENCIA
 *
 * El manejador casi siempre llega nuevo en cada repintado —es una función
 * escrita en el JSX del padre—, así que con él en las dependencias el oyente
 * se desengancharía y se volvería a enganchar constantemente. Peor: entre las
 * dos cosas hay una ventana en la que este panel **no está escuchando**, y el
 * aviso que llega justo ahí se pierde — o sea, dos paneles abiertos a la vez
 * de vez en cuando, que es el fallo más difícil de reproducir de esta familia.
 *
 * # El que se abre avisa; el que está abierto escucha
 *
 * No hace falta ningún arbitraje: quien se abre manda su id, y quien lo recibe
 * se cierra **si no es el suyo**. Sin esa comparación un panel se cerraría a sí
 * mismo en el mismo momento de abrirse.
 *
 * # Y el registro se lleva por INSTANCIA, no por panel
 *
 * Es la parte que no se ve leyendo, y la cazó barrer quién monta cada uno:
 * **el mismo panel está montado más de una vez**. La cabecera de Chats pinta
 * el recordatorio dos veces —una en la fila del móvil y otra en la de
 * escritorio— y la tarea sale de tres sitios. Con el registro guardando el id
 * del PANEL, la instancia cerrada borra el sitio que acaba de reservar la
 * abierta, y la conversación se destapa sola: el mismo fallo que el registro
 * vino a evitar, entrando por la otra puerta.
 *
 * Así que lo que se registra es la instancia (`useId`) y lo que se compara en
 * la exclusión es el panel. De ahí sale además lo correcto en las dos puntas:
 * dos instancias del MISMO panel no se cierran entre ellas —son el mismo
 * panel— y cualquier otro sí.
 *
 * # Y devuelve si el cambio en curso es un RELEVO
 *
 * `true` mientras este panel entra sustituyendo a otro, o sale porque otro lo
 * sustituye. Quien pinta la hoja le pone entonces `HOJA_SIN_TRANSICION`: al
 * alternar entre paneles tiene que sentirse un mismo contenedor que cambia de
 * contenido, no uno que se va y otro que llega. Ver `comoSeMueveLaHoja`.
 */
export function usePanelLateral(
    id: string,
    abierto: boolean,
    cerrar: () => void,
    /**
     * `false` para un panel que ya ocupe su sitio en el flujo: reservar además
     * la franja le quitaría a la conversación el doble de ancho. Hoy no lo usa
     * nadie —la ficha de Contacto pasó a ser un `PanelLateral`— y se deja por
     * si vuelve a hacer falta.
     */
    { reservar = true }: { reservar?: boolean } = {},
): boolean {
    const instancia = useId();
    const cerrarRef = useRef(cerrar);
    cerrarRef.current = cerrar;
    const [relevo, setRelevo] = useState(false);

    /* Abrir mientras otro ocupa la franja es un RELEVO: sin deslizamiento.
       Va ANTES de pintar (layout) y antes de que este panel se registre, así
       que el otro sigue apuntado y la re-pintada sin transición llega antes de
       que el navegador calcule ningún estilo: la hoja aparece ya puesta. */
    useEfectoAntesDePintar(() => {
        if (!abierto) return;
        const movimiento = comoSeMueveLaHoja({
            abriendo: true,
            hayOtroAbierto: hayOtroPanelAbierto(instancia),
            loCierraOtro: false,
        });
        if (movimiento === "relevo") setRelevo(true);
    }, [abierto, instancia]);

    /* El relevo dura UN cambio. Pasados dos fotogramas —el estilo sin
       transición ya se aplicó— se devuelve la transición, para que el cierre
       siguiente, si es normal, vuelva a deslizarse. Devolverla con la hoja ya
       quieta no anima nada. */
    useEffect(() => {
        if (!relevo || typeof window === "undefined") return;
        let segundo = 0;
        const primero = requestAnimationFrame(() => {
            segundo = requestAnimationFrame(() => setRelevo(false));
        });
        return () => {
            cancelAnimationFrame(primero);
            cancelAnimationFrame(segundo);
        };
    }, [relevo]);

    useEffect(() => {
        if (!reservar) return;
        avisarDelPanelLateral(instancia, abierto);
        // Al desmontar se suelta pase lo que pase: un panel que se va del árbol
        // sin soltar su sitio deja la conversación encogida para siempre.
        return () => avisarDelPanelLateral(instancia, false);
    }, [instancia, abierto, reservar]);

    /* También ANTES de pintar: así el que se va se cierra en el mismo
       fotograma en que entra este, y no queda ni uno con los dos encima. */
    useEfectoAntesDePintar(() => {
        if (!abierto || typeof window === "undefined") return;

        window.dispatchEvent(new CustomEvent(AVISO_DE_PANEL_LATERAL, { detail: id }));

        const alAbrirseOtro = (evento: Event) => {
            const quien = (evento as CustomEvent<string>).detail;
            if (quien === id) return;
            // Lo cierra la exclusión porque entra otro: se va SIN deslizarse,
            // en el mismo render que su cierre (las dos actualizaciones van
            // juntas), para que el que entra lo sustituya en su sitio.
            if (comoSeMueveLaHoja({ abriendo: false, hayOtroAbierto: true, loCierraOtro: true }) === "relevo") {
                setRelevo(true);
            }
            cerrarRef.current();
        };
        window.addEventListener(AVISO_DE_PANEL_LATERAL, alAbrirseOtro);
        return () => window.removeEventListener(AVISO_DE_PANEL_LATERAL, alAbrirseOtro);
    }, [id, abierto]);

    return relevo;
}
