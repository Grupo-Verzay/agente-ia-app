'use server';

import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
    TOPE_DE_EMBUDOS,
    comoListaDeEtapas,
    comoNombre,
    elEmbudoDeLaConversacion,
    laEtapaDeLaConversacion,
    puedeMoverLaTarjeta,
    type Etapa,
} from '@/lib/embudos';
import {
    asignarEmbudos,
    borrarEmbudo,
    crearEmbudo,
    esDeLaCuenta,
    guardarEtapas,
    lasAsignacionesDe,
    lasEtapasDe,
    lasPosicionesDe,
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
 * La conversación, comprobada contra la cuenta de quien llama, y si quien mira
 * puede moverla.
 *
 * Lo preguntan los DOS caminos que tocan la etapa de una conversación —el
 * tablero y la cabecera del chat—, para que la puerta sea **una sola**: con la
 * condición escrita en cada uno, el día que se afine una la otra se queda
 * atrás, y aquí eso es un asesor moviendo lo que no lleva.
 *
 * `puedeMover` se DEVUELVE en vez de rechazar, porque leer la etapa de una
 * conversación de la cuenta no es moverla: la cabecera la enseña de solo
 * lectura diciendo por qué. Quien rechaza es quien escribe.
 */
async function laConversacion(
    quien: QuienMiraLosEmbudos,
    sessionId: unknown,
): Promise<
    { ok: false; message: string } | { ok: true; id: number; asesorId: string | null; puedeMover: boolean }
> {
    const id = typeof sessionId === 'number' ? sessionId : Number(sessionId);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Datos no válidos.' };
    const sesion = await db.session.findUnique({
        where: { id },
        select: { userId: true, assignedAdvisorId: true },
    });
    if (!sesion || sesion.userId !== quien.cuentaId) {
        console.warn('[embudos] se pidió una conversación de otra cuenta', { id, cuenta: quien.cuentaId });
        return { ok: false, message: 'Esa conversación no es de tu cuenta.' };
    }
    return {
        ok: true,
        id,
        asesorId: sesion.assignedAdvisorId ?? null,
        puedeMover: puedeMoverLaTarjeta(quien, sesion.assignedAdvisorId),
    };
}

/**
 * De qué embudo es una conversación, con la MISMA regla que el tablero
 * (`elEmbudoDeLaConversacion`): el de su asesor, y sin asesor —o con uno sin
 * embudo— el por defecto. No se guarda y no se da por bueno lo que llegue del
 * navegador: se deduce aquí cada vez.
 */
async function elEmbudoDe(
    quien: QuienMiraLosEmbudos,
    asesorId: string | null,
): Promise<{ embudoId: string | null; nombre: string | null }> {
    const [embudos, asignaciones] = await Promise.all([
        losEmbudosDe(quien.cuentaId),
        lasAsignacionesDe(quien.cuentaId),
    ]);
    const embudoId = elEmbudoDeLaConversacion(asesorId, asignaciones, embudos);
    return { embudoId, nombre: embudos.find((e) => e.id === embudoId)?.nombre ?? null };
}

/**
 * Mueve una conversación a una etapa.
 *
 * El embudo NO se da por bueno: se vuelve a deducir de la conversación con la
 * misma regla que el tablero, y la etapa tiene que ser de ese embudo. Así una
 * pestaña abierta con un tablero viejo —la conversación cambió de asesor
 * mientras tanto— no deja una posición guardada en un embudo que ya no es el
 * suyo, y lo dice.
 *
 * La llaman el tablero (arrastrando) y la cabecera del chat (el selector de
 * etapa). **Una sola acción para las dos**, con su validación y su permiso: un
 * segundo camino sería una segunda puerta que mantener a la par.
 *
 * No lleva `revalidatePath` a propósito, al revés que el resto de este fichero:
 * desde una acción de servidor eso obliga a re-renderizar la ruta ACTUAL —la
 * pantalla de Chats entera, o la consulta de 500 tarjetas del tablero— en cada
 * movimiento. Que el tablero no se abra con lo de antes lo resuelve
 * `lib/etapa-desde-el-chat.ts`, que explica el reparto entero.
 */
export async function moverTarjetaAction(sessionId: unknown, etapaId: unknown): Promise<Respuesta> {
    try {
        const quien = await quienLlama();
        if (!quien) return { success: false, message: 'No autorizado.' };
        if (typeof etapaId !== 'string' || !etapaId) return { success: false, message: 'Datos no válidos.' };

        const conversacion = await laConversacion(quien, sessionId);
        if (!conversacion.ok) return { success: false, message: conversacion.message };
        if (!conversacion.puedeMover) {
            console.warn('[embudos] un asesor intentó mover una conversación que no lleva', {
                id: conversacion.id,
                persona: quien.personaId,
            });
            return { success: false, message: 'Solo puedes mover tus propias conversaciones.' };
        }

        const { embudoId } = await elEmbudoDe(quien, conversacion.asesorId);
        if (!embudoId) return { success: false, message: 'La cuenta todavía no tiene embudos.' };
        const etapas = await lasEtapasDe([embudoId]);
        if (!etapas.some((e) => e.id === etapaId)) {
            console.warn('[embudos] la etapa no es del embudo de la conversación', {
                id: conversacion.id,
                embudoId,
                etapaId,
            });
            return {
                success: false,
                message: 'Esta conversación cambió de embudo mientras tanto. Recarga el tablero.',
            };
        }

        await moverConversacion({
            sessionId: conversacion.id,
            embudoId,
            etapaId,
            movidoPorId: quien.personaId,
        });
        return { success: true, message: 'Movida.' };
    } catch (error) {
        console.error('[embudos] no se pudo mover la tarjeta', error);
        return { success: false, message: 'No se pudo mover la conversación.' };
    }
}

/** Lo que la cabecera del chat necesita para pintar y cambiar la etapa. */
export type EtapaDeLaConversacion = {
    /** El embudo al que cae esta conversación, o `null` si la cuenta no tiene. */
    embudoId: string | null;
    embudoNombre: string | null;
    /** Las etapas de ESE embudo, en su orden. */
    etapas: Etapa[];
    /** En la que está, ya resuelta: la guardada si sigue existiendo, o la primera. */
    etapaId: string | null;
    /** Si quien mira puede cambiarla. Un asesor, solo en las suyas. */
    puedeMover: boolean;
};

/**
 * El embudo y la etapa de UNA conversación, para la cabecera del chat.
 *
 * Es la lectura que faltaba: el tablero contesta lo mismo, pero armándolo
 * entero —el equipo, las asignaciones, hasta 500 conversaciones con sus
 * etiquetas y sus seguimientos— y eso es lo más caro de esa pantalla. Aquí son
 * cuatro consultas cortas sobre una sola fila.
 *
 * Las dos respuestas tienen que coincidir siempre, así que el embudo y la etapa
 * salen de las MISMAS funciones que usa el tablero (`elEmbudoDeLaConversacion`
 * y `laEtapaDeLaConversacion`), no de una regla escrita aquí. Si discreparan,
 * la cabecera enseñaría una etapa y el tablero otra, y no habría forma de saber
 * cuál miente.
 *
 * Una conversación que no se puede mover se LEE igual, con `puedeMover: false`:
 * el selector enseña en qué etapa está y dice por qué no se cambia. Un botón
 * apagado no explica nada, y esconderlo deja sin ver el dato.
 */
export async function etapaDeLaConversacionAction(
    sessionId: unknown,
): Promise<Respuesta<EtapaDeLaConversacion>> {
    try {
        const quien = await quienLlama();
        if (!quien) return { success: false, message: 'No autorizado.' };

        const conversacion = await laConversacion(quien, sessionId);
        if (!conversacion.ok) return { success: false, message: conversacion.message };

        const { embudoId, nombre } = await elEmbudoDe(quien, conversacion.asesorId);
        const vacio: EtapaDeLaConversacion = {
            embudoId: null,
            embudoNombre: null,
            etapas: [],
            etapaId: null,
            puedeMover: conversacion.puedeMover,
        };
        // Sin embudos no es un fallo: es una cuenta que todavía no los usa, y
        // el selector lo dice con esas palabras.
        if (!embudoId) return { success: true, message: 'Listo.', data: vacio };

        const etapas = await lasEtapasDe([embudoId]);
        const posiciones = await lasPosicionesDe(embudoId, [conversacion.id]);
        return {
            success: true,
            message: 'Listo.',
            data: {
                ...vacio,
                embudoId,
                embudoNombre: nombre,
                etapas,
                etapaId: laEtapaDeLaConversacion(posiciones[conversacion.id], etapas),
            },
        };
    } catch (error) {
        console.error('[embudos] no se pudo leer la etapa de la conversación', error);
        return { success: false, message: 'No se pudo leer la etapa del embudo.' };
    }
}
