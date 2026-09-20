"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
    CADA_CUANTO_SE_ESCONDEN_MS,
    hayQueAtenderLaSenal,
    seVenLosMandos,
    type MotivoParaNoEsconderse,
} from "@/lib/mandos-de-la-reunion";

/**
 * Los mandos de la reunión, que se apartan solos y vuelven al moverse.
 *
 * Lo que decide está en `lib/mandos-de-la-reunion.ts`, puro y probado; esto es
 * lo que no se puede probar sin navegador: los oyentes y el temporizador.
 *
 * # Los oyentes van en `window`, no en la caja de la reunión
 *
 * Porque `keydown` no llega a un `div` que no tiene el foco, y tabular hasta un
 * botón escondido sin que reaparezca es quedarse con el foco en un sitio
 * invisible. Y porque a pantalla completa la reunión **es** la ventana, así que
 * no hay nada fuera a lo que escuchar de más. Cuando no está activo —la reunión
 * plegada— no se engancha ninguno.
 *
 * # Y escondidos NO se pueden pulsar
 *
 * Eso lo pone quien pinta, con `pointer-events-none`, y no es cosmético: unos
 * mandos invisibles que siguen respondiendo al clic son un botón de colgar que
 * se pulsa sin verlo. Lo que sí se conserva es el foco por teclado, porque
 * `keydown` los devuelve antes de que nadie pulse nada.
 */
export function useMandosQueSeEsconden({ activo }: { activo: boolean }) {
    const [seVen, setSeVen] = useState(true);
    /** Para leerlo dentro de los oyentes sin volver a engancharlos en cada cambio. */
    const seVenRef = useRef(true);
    seVenRef.current = seVen;

    const motivos = useRef<Set<MotivoParaNoEsconderse>>(new Set());
    const ultimaSenal = useRef(0);
    const temporizador = useRef<number | null>(null);

    const programar = useCallback(() => {
        if (temporizador.current !== null) {
            window.clearTimeout(temporizador.current);
            temporizador.current = null;
        }
        const ahora = Date.now();
        setSeVen(seVenLosMandos({ ultimaSenal: ahora, ahora, motivos: [...motivos.current], activo }));
        // Sin nada que contar —plegada, o con un menú abierto— no se programa:
        // el temporizador se vuelve a poner en cuanto el motivo se va.
        if (!activo || motivos.current.size > 0) return;
        temporizador.current = window.setTimeout(() => {
            temporizador.current = null;
            setSeVen(false);
        }, CADA_CUANTO_SE_ESCONDEN_MS);
    }, [activo]);

    /** Enseñarlos ya, venga de donde venga. */
    const mostrar = useCallback(() => {
        ultimaSenal.current = Date.now();
        programar();
    }, [programar]);

    const hayActividad = useCallback(() => {
        const ahora = Date.now();
        if (!hayQueAtenderLaSenal({ seVen: seVenRef.current, ultimaSenal: ultimaSenal.current, ahora })) {
            return;
        }
        ultimaSenal.current = ahora;
        programar();
    }, [programar]);

    /** Un motivo para quedarse puestos: un menú abierto, el puntero encima. */
    const fijar = useCallback(
        (motivo: MotivoParaNoEsconderse, si: boolean) => {
            if (si) motivos.current.add(motivo);
            else motivos.current.delete(motivo);
            // Poniendo un motivo se enseñan; quitándolo arranca la cuenta otra
            // vez desde ahora, no desde la última vez que se movió el ratón.
            ultimaSenal.current = Date.now();
            programar();
        },
        [programar],
    );

    useEffect(() => {
        programar();
        return () => {
            if (temporizador.current !== null) {
                window.clearTimeout(temporizador.current);
                temporizador.current = null;
            }
        };
    }, [programar]);

    useEffect(() => {
        if (!activo) return;
        const atender = () => hayActividad();
        const opciones = { passive: true } as const;
        window.addEventListener("mousemove", atender, opciones);
        window.addEventListener("pointerdown", atender, opciones);
        window.addEventListener("touchstart", atender, opciones);
        window.addEventListener("keydown", atender, opciones);
        return () => {
            window.removeEventListener("mousemove", atender);
            window.removeEventListener("pointerdown", atender);
            window.removeEventListener("touchstart", atender);
            window.removeEventListener("keydown", atender);
        };
    }, [activo, hayActividad]);

    return { seVen, mostrar, fijar };
}
