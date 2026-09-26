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
import { sePuedeVaciarLaColumna, type EnLaPapelera } from '@/lib/papelera-de-embudos';
import { comoListaDeIdsNumericos } from '@/lib/borrado-en-bloque';
import {
    asignarEmbudos,
    borrarEmbudo,
    crearEmbudo,
    cuantasHayEnLaEtapa,
    esDeLaCuenta,
    guardarEtapas,
    laPapeleraDe,
    lasAsignacionesDe,
    lasEtapasDe,
    lasMarcasDeSistemaDe,
    lasPosicionesDe,
    losEmbudosDe,
    moverConversacion,
    renombrarEmbudo,
    restaurarDeLaPapelera,
    usarPorDefecto,
    vaciarLaEtapa,
} from '@/lib/embudos-db';
import {
    elAlcanceDeLaColumna,
    elTableroDelEmbudo,
    quienMiraElTablero,
    quienMiraEstaConversacion,
    recordarLaCuentaDelTablero,
    type QuienMiraLosEmbudos,
    type TableroDeEmbudo,
    type UsuarioQueMira,
} from '@/lib/tablero-de-embudo.server';

/**
 * Los embudos de la cuenta.
 *
 * Una acción de servidor ES un endpoint: todo lo que llega del navegador —la
 * cuenta, el embudo, el asesor, la etapa, la conversación, la lista de
 * asesores— se vuelve a comprobar aquí contra lo que quien llama alcanza de
 * verdad. Esconder un botón en la pantalla no cierra la petición directa.
 *
 * - Crear, renombrar, borrar, editar etapas, elegir el por defecto y asignar
 *   asesores: **quien manda** (dueño o administrador, los mismos permisos).
 * - Mover una tarjeta: quien manda, cualquiera; un asesor, solo las suyas.
 *
 * # La CUENTA viaja en cada acción, y se re-resuelve
 *
 * El tablero se puede abrir sobre una cuenta que cuelga de la propia, así que
 * todas estas acciones reciben la cuenta y la vuelven a pasar por
 * `quienMiraElTablero` → `resolverLaCuentaDelTablero`, que la filtra contra las
 * alcanzables y encima la somete a `assertCanAccessTargetUser`. Lo que no se
 * alcanza cae en la cuenta propia: nunca se rechaza la petición entera, porque
 * lo típico no es un ataque sino un `?cuenta=` rancio de un enlace guardado.
 *
 * Las dos que van por una CONVERSACIÓN —mover una tarjeta y leer su etapa— no
 * reciben cuenta ninguna a propósito: la resuelven de la propia fila
 * (`quienMiraEstaConversacion`), así que no dependen de que el navegador mande
 * la correcta.
 *
 * Ningún rechazo es mudo: el caso típico es una pantalla que manda el id
 * equivocado, y sin el aviso no hay forma de saber cuál.
 */

type Respuesta<T = undefined> = { success: boolean; message: string; data?: T };

const RUTA = '/embudos';

type Contexto = {
    quien: QuienMiraLosEmbudos;
    cuentas: Awaited<ReturnType<typeof quienMiraElTablero>>;
};

async function quienLlama(cuentaPedida?: unknown): Promise<Contexto | null> {
    const user = await currentUser();
    if (!user?.id) return null;
    const cuentas = await quienMiraElTablero(user as UsuarioQueMira, cuentaPedida ?? null);
    return { quien: cuentas.quien, cuentas };
}

function noManda(quien: QuienMiraLosEmbudos, que: string): Respuesta<never> {
    console.warn('[embudos] solo el dueño o un administrador puede hacer esto', {
        que,
        persona: quien.personaId,
        cuenta: quien.cuentaId,
    });
    return { success: false, message: 'Solo el dueño o un administrador de la cuenta puede hacerlo.' };
}

