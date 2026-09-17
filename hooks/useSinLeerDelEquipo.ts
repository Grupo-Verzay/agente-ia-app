"use client";

import { useCallback, useEffect, useState } from "react";

import { sinLeerDelEquipoAction } from "@/actions/chat-de-equipo-actions";

/**
 * Cuántos mensajes del equipo quedan por leer.
 *
 * # Por qué tiene su propio reloj
 *
 * Porque **la gracia es enterarse con el panel CERRADO**. El reloj del hilo
 * solo corre con el panel abierto, y a propósito: cuelga del layout, o sea de
 * todas las pantallas. Este es lo contrario — tiene que correr siempre — así
 * que va mucho más espaciado y no se trae ni un mensaje, solo cuenta.
 *
 * Quince segundos, el mismo ritmo que la ventana que interrumpe. No es el chat
 * abierto de la bandeja, que va a cinco: esto es un aviso de que hay algo, y
 * quien quiera leerlo abre el panel y ahí sí corre el reloj corto.
 *
 * Es un `setInterval` montado **una sola vez**, no una cadena de `setTimeout`:
 * si una vuelta no llegara a programar la siguiente, el contador se quedaría
 * clavado y nadie se enteraría de nada — que es el fallo de partida.
 *
 * Con la pestaña de fondo no se pregunta, y al volver a ella se pregunta de
 * inmediato.
 *
 * # Y baja al momento, no en la vuelta siguiente
 *
 * Abrir un canal lo marca leído en el servidor, pero el contador vive aquí: sin
 * nada más, el número se quedaría puesto hasta quince segundos después de haber
 * leído, y eso se ve como un contador roto.
 *
 * Se avisa con un evento del navegador y no con un contexto porque el hilo se
 * pinta en **dos sitios** —el panel, que cuelga del layout, y la ruta, que no—.
 * Un contexto obligaría a envolver los dos; el evento llega igual desde
 * cualquiera.
 */

/** Cada cuánto se pregunta. Corto y fijo, como el resto de relojes de la App. */
export const CADA_CUANTO_CUENTA_MS = 15_000;

/** Lo que dispara el hilo cuando acaba de marcar un canal como leído. */
export const YA_LO_LEI = "chat-equipo:leido";

export function avisarDeQueSeLeyo() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(YA_LO_LEI));
}

export function useSinLeerDelEquipo() {
    const [total, setTotal] = useState(0);

    const preguntar = useCallback(async () => {
        try {
            const res = await sinLeerDelEquipoAction();
            if (!res.success) {
                console.warn("[chat-equipo] no se pudo contar lo que falta por leer", res.message);
                return;
            }
            setTotal(res.data.total);
        } catch (error) {
            // Mudo aquí se ve como «el contador nunca sube».
            console.warn("[chat-equipo] falló una vuelta del contador", error);
        }
    }, []);

    useEffect(() => {
        let vivo = true;
        const vuelta = () => {
            if (typeof document !== "undefined" && document.hidden) return;
            if (vivo) void preguntar();
        };
        vuelta();

        const id = window.setInterval(vuelta, CADA_CUANTO_CUENTA_MS);
        const alVolver = () => {
            if (!document.hidden) vuelta();
        };
        document.addEventListener("visibilitychange", alVolver);
        window.addEventListener(YA_LO_LEI, vuelta);

        return () => {
            vivo = false;
            window.clearInterval(id);
            document.removeEventListener("visibilitychange", alVolver);
            window.removeEventListener(YA_LO_LEI, vuelta);
        };
    }, [preguntar]);

    return total;
}
