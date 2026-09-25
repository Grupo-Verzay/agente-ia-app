'use server';

import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
    TOPE_DE_EMBUDOS,
    comoListaDeEtapas,
    comoNombre,
    elEmbudoDeLaConversacion,
    puedeMoverLaTarjeta,
} from '@/lib/embudos';
import {
    asignarEmbudos,
    borrarEmbudo,
    crearEmbudo,
    esDeLaCuenta,
    guardarEtapas,
    lasAsignacionesDe,
    lasEtapasDe,
    losEmbudosDe,
    moverConversacion,
    renombrarEmbudo,
    usarPorDefecto,
} from '@/lib/embudos-db';
import {
    elTableroDelEmbudo,
    quienMiraLosEmbudos,
    type QuienMiraLosEmbudos,
    type TableroDeEmbudo,
} from '@/lib/tablero-de-embudo.server';

/**
 * Los embudos de la cuenta.
 *
 * Una acción de servidor ES un endpoint: todo lo que llega del navegador —el
 * embudo, la etapa, la conversación, la lista de asesores— se vuelve a
 * comprobar aquí contra la cuenta de quien llama. Esconder un botón en la
 * pantalla no cierra la petición directa.
 *
 * - Crear, renombrar, borrar, editar etapas, elegir el por defecto y asignar
 *   asesores: **quien manda** (dueño o administrador, los mismos permisos).
 * - Mover una tarjeta: quien manda, cualquiera; un asesor, solo las suyas.
 *
 * Ningún rechazo es mudo: lo típico no es un ataque sino una pantalla que manda
 * el id equivocado, y sin el aviso no hay forma de saber cuál.
 */

type Respuesta<T = undefined> = { success: boolean; message: string; data?: T };

const RUTA = '/embudos';

async function quienLlama(): Promise<QuienMiraLosEmbudos | null> {
    const user = await currentUser();
    if (!user?.id) return null;
    return quienMiraLosEmbudos(user);
}

function noManda(quien: QuienMiraLosEmbudos, que: string): Respuesta<never> {
    console.warn('[embudos] solo el dueño o un administrador puede hacer esto', {
        que,
        persona: quien.personaId,
        cuenta: quien.cuentaId,
    });
    return { success: false, message: 'Solo el dueño o un administrador de la cuenta puede hacerlo.' };
}

export async function tableroDelEmbudoAction(embudoId?: string | null): Promise<Respuesta<TableroDeEmbudo>> {
    try {
        const quien = await quienLlama();
        if (!quien) return { success: false, message: 'No autorizado.' };
        const pedido = typeof embudoId === 'string' ? embudoId : null;
        const data = await elTableroDelEmbudo(quien, pedido);
        return { success: true, message: 'Listo.', data };
    } catch (error) {
        console.error('[embudos] no se pudo cargar el tablero', error);
        return { success: false, message: 'No se pudo cargar el tablero.' };
    }
}

export async function crearEmbudoAction(nombre: unknown): Promise<Respuesta<{ id: string }>> {
    try {
        const quien = await quienLlama();
        if (!quien) return { success: false, message: 'No autorizado.' };
        if (!quien.manda) return noManda(quien, 'crear');
        const limpio = comoNombre(nombre);
        if (!limpio) return { success: false, message: 'Ponle un nombre al embudo.' };
        const actuales = await losEmbudosDe(quien.cuentaId);
        if (actuales.length >= TOPE_DE_EMBUDOS) {
            return { success: false, message: `Una cuenta puede tener como mucho ${TOPE_DE_EMBUDOS} embudos.` };
        }
        const id = await crearEmbudo({ cuentaId: quien.cuentaId, nombre: limpio, creadoPorId: quien.personaId });
        revalidatePath(RUTA);
        return { success: true, message: 'Embudo creado.', data: { id } };
    } catch (error) {
        console.error('[embudos] no se pudo crear', error);
        return { success: false, message: 'No se pudo crear el embudo.' };
    }
}

