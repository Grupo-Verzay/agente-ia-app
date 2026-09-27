"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pendientesDelMenuAction } from "@/actions/pendientes-del-menu-actions";
import { correosSinLeerAction } from "@/actions/correo-actions";
import { useTaskStore } from "@/stores/useTaskStore";
import { useChatsQueEsperan } from "@/stores/useChatUnreadStore";
import { lasClavesDelMenu, type ClaveDePendientes, type ConteosDelMenu } from "@/lib/pendientes-del-menu";

/** Cada cuánto se vuelven a contar Agenda, Multiagenda y Recordatorios. */
export const CADA_CUANTO_SE_CUENTA_MS = 60_000;
/** Correos pregunta a Gmail/Outlook/IMAP: va más espaciado. */
export const CADA_CUANTO_SE_CUENTA_EL_CORREO_MS = 120_000;

/**
 * Los numeritos del menú lateral, para las rutas que ese menú enseña.
 *
 * - **Chats y Mis tareas no se vuelven a pedir**: ya los tiene el navegador
 *   (`useChatsQueEsperan`, que es la pastilla «Sin leer»; `useTaskStore`, que
 *   alimenta su propio reloj). Una segunda fuente para lo mismo diría un día
 *   otra cosa.
 * - **Solo se cuenta lo que está en el menú** (`lasClavesDelMenu`): quien no
 *   tiene Correo no le pregunta nada a Gmail.
 * - **Un solo `setInterval` montado una vez, que lee por referencia** —la
 *   regla de los relojes de Chats—: una cadena de `setTimeout` que no llega a
 *   programar la siguiente muere en silencio.
 * - Con la pestaña de fondo no pregunta, y al volver pregunta de inmediato.
 * - Un fallo deja el número que había: no se borra un contador por un tropiezo
 *   de red, y tampoco se inventa uno.
 */
export function usePendientesDelMenu(rutas: (string | null | undefined)[]): ConteosDelMenu {
    const chats = useChatsQueEsperan();
    const tareas = useTaskStore((s) => s.pendingCount);
    const [delServidor, setDelServidor] = useState<ConteosDelMenu>({});

    const firma = rutas.join("|");
    const claves = useMemo(() => lasClavesDelMenu(rutas), [firma]); // eslint-disable-line react-hooks/exhaustive-deps
    const clavesRef = useRef<Set<ClaveDePendientes>>(claves);
    clavesRef.current = claves;

    useEffect(() => {
        let vivo = true;
        const desfase = () => new Date().getTimezoneOffset();

        const contarLaBase = async () => {
            const pedir = (["agenda", "multiagenda", "recordatorios"] as const).filter((c) => clavesRef.current.has(c));
            if (pedir.length === 0) return;
            try {
                const res = await pendientesDelMenuAction(pedir, desfase());
                if (vivo && res.success) setDelServidor((antes) => ({ ...antes, ...res.conteos }));
            } catch (error) {
                console.warn("[menu] no se pudieron contar los pendientes", error);
            }
        };
        const contarElCorreo = async () => {
            if (!clavesRef.current.has("correo")) return;
            try {
                const res = await correosSinLeerAction();
                if (vivo && res.success) setDelServidor((antes) => ({ ...antes, correo: res.sinLeer }));
            } catch (error) {
                console.warn("[menu] no se pudieron contar los correos sin leer", error);
            }
        };

        // La primera cuenta la hace el efecto de abajo, al conocerse las rutas.
        const base = setInterval(() => { if (!document.hidden) void contarLaBase(); }, CADA_CUANTO_SE_CUENTA_MS);
        const correo = setInterval(() => { if (!document.hidden) void contarElCorreo(); }, CADA_CUANTO_SE_CUENTA_EL_CORREO_MS);
        const alVolver = () => {
            if (document.hidden) return;
            void contarLaBase();
            void contarElCorreo();
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            vivo = false;
            clearInterval(base);
            clearInterval(correo);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, []);

    // Cuando el menú gana una ruta que antes no tenía (los módulos llegan un
    // instante después del primer pintado), se cuenta ya y no en la vuelta
    // siguiente del reloj.
    useEffect(() => {
        const pedir = (["agenda", "multiagenda", "recordatorios"] as const).filter((c) => claves.has(c) && delServidor[c] === undefined);
        if (pedir.length > 0) {
            void pendientesDelMenuAction(pedir, new Date().getTimezoneOffset())
                .then((res) => { if (res.success) setDelServidor((antes) => ({ ...antes, ...res.conteos })); })
                .catch((error) => console.warn("[menu] no se pudieron contar los pendientes", error));
        }
        if (claves.has("correo") && delServidor.correo === undefined) {
            void correosSinLeerAction()
                .then((res) => { if (res.success) setDelServidor((antes) => ({ ...antes, correo: res.sinLeer })); })
                .catch((error) => console.warn("[menu] no se pudieron contar los correos sin leer", error));
        }
    }, [claves]); // eslint-disable-line react-hooks/exhaustive-deps

    return { ...delServidor, chats, tareas };
}
