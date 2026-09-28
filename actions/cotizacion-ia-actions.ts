"use server";

import { currentUser } from "@/lib/auth";
import { laCuentaDeLaAccion } from "@/lib/cuenta-de-la-accion";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { comoAjustes, type AjustesDeCotizacion } from "@/lib/cotizacion-ia";
import { guardarAjustesDeCotizacion, leerAjustesDeCotizacion } from "@/lib/cotizacion-ia-db";

type Respuesta<T = undefined> = { success: boolean; message: string; data?: T };

/**
 * Entrenamiento › Cotizaciones. La cuenta la pone la pantalla (la misma que el
 * resto del entrenamiento, `effectiveId`) y se comprueba con la puerta de
 * siempre (`laCuentaDeLaAccion` → `assertCanAccessTargetUser`): el id que llega
 * del navegador no decide nada.
 */
export async function leerAjustesDeCotizacionAction(cuentaId?: string | null): Promise<Respuesta<AjustesDeCotizacion>> {
    const cuenta = await laCuentaDeLaAccion(cuentaId);
    if (!cuenta) return { success: false, message: "No autorizado." };
    try {
        return { success: true, message: "", data: await leerAjustesDeCotizacion(cuenta) };
    } catch (error) {
        console.error("[cotizacion-ia] no se pudieron leer los ajustes", { cuenta, error: String(error) });
        return { success: false, message: "No se pudieron leer los ajustes de cotizaciones." };
    }
}

export async function guardarAjustesDeCotizacionAction(
    cuentaId: string | null | undefined,
    ajustes: unknown,
): Promise<Respuesta<AjustesDeCotizacion>> {
    const cuenta = await laCuentaDeLaAccion(cuentaId);
    if (!cuenta) return { success: false, message: "No autorizado." };
    const user = await currentUser();
    const persona = user ? laPersonaQueActua(user).id : null;
    try {
        const guardado = await guardarAjustesDeCotizacion(cuenta, comoAjustes(ajustes), persona);
        return { success: true, message: "Guardado.", data: guardado };
    } catch (error) {
        console.error("[cotizacion-ia] no se pudieron guardar los ajustes", { cuenta, error: String(error) });
        return { success: false, message: "No se pudieron guardar los ajustes de cotizaciones." };
    }
}