export async function renombrarEmbudoAction(embudoId: unknown, nombre: unknown): Promise<Respuesta> {
    try {
        const quien = await quienLlama();
        if (!quien) return { success: false, message: 'No autorizado.' };
        if (!quien.manda) return noManda(quien, 'renombrar');
        const limpio = comoNombre(nombre);
        if (typeof embudoId !== 'string' || !limpio) return { success: false, message: 'Ponle un nombre al embudo.' };
        const ok = await renombrarEmbudo(quien.cuentaId, embudoId, limpio);
        if (!ok) return { success: false, message: 'Ese embudo no está en tu cuenta.' };
        revalidatePath(RUTA);
        return { success: true, message: 'Embudo renombrado.' };
    } catch (error) {
        console.error('[embudos] no se pudo renombrar', error);
        return { success: false, message: 'No se pudo renombrar el embudo.' };
    }
}

export async function usarPorDefectoAction(embudoId: unknown): Promise<Respuesta> {
    try {
        const quien = await quienLlama();
        if (!quien) return { success: false, message: 'No autorizado.' };
        if (!quien.manda) return noManda(quien, 'por defecto');
        if (typeof embudoId !== 'string') return { success: false, message: 'Embudo no válido.' };
        const ok = await usarPorDefecto(quien.cuentaId, embudoId);
        if (!ok) return { success: false, message: 'Ese embudo no está en tu cuenta.' };
        revalidatePath(RUTA);
        return { success: true, message: 'Ahora las conversaciones sin asesor caen en este embudo.' };
    } catch (error) {
        console.error('[embudos] no se pudo marcar por defecto', error);
        return { success: false, message: 'No se pudo cambiar el embudo por defecto.' };
    }
}

export async function borrarEmbudoAction(embudoId: unknown): Promise<Respuesta> {
    try {
        const quien = await quienLlama();
        if (!quien) return { success: false, message: 'No autorizado.' };
        if (!quien.manda) return noManda(quien, 'borrar');
        if (typeof embudoId !== 'string') return { success: false, message: 'Embudo no válido.' };
        const ok = await borrarEmbudo(quien.cuentaId, embudoId);
        if (!ok) return { success: false, message: 'Ese embudo no está en tu cuenta.' };
        revalidatePath(RUTA);
        return { success: true, message: 'Embudo eliminado. Sus conversaciones siguen intactas.' };
    } catch (error) {
        console.error('[embudos] no se pudo borrar', error);
        return { success: false, message: 'No se pudo eliminar el embudo.' };
    }
}

export async function guardarEtapasAction(embudoId: unknown, etapas: unknown): Promise<Respuesta> {
    try {
        const quien = await quienLlama();
        if (!quien) return { success: false, message: 'No autorizado.' };
        if (!quien.manda) return noManda(quien, 'etapas');
        if (typeof embudoId !== 'string' || !(await esDeLaCuenta(quien.cuentaId, embudoId))) {
            return { success: false, message: 'Ese embudo no está en tu cuenta.' };
        }
        const actuales = await lasEtapasDe([embudoId]);
        const lista = comoListaDeEtapas(etapas, new Set(actuales.map((e) => e.id)));
        if (!lista.ok) return { success: false, message: lista.motivo };
        const ok = await guardarEtapas(quien.cuentaId, embudoId, lista.etapas);
        if (!ok) return { success: false, message: 'Ese embudo no está en tu cuenta.' };
        revalidatePath(RUTA);
        return { success: true, message: 'Etapas guardadas.' };
    } catch (error) {
        console.error('[embudos] no se pudieron guardar las etapas', error);
        return { success: false, message: 'No se pudieron guardar las etapas.' };
    }
}

/**
 * Qué embudo tiene cada persona del equipo. Solo personas de ESTA cuenta: una
 * lista que llega de fuera no puede darle un embudo a alguien de otra.
 */
