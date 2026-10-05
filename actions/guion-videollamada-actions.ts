"use server";

import { currentUser } from "@/lib/auth";
import { laCuentaDeLaAccion } from "@/lib/cuenta-de-la-accion";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { elGuionQueSeUsa, type GuionDeVideollamada } from "@/lib/guion-videollamada";
import { guardarElGuionDeVideollamada, leerElGuionDeVideollamada } from "@/lib/guion-videollamada-db";

type Respuesta<T = undefined> = { success: boolean; message: string; data?: T };

/**
 * Entrenamiento › Agente IA › Videollamadas. La cuenta la pone la pantalla
 * (`effectiveId`) y pasa por la puerta de siempre; guardar es de quien manda
 * en la cuenta (un `agente` lo lee y no lo cambia).
 */
export async function leerElGuionDeVideollamadaAction(cuentaId?: string | null): Promise<Respuesta<GuionDeVideollamada>> {
    const cuenta = await laCuentaDeLaAccion(cuentaId);
    if (!cuenta) return { success: false, message: "No autorizado." };
    try {
        return { success: true, message: "", data: elGuionQueSeUsa(await leerElGuionDeVideollamada(cuenta)) };
    } catch (error) {
        console.error("[guion-videollamada] no se pudo leer el guion", { cuenta, error: String(error) });
        return { success: false, message: "No se pudo leer el guion de la videollamada." };
    }
}

export async function guardarElGuionDeVideollamadaAction(
    cuentaId: string | null | undefined,
    guion: unknown,
): Promise<Respuesta<GuionDeVideollamada>> {
    const cuenta = await laCuentaDeLaAccion(cuentaId);
    if (!cuenta) return { success: false, message: "No autorizado." };
    const user = await currentUser();
    if (!user || !canManageWorkspace(user)) {
        console.warn("[guion-videollamada] guardar rechazado: no administra la cuenta", { cuenta });
        return { success: false, message: "Solo quien administra la cuenta puede cambiar el guion." };
    }
    try {
        const guardado = await guardarElGuionDeVideollamada(cuenta, guion, laPersonaQueActua(user).id);
        return { success: true, message: "Guardado.", data: elGuionQueSeUsa(guardado) };
    } catch (error) {
        console.error("[guion-videollamada] no se pudo guardar el guion", { cuenta, error: String(error) });
        return { success: false, message: "No se pudo guardar el guion de la videollamada." };
    }
}
