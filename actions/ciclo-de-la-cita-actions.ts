'use server';

import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';
import { elCicloEstaActivo, guardarElCicloActivo } from '@/lib/ciclo-de-la-cita-db';

/**
 * Agenda › Ajustes › Flujo automático de la cita: el interruptor de la cuenta.
 * La cuenta sale de `laCuentaDeLaAccion` (el id que llega del navegador se
 * comprueba, y el alcance va hacia abajo).
 */

type Respuesta = { success: true; activo: boolean } | { success: false; message: string };

export async function leerCicloDeLaCitaAction(userId?: string | null): Promise<Respuesta> {
    const cuenta = await laCuentaDeLaAccion(userId);
    if (!cuenta) return { success: false, message: 'No autorizado.' };
    try {
        return { success: true, activo: await elCicloEstaActivo(cuenta) };
    } catch (error) {
        console.error('[ciclo-de-la-cita] no se pudo leer el interruptor', { cuenta, error });
        return { success: false, message: 'No se pudo leer el flujo automático de la cita.' };
    }
}

export async function guardarCicloDeLaCitaAction(userId: string | null, activo: unknown): Promise<Respuesta> {
    const cuenta = await laCuentaDeLaAccion(userId);
    if (!cuenta) return { success: false, message: 'No autorizado.' };
    if (typeof activo !== 'boolean') return { success: false, message: 'Valor no válido.' };
    try {
        return { success: true, activo: await guardarElCicloActivo(cuenta, activo) };
    } catch (error) {
        console.error('[ciclo-de-la-cita] no se pudo guardar el interruptor', { cuenta, error });
        return { success: false, message: 'No se pudo guardar el flujo automático de la cita.' };
    }
}