export async function asignarEmbudosAction(pares: unknown): Promise<Respuesta> {
    try {
        const quien = await quienLlama();
        if (!quien) return { success: false, message: 'No autorizado.' };
        if (!quien.manda) return noManda(quien, 'asignar');
        if (!Array.isArray(pares)) return { success: false, message: 'La lista no es válida.' };

        const equipo = new Set(
            (
                await db.user.findMany({
                    where: { OR: [{ id: quien.cuentaId }, { ownerId: quien.cuentaId }] },
                    select: { id: true },
                })
            ).map((u) => u.id),
        );
        const limpios: Array<{ personaId: string; embudoId: string | null }> = [];
        let fuera = 0;
        for (const bruto of pares.slice(0, 500)) {
            const p = bruto as { personaId?: unknown; embudoId?: unknown };
            if (typeof p?.personaId !== 'string' || !equipo.has(p.personaId)) {
                fuera += 1;
                continue;
            }
            limpios.push({
                personaId: p.personaId,
                embudoId: typeof p.embudoId === 'string' && p.embudoId ? p.embudoId : null,
            });
        }
        if (fuera > 0) {
            console.warn('[embudos] se ignoraron personas que no son del equipo', { fuera, cuenta: quien.cuentaId });
        }
        await asignarEmbudos(quien.cuentaId, limpios);
        revalidatePath(RUTA);
        return { success: true, message: 'Asignaciones guardadas.' };
    } catch (error) {
        console.error('[embudos] no se pudieron guardar las asignaciones', error);
        return { success: false, message: 'No se pudieron guardar las asignaciones.' };
    }
}

/**
 * Mueve una conversación a una etapa.
 *
 * El embudo NO se da por bueno: se vuelve a deducir de la conversación con la
 * misma regla que el tablero, y la etapa tiene que ser de ese embudo. Así una
 * pestaña abierta con un tablero viejo —la conversación cambió de asesor
 * mientras tanto— no deja una posición guardada en un embudo que ya no es el
 * suyo, y lo dice.
 */
export async function moverTarjetaAction(sessionId: unknown, etapaId: unknown): Promise<Respuesta> {
    try {
        const quien = await quienLlama();
        if (!quien) return { success: false, message: 'No autorizado.' };
        const id = typeof sessionId === 'number' ? sessionId : Number(sessionId);
        if (!Number.isInteger(id) || id <= 0 || typeof etapaId !== 'string') {
            return { success: false, message: 'Datos no válidos.' };
        }

        const sesion = await db.session.findUnique({
            where: { id },
            select: { userId: true, assignedAdvisorId: true },
        });
        if (!sesion || sesion.userId !== quien.cuentaId) {
            console.warn('[embudos] se intentó mover una conversación de otra cuenta', { id, cuenta: quien.cuentaId });
            return { success: false, message: 'Esa conversación no es de tu cuenta.' };
        }
        if (!puedeMoverLaTarjeta(quien, sesion.assignedAdvisorId)) {
            console.warn('[embudos] un asesor intentó mover una conversación que no lleva', {
                id,
                persona: quien.personaId,
            });
            return { success: false, message: 'Solo puedes mover tus propias conversaciones.' };
        }

        const [embudos, asignaciones] = await Promise.all([
            losEmbudosDe(quien.cuentaId),
            lasAsignacionesDe(quien.cuentaId),
        ]);
        const embudoId = elEmbudoDeLaConversacion(sesion.assignedAdvisorId, asignaciones, embudos);
        if (!embudoId) return { success: false, message: 'La cuenta todavía no tiene embudos.' };
        const etapas = await lasEtapasDe([embudoId]);
        if (!etapas.some((e) => e.id === etapaId)) {
            console.warn('[embudos] la etapa no es del embudo de la conversación', { id, embudoId, etapaId });
            return {
                success: false,
                message: 'Esta conversación cambió de embudo mientras tanto. Recarga el tablero.',
            };
        }

        await moverConversacion({ sessionId: id, embudoId, etapaId, movidoPorId: quien.personaId });
        return { success: true, message: 'Movida.' };
    } catch (error) {
        console.error('[embudos] no se pudo mover la tarjeta', error);
        return { success: false, message: 'No se pudo mover la conversación.' };
    }
}