export async function tableroDelEmbudoAction(
    embudoId?: string | null,
    cuentaPedida?: unknown,
    asesorPedido?: unknown,
): Promise<Respuesta<TableroDeEmbudo>> {
    try {
        const ctx = await quienLlama(cuentaPedida);
        if (!ctx) return { success: false, message: 'No autorizado.' };
        const pedido = typeof embudoId === 'string' ? embudoId : null;
        const data = await elTableroDelEmbudo(ctx.quien, pedido, asesorPedido, {
            disponibles: ctx.cuentas.cuentas,
            puedeElegir: ctx.cuentas.puedeElegirCuenta,
            recortadas: ctx.cuentas.cuentasRecortadas,
        });
        /*
         * Dónde se está mirando, para la próxima visita.
         *
         * Va aquí y no en la página —que es una lectura— porque **esta es la
         * acción por la que pasa todo lo que cambia lo que se tiene delante**,
         * el selector de cuenta incluido. Las otras acciones reciben la cuenta
         * para actuar SOBRE ella, no para mirarla, así que no apuntan nada.
         *
         * Se apunta la cuenta ya resuelta, así que una elección que dejó de
         * alcanzarse se cura sola; y cuando no cambia nada Postgres no escribe
         * la fila, así que llamarlo en cada recarga no cuesta.
         */
        await recordarLaCuentaDelTablero(ctx.quien);
        return { success: true, message: 'Listo.', data };
    } catch (error) {
        console.error('[embudos] no se pudo cargar el tablero', error);
        return { success: false, message: 'No se pudo cargar el tablero.' };
    }
}

