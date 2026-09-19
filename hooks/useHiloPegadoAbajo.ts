"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
    cuantosSinLeer,
    estaPegadoAbajo,
    type EstadoDelHilo,
} from "@/lib/desplazamiento-del-hilo";

/**
 * Cuánto se vigila que el contenido crezca, después de abrir o de que llegue
 * algo. Dos segundos cubre de sobra lo que tarda en cargar una pantalla de
 * fotos y audios, y evita dejar un `requestAnimationFrame` corriendo para
 * siempre sobre un hilo de miles de nodos.
 */
const VIGILIA_MS = 2_000;

/**
 * Un hilo de mensajes que se abre por el final y se queda ahí.
 *
 * Lo usan los cinco listados de la plataforma —Chats, el chat de equipo, los
 * comentarios de una tarea y los dos simuladores del agente—, que antes hacían
 * cada uno su versión de lo mismo: al cambiar el número de mensajes, al final.
 *
 * # Lo que arregla, y por qué no bastaba con lo que había
 *
 * **Al abrir, el hilo se quedaba a media altura.** El salto al final ocurría al
 * pintar, y después cargaban las imágenes y los audios, que empujan el
 * contenido hacia abajo: el «final» al que se había saltado ya no era el final.
 * Aquí lo que vigila el crecimiento es un **`ResizeObserver` sobre el
 * contenido**, no una lista de eventos `load` — así entra todo lo que crece,
 * también lo que nadie previó: un audio que se mide, una tarjeta de reunión que
 * resuelve su nombre, una transcripción que aparece debajo de una nota.
 *
 * **Y arrastraba la vista mientras alguien leía arriba.** Cada mensaje que
 * entraba tiraba de la pantalla al fondo. Desde fuera eso no se lee como una
 * función: se lee como que la App no te deja leer.
 *
 * # La regla de la que cuelga todo
 *
 * > **Estar pegado abajo solo se pierde SCROLLEANDO.** Que el contenido crezca
 * > no despega nunca. Es lo que hace que el primer fallo no pueda volver: una
 * > foto que carga aumenta la distancia al final, y cualquiera que mire esa
 * > distancia concluirá que la persona se fue a leer arriba cuando no ha tocado
 * > nada.
 *
 * Por eso el `ResizeObserver` **vuelve a pegar antes de mirar nada**, y solo el
 * manejador de `scroll` puede poner `pegado` en falso.
 */
