'use server';

import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';
import { guardarLosAjustes, leerLosAjustes, type AjustesDeLaVideollamada } from '@/lib/videollamada-ia-db';
import { losAjustesQueSeGuardan } from '@/lib/videollamada-ia';
import { loQueFaltaParaElProveedor } from '@/lib/proveedor-de-videollamada';

/**
 * Agenda › Ajustes › Configuración de Reunión: el modo de reunión de la cuenta.
 *
 * La cuenta sale de `laCuentaDeLaAccion` (la puerta de siempre: el id que
 * llega del navegador se comprueba). Solo se elige el modo: el avatar es el
 * mismo para todas las cuentas y lo pone la plataforma.
 */

type Respuesta<T> = { success: true; data: T } | { success: false; message: string };

export async function leerAjustesDeVideollamadaAction(userId?: string | null): Promise<Respuesta<AjustesDeLaVideollamada>> {
    const cuenta = await laCuentaDeLaAccion(userId);
    if (!cuenta) return { success: false, message: 'No autorizado.' };
    try {
        return { success: true, data: await leerLosAjustes(cuenta) };
    } catch (error) {
        console.error('[videollamada] no se pudieron leer los ajustes', { cuenta, error });
        return { success: false, message: 'No se pudieron leer los ajustes de la videollamada.' };
    }
}

export async function guardarAjustesDeVideollamadaAction(
    userId: string | null,
    pedido: { modo?: unknown; limiteMinutos?: unknown },
): Promise<Respuesta<AjustesDeLaVideollamada>> {
    const cuenta = await laCuentaDeLaAccion(userId);
    if (!cuenta) return { success: false, message: 'No autorizado.' };
    try {
        const actuales = await leerLosAjustes(cuenta);
        const decision = losAjustesQueSeGuardan(pedido ?? {}, actuales.disponible, loQueFaltaParaElProveedor(actuales.proveedor));
        if (!decision.ok) return { success: false, message: decision.motivo };
        return { success: true, data: await guardarLosAjustes(cuenta, decision.ajustes) };
    } catch (error) {
        console.error('[videollamada] no se pudieron guardar los ajustes', { cuenta, error });
        return { success: false, message: 'No se pudieron guardar los ajustes de la videollamada.' };
    }
}