export async function crearEmbudoAction(
    nombre: unknown,
    cuentaPedida?: unknown,
): Promise<Respuesta<{ id: string }>> {
    try {
        const ctx = await quienLlama(cuentaPedida);
        if (!ctx) return { success: false, message: 'No autorizado.' };
        const { quien } = ctx;
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

export async function renombrarEmbudoAction(
    embudoId: unknown,
    nombre: unknown,
    cuentaPedida?: unknown,
): Promise<Respuesta> {
    try {
        const ctx = await quienLlama(cuentaPedida);
        if (!ctx) return { success: false, message: 'No autorizado.' };
        const { quien } = ctx;
        if (!quien.manda) return noManda(quien, 'renombrar');
        const limpio = comoNombre(nombre);
        if (typeof embudoId !== 'string' || !limpio) return { success: false, message: 'Ponle un nombre al embudo.' };
        const ok = await renombrarEmbudo(quien.cuentaId, embudoId, limpio);
        if (!ok) return { success: false, message: 'Ese embudo no está en esta cuenta.' };
        revalidatePath(RUTA);
        return { success: true, message: 'Embudo renombrado.' };
    } catch (error) {
        console.error('[embudos] no se pudo renombrar', error);
        return { success: false, message: 'No se pudo renombrar el embudo.' };
    }
}

export async function usarPorDefectoAction(embudoId: unknown, cuentaPedida?: unknown): Promise<Respuesta> {
    try {
        const ctx = await quienLlama(cuentaPedida);
        if (!ctx) return { success: false, message: 'No autorizado.' };
        const { quien } = ctx;
        if (!quien.manda) return noManda(quien, 'por defecto');
        if (typeof embudoId !== 'string') return { success: false, message: 'Embudo no válido.' };
        const ok = await usarPorDefecto(quien.cuentaId, embudoId);
        if (!ok) return { success: false, message: 'Ese embudo no está en esta cuenta.' };
        revalidatePath(RUTA);
        return { success: true, message: 'Ahora las conversaciones sin asesor caen en este embudo.' };
    } catch (error) {
        console.error('[embudos] no se pudo marcar por defecto', error);
        return { success: false, message: 'No se pudo cambiar el embudo por defecto.' };
    }
}

export async function borrarEmbudoAction(embudoId: unknown, cuentaPedida?: unknown): Promise<Respuesta> {
    try {
        const ctx = await quienLlama(cuentaPedida);
        if (!ctx) return { success: false, message: 'No autorizado.' };
        const { quien } = ctx;
        if (!quien.manda) return noManda(quien, 'borrar');
        if (typeof embudoId !== 'string') return { success: false, message: 'Embudo no válido.' };
        const ok = await borrarEmbudo(quien.cuentaId, embudoId);
        if (!ok) return { success: false, message: 'Ese embudo no está en esta cuenta.' };
        revalidatePath(RUTA);
        return { success: true, message: 'Embudo eliminado. Sus conversaciones siguen intactas.' };
    } catch (error) {
        console.error('[embudos] no se pudo borrar', error);
        return { success: false, message: 'No se pudo eliminar el embudo.' };
    }
}

export async function guardarEtapasAction(
    embudoId: unknown,
    etapas: unknown,
    cuentaPedida?: unknown,
): Promise<Respuesta> {
    try {
        const ctx = await quienLlama(cuentaPedida);
        if (!ctx) return { success: false, message: 'No autorizado.' };
        const { quien } = ctx;
        if (!quien.manda) return noManda(quien, 'etapas');
        if (typeof embudoId !== 'string' || !(await esDeLaCuenta(quien.cuentaId, embudoId))) {
            return { success: false, message: 'Ese embudo no está en esta cuenta.' };
        }
        // La marca de sistema de cada etapa sale de la BASE, no de la lista que
        // llega: si llegara de fuera, una petición a mano convertiría cualquier
        // columna en «Perdido» —con su botón de vaciar— o le quitaría la marca a
        // las tres para poder borrarlas.
        const lista = comoListaDeEtapas(etapas, await lasMarcasDeSistemaDe(embudoId));
        if (!lista.ok) return { success: false, message: lista.motivo };
        const ok = await guardarEtapas(quien.cuentaId, embudoId, lista.etapas);
        if (!ok) return { success: false, message: 'Ese embudo no está en esta cuenta.' };
        revalidatePath(RUTA);
        return { success: true, message: 'Etapas guardadas.' };
    } catch (error) {
        console.error('[embudos] no se pudieron guardar las etapas', error);
        return { success: false, message: 'No se pudieron guardar las etapas.' };
    }
}

/**
 * Vacía la columna de Perdido: sus conversaciones pasan a la papelera.
 *
 * **No borra nada.** La ficha, el historial y todo lo que cuelga de la
 * conversación se quedan enteros treinta días; lo único que se borra es su
 * posición en el embudo, que es lo que la sacaba en esa columna. El borrado en
 * firme lo hace el barrido diario, y por el camino de borrado que ya existe.
 *
 * Cuatro cosas que hay que mantener:
 *
 * 1. **Solo la columna de Perdido**, y se pregunta por su MARCA de sistema
 *    (`sePuedeVaciarLaColumna`), no por su nombre: el nombre se puede cambiar,
 *    así que con una comprobación por texto bastaría con renombrar una columna a
 *    «Perdido» para poder vaciarla.
 * 2. **Se comprueba aquí, no solo en la pantalla.** La columna llega del
 *    navegador; esconder el botón no cierra la petición directa.
 * 3. **Se vacía lo que se VE**: el filtro de asesor entra por
 *    `elAlcanceDeLaColumna`, la misma función que decide qué pinta el tablero.
 * 4. **El resumen dice los números**, y si quedaron conversationes dentro lo
 *    dice también: un «listo» que deja doscientas es peor que un error, porque
 *    nadie vuelve a mirar.
 */
export async function vaciarLaColumnaAction(
    embudoId: unknown,
    etapaId: unknown,
    cuentaPedida?: unknown,
    asesorPedido?: unknown,
): Promise<Respuesta<{ vaciadas: number; quedan: number }>> {
    try {
        const ctx = await quienLlama(cuentaPedida);
        if (!ctx) return { success: false, message: 'No autorizado.' };
        const { quien } = ctx;
        if (!quien.manda) return noManda(quien, 'vaciar');
        if (typeof embudoId !== 'string' || typeof etapaId !== 'string') {
            return { success: false, message: 'Datos no válidos.' };
        }

        const alcance = await elAlcanceDeLaColumna(quien, embudoId, asesorPedido);
        if (!alcance) return { success: false, message: 'Ese embudo no está en esta cuenta.' };
        const etapa = alcance.etapas.find((e) => e.id === etapaId);
        if (!sePuedeVaciarLaColumna(etapa)) {
            console.warn('[embudos] se pidió vaciar una columna que no es la de Perdido', {
                embudoId,
                etapaId,
                cuenta: quien.cuentaId,
            });
            return { success: false, message: 'Solo se puede vaciar la columna de Perdido.' };
        }

        const r = await vaciarLaEtapa({
            embudoId,
            etapaId,
            cuentaId: quien.cuentaId,
            aQuien: alcance.aQuien,
            vaciadoPorId: quien.personaId,
        });
        revalidatePath(RUTA);
        if (r.vaciadas === 0) {
            return { success: true, message: 'En esa columna no había nada que vaciar.', data: r };
        }
        const cuantas = r.vaciadas === 1 ? '1 conversación' : `${r.vaciadas} conversaciones`;
        return {
            success: true,
            message:
                r.quedan > 0
                    ? `Se vaciaron ${cuantas}. Quedan más: vuelve a pulsar para seguir.`
                    : `Se vaciaron ${cuantas}. Están en la papelera de esta columna.`,
            data: r,
        };
    } catch (error) {
        console.error('[embudos] no se pudo vaciar la columna', error);
        return { success: false, message: 'No se pudo vaciar la columna.' };
    }
}

/**
 * Cuántas se van a vaciar, para decirlo ANTES de vaciar.
 *
 * Es el mismo `COUNT` que la cabecera de la columna y con el mismo filtro que el
 * vaciado: si el diálogo dijera un número y el vaciado se llevara otro, el
 * número no serviría para decidir. Un diálogo sin el número se acepta sin leer.
 */
export async function cuantasSeVaciarianAction(
    embudoId: unknown,
    etapaId: unknown,
    cuentaPedida?: unknown,
    asesorPedido?: unknown,
): Promise<Respuesta<{ cuantas: number }>> {
    try {
        const ctx = await quienLlama(cuentaPedida);
        if (!ctx) return { success: false, message: 'No autorizado.' };
        const { quien } = ctx;
        if (!quien.manda) return noManda(quien, 'contar para vaciar');
        if (typeof embudoId !== 'string' || typeof etapaId !== 'string') {
            return { success: false, message: 'Datos no válidos.' };
        }
        const alcance = await elAlcanceDeLaColumna(quien, embudoId, asesorPedido);
        if (!alcance) return { success: false, message: 'Ese embudo no está en esta cuenta.' };
        const etapa = alcance.etapas.find((e) => e.id === etapaId);
        if (!sePuedeVaciarLaColumna(etapa)) {
            return { success: false, message: 'Solo se puede vaciar la columna de Perdido.' };
        }
        const cuantas = await cuantasHayEnLaEtapa({
            embudoId,
            etapaId,
            cuentaId: quien.cuentaId,
            aQuien: alcance.aQuien,
        });
        return { success: true, message: 'Listo.', data: { cuantas } };
    } catch (error) {
        console.error('[embudos] no se pudo contar la columna', error);
        return { success: false, message: 'No se pudo contar la columna.' };
    }
}

/**
 * Lo que hay en la papelera, con los días que le quedan a cada una.
 *
 * Se pide **al abrir la papelera**, no en cada carga del tablero: es una
 * pantalla que casi nunca se abre, y traerla siempre sería una consulta más en
 * cada entrada para no enseñarla. El tablero solo lleva el número, que le sale
 * gratis.
 */
export async function laPapeleraAction(cuentaPedida?: unknown): Promise<Respuesta<EnLaPapelera[]>> {
    try {
        const ctx = await quienLlama(cuentaPedida);
        if (!ctx) return { success: false, message: 'No autorizado.' };
        const { quien } = ctx;
        if (!quien.manda) return noManda(quien, 'papelera');
        return { success: true, message: 'Listo.', data: await laPapeleraDe(quien.cuentaId) };
    } catch (error) {
        console.error('[embudos] no se pudo leer la papelera', error);
        return { success: false, message: 'No se pudo leer la papelera.' };
    }
}

/**
 * Devuelve conversaciones de la papelera a su etapa. Sin ids, la papelera
 * entera.
 *
 * Restaurar **no puede tener tope de permisos más estrecho que vaciar**: quien
 * vació tiene que poder deshacerlo. Y los ids se filtran por la cuenta dentro de
 * la consulta, así que una lista que llegue de fuera no restaura lo de otra.
 */
export async function restaurarDeLaPapeleraAction(
    sessionIds?: unknown,
    cuentaPedida?: unknown,
): Promise<Respuesta<{ restauradas: number }>> {
    try {
        const ctx = await quienLlama(cuentaPedida);
        if (!ctx) return { success: false, message: 'No autorizado.' };
        const { quien } = ctx;
        if (!quien.manda) return noManda(quien, 'restaurar');
        const ids = sessionIds === undefined || sessionIds === null ? [] : comoListaDeIdsNumericos(sessionIds);
        const restauradas = await restaurarDeLaPapelera({ cuentaId: quien.cuentaId, sessionIds: ids });
        revalidatePath(RUTA);
        if (restauradas === 0) {
            return { success: true, message: 'No había nada que restaurar.', data: { restauradas } };
        }
        return {
            success: true,
            message:
                restauradas === 1
                    ? 'Conversación restaurada a su etapa.'
                    : `${restauradas} conversaciones restauradas a su etapa.`,
            data: { restauradas },
        };
    } catch (error) {
        console.error('[embudos] no se pudo restaurar', error);
        return { success: false, message: 'No se pudo restaurar.' };
    }
}

/**
 * Qué embudo tiene cada persona del equipo. Solo personas de ESA cuenta: una
 * lista que llega de fuera no puede darle un embudo a alguien de otra.
 */
export async function asignarEmbudosAction(pares: unknown, cuentaPedida?: unknown): Promise<Respuesta> {
    try {
        const ctx = await quienLlama(cuentaPedida);
        if (!ctx) return { success: false, message: 'No autorizado.' };
        const { quien } = ctx;
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
 * La conversación, con la cuenta resuelta de su PROPIA fila, y si quien mira
 * puede moverla.
 *
 * Lo preguntan los DOS caminos que tocan la etapa de una conversación —el
 * tablero y la cabecera del chat—, para que la puerta sea **una sola**: con la
 * condición escrita en cada uno, el día que se afine una la otra se queda
 * atrás, y aquí eso es un asesor moviendo lo que no lleva.
 *
 * La cuenta sale de la fila y se comprueba contra las que esta persona alcanza
 * (`quienMiraEstaConversacion`), no contra la suya a secas: con el selector de
 * cuenta puesto, exigir la propia rechazaba la conversación de una hija estando
 * en su tablero — y en Chats, que ya enseña las líneas de las hijas, la cabecera
 * decía «no es de tu cuenta» sobre una conversación perfectamente alcanzable.
 *
 * `puedeMover` se DEVUELVE en vez de rechazar, porque leer la etapa de una
 * conversación que se alcanza no es moverla: la cabecera la enseña de solo
 * lectura diciendo por qué. Quien rechaza es quien escribe.
 */
async function laConversacion(
    sessionId: unknown,
): Promise<
    | { ok: false; message: string }
    | { ok: true; id: number; quien: QuienMiraLosEmbudos; asesorId: string | null; puedeMover: boolean }
> {
    const user = await currentUser();
    if (!user?.id) return { ok: false, message: 'No autorizado.' };

    const id = typeof sessionId === 'number' ? sessionId : Number(sessionId);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Datos no válidos.' };
    const sesion = await db.session.findUnique({
        where: { id },
        select: { userId: true, assignedAdvisorId: true },
    });
    if (!sesion) return { ok: false, message: 'Esa conversación no existe.' };

    const quien = await quienMiraEstaConversacion(user as UsuarioQueMira, sesion.userId);
    if (!quien) {
        console.warn('[embudos] se pidió una conversación de una cuenta que no se alcanza', {
            id,
            cuenta: sesion.userId,
            persona: user.id,
        });
        return { ok: false, message: 'Esa conversación no es de tu cuenta.' };
    }
    return {
        ok: true,
        id,
        quien,
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
 * Esa regla es también la razón por la que el filtro de asesor puede cambiar de
 * embudo: filtrando a alguien cuyo embudo es otro, el tablero se va a SU embudo,
 * porque es el único donde sus tarjetas se pueden mover.
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
        if (typeof etapaId !== 'string' || !etapaId) return { success: false, message: 'Datos no válidos.' };

        const conversacion = await laConversacion(sessionId);
        if (!conversacion.ok) return { success: false, message: conversacion.message };
        const { quien } = conversacion;
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
        const conversacion = await laConversacion(sessionId);
        if (!conversacion.ok) return { success: false, message: conversacion.message };
        const { quien } = conversacion;

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