export function useHiloPegadoAbajo(opciones: {
    /** El contenedor que scrollea. Puede venir de fuera si ya existe. */
    ref: React.RefObject<HTMLElement | null>;
    /**
     * De qué conversación es este hilo.
     *
     * Al cambiar se vuelve a pegar abajo y se olvida el contador: abrir un chat
     * **siempre** deja en el último mensaje, diga lo que diga el anterior.
     */
    clave: string | number | null | undefined;
    /** Cuántos mensajes hay ahora. */
    total: number;
    /**
     * El último, para distinguir «llegó algo» de «cargué historial».
     *
     * Sin él, pulsar «Cargar mensajes anteriores» mientras se lee arriba
     * pondría en la flecha un contador de mensajes viejos.
     */
    ultimoId?: string | null;
    /** Mientras sea `false` no se toca nada (un panel cerrado, un diálogo). */
    activo?: boolean;
}) {
    const { ref, clave, total, ultimoId = null, activo = true } = opciones;

    const [pegado, setPegado] = useState(true);
    const [sinLeer, setSinLeer] = useState(0);
    /** Lo mismo que `pegado`, para leerlo desde manejadores sin recrearlos. */
    const pegadoRef = useRef(true);
    const anteriorRef = useRef<EstadoDelHilo>({ total: 0, ultimoId: null });
    /** Para medir el scroll una vez por fotograma y no en cada evento. */
    const fotogramaRef = useRef<number | null>(null);

    const pegar = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [ref]);

    /** Bajar al final por decisión de la persona: pega y limpia el contador. */
    const irAlFinal = useCallback(() => {
        pegadoRef.current = true;
        setPegado(true);
        setSinLeer(0);
        pegar();
    }, [pegar]);

    /**
     * Soltar el anclaje a propósito.
     *
     * Lo usan los saltos: ir al mensaje de una mención, a un resultado de
     * búsqueda o a una cita. Sin esto se depende de que el `scroll` que provoca
     * el salto llegue antes que el siguiente crecimiento del contenido, y esa
     * carrera se pierde de vez en cuando — o sea, un salto que se deshace solo.
     */
    const soltar = useCallback(() => {
        pegadoRef.current = false;
        setPegado(false);
    }, []);

    // ── Al cambiar de conversación: al final, y sin contador ────────────────
    useEffect(() => {
        if (!activo) return;
        pegadoRef.current = true;
        setPegado(true);
        setSinLeer(0);
        anteriorRef.current = { total: 0, ultimoId: null };
        pegar();
    }, [clave, activo, pegar]);

    // ── Lo que llega: contar si no se está mirando ──────────────────────────
    useEffect(() => {
        if (!activo) return;
        const ahora: EstadoDelHilo = { total, ultimoId };
        setSinLeer((acumulado) =>
            cuantosSinLeer(anteriorRef.current, ahora, pegadoRef.current, acumulado),
        );
        anteriorRef.current = ahora;
        if (pegadoRef.current) pegar();
    }, [total, ultimoId, activo, pegar]);

    // ── El scroll, que es lo ÚNICO que despega ──────────────────────────────
    useEffect(() => {
        const el = ref.current;
        if (!el || !activo) return;
        const alScrollear = () => {
            // Una vez por fotograma: el navegador dispara `scroll` muchas más
            // veces de las que puede pintar, y esto mide el DOM.
            if (fotogramaRef.current !== null) return;
            fotogramaRef.current = window.requestAnimationFrame(() => {
                fotogramaRef.current = null;
                const caja = ref.current;
                if (!caja) return;
                const abajo = estaPegadoAbajo({
                    scrollTop: caja.scrollTop,
                    scrollHeight: caja.scrollHeight,
                    clientHeight: caja.clientHeight,
                });
                if (abajo === pegadoRef.current) return;
                pegadoRef.current = abajo;
                setPegado(abajo);
                // Volver abajo es haber leído lo que había.
                if (abajo) setSinLeer(0);
            });
        };
        el.addEventListener("scroll", alScrollear, { passive: true });
        return () => {
            el.removeEventListener("scroll", alScrollear);
            if (fotogramaRef.current !== null) {
                window.cancelAnimationFrame(fotogramaRef.current);
                fotogramaRef.current = null;
            }
        };
    }, [ref, activo]);

    // ── Y lo que de verdad arregla el fallo: el contenido que crece ─────────
    //
    // Aquí hay una trampa que costó una vuelta, y conviene no volver a caer:
    // **un `ResizeObserver` sobre el contenido NO se entera.** El hijo del
    // contenedor es un elemento flex de altura fija —la del propio contenedor,
    // 702 px medidos— y lo que crece al cargar una foto es `scrollHeight`, que
    // no es el tamaño de ninguna caja. Medido en Chromium: con cuatro fotos
    // entrando, el observador se disparó **una sola vez**, la del montaje, y el
    // hilo se quedaba a 880 px del final igual que sin nada.
    //
    // Lo que sí funciona, y está medido, son estas dos:

    // 1. **`load` en captura.** `load` no burbujea, pero **sí se captura**, así
    //    que un solo oyente en el contenedor recoge cada `img`, `audio` y
    //    `video` que termine de cargar — que es exactamente lo que se reportó.
    //    No cuesta nada cuando no carga nada.
    useEffect(() => {
        const el = ref.current;
        if (!el || !activo) return;
        const alCargar = () => {
            if (pegadoRef.current) pegar();
        };
        // `loadedmetadata` aparte: un audio ya tiene su alto ahí, antes de que
        // llegue el `load` del fichero entero.
        el.addEventListener("load", alCargar, true);
        el.addEventListener("loadedmetadata", alCargar, true);
        return () => {
            el.removeEventListener("load", alCargar, true);
            el.removeEventListener("loadedmetadata", alCargar, true);
        };
    }, [ref, activo, pegar]);

    // 2. **Una vigilia ACOTADA de `scrollHeight`**, que recoge todo lo demás:
    //    una transcripción que aparece debajo de una nota, una tarjeta de
    //    reunión que resuelve su nombre, una fuente que termina de cargar. Es
    //    lo único que ve crecer el contenido de verdad.
    //
    //    Y va acotada a propósito: un `requestAnimationFrame` permanente son
    //    sesenta lecturas de `scrollHeight` por segundo, y cada una fuerza al
    //    navegador a recalcular la maquetación de un hilo de miles de nodos.
    //    Eso es justo lo que este repositorio evita en la lista de Chats. Se
    //    reabre al cambiar de conversación y cada vez que llega algo, que son
    //    los dos momentos en los que hay contenido por cargar.
    useEffect(() => {
        const el = ref.current;
        if (!el || !activo) return;
        let id = 0;
        let ultimoAlto = -1;
        const hasta = performance.now() + VIGILIA_MS;
        const vuelta = () => {
            const caja = ref.current;
            if (!caja) return;
            if (caja.scrollHeight !== ultimoAlto) {
                ultimoAlto = caja.scrollHeight;
                if (pegadoRef.current) pegar();
            }
            if (performance.now() < hasta) id = window.requestAnimationFrame(vuelta);
        };
        id = window.requestAnimationFrame(vuelta);
        return () => window.cancelAnimationFrame(id);
    }, [ref, activo, clave, total, pegar]);

    // 3. Y el observador se queda, pero sobre el CONTENEDOR y para lo que sí
    //    sabe ver: que encoja el hueco donde vive el hilo —se abre un panel, se
    //    gira un móvil—. Estando pegado abajo, eso tiene que seguir pegado.
    useEffect(() => {
        const el = ref.current;
        if (!el || !activo || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => {
            if (pegadoRef.current) pegar();
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref, activo, pegar]);

    return { pegado, sinLeer, irAlFinal, soltar, pegar };
}
