'use server';

import { db } from '@/lib/db';
import { QuickReply } from '@prisma/client';
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';
import { elGrupo, laPuedeTocar, laVe, naceSuya, type Grupo } from '@/lib/personales';
import {
    lasDuenasDeRespuestas,
    marcarComoPersonal,
    olvidarLaMarca,
    quienVeLoPersonal,
} from '@/lib/personales-db';
import {
    elNombreQueSeGuarda,
    elOrdenConLasDemasEnSuSitio,
    elOrdenDeUnaNueva,
    elTipoDeLaRespuesta,
} from '@/lib/respuestas-rapidas';
import { comoListaDeIdsNumericos } from '@/lib/borrado-en-bloque';
import { normalizeQuickReplyCategory } from '@/lib/quick-reply-categories';

/**
 * `personal`: la persona dueña si la respuesta es de un asesor, o `null` si es
 * de la cuenta. Un asesor ve las suyas y las de la cuenta; el dueño y los
 * administradores, todas. Ver `lib/personales.ts`.
 */
export type RespuestaRapida = QuickReply & {
    personal?: string | null;
    grupo?: Grupo;
    /**
     * ¿Puede quien mira editarla y borrarla? Un asesor VE las de la cuenta y
     * no las toca. Sin este dato la tarjeta le ofrecía editar y el servidor
     * contestaba «No autorizado»: menú abierto, puerta cerrada.
     */
    editable?: boolean;
};

interface RROperationResponse {
    success: boolean;
    message: string;
    data?: RespuestaRapida[];
}

/** Deja solo las que quien mira puede ver, cada una con su dueña. */
async function soloLasQueVe(filas: QuickReply[]): Promise<RespuestaRapida[]> {
    const quien = await quienVeLoPersonal();
    if (!quien) return [];
    const duenas = await lasDuenasDeRespuestas(filas.map((f) => f.id));
    return filas
        .filter((f) => laVe(duenas.get(f.id), quien))
        .map((f) => ({
            ...f,
            personal: duenas.get(f.id) ?? null,
            grupo: elGrupo(duenas.get(f.id), quien),
            editable: laPuedeTocar(duenas.get(f.id), quien),
        }));
}

/**
 * La CUENTA bajo la que nace una respuesta, nunca la persona.
 *
 * El formulario mandaba `user.id`, que para alguien del equipo es SU fila, no
 * la de la cuenta. `laCuentaDeLaAccion` lo daba por bueno —uno se alcanza a sí
 * mismo— y la respuesta se guardaba a nombre de la persona. La pantalla la lee
 * por la cuenta, así que **no la veía nadie, ni quien la creó**; y en Chats solo
 * la veía quien la creó. En producción había catorce así, de administradores de
 * un equipo, con repetidas como «referido», «referido_1» y «referido_2»: se
 * creaba, no salía, y se volvía a crear.
 *
 * Así que se sube a la cuenta de esa fila (`ownerId ?? id`), que es lo mismo que
 * hace Chats para saber de quién es un atajo (`lasCuentasDeLosCreadores`).
 */
async function laCuentaDeLaFila(alcanzada: string): Promise<string> {
    const fila = await db.user.findUnique({ where: { id: alcanzada }, select: { ownerId: true } });
    return fila?.ownerId ?? alcanzada;
}

/**
 * El orden de siempre, y con desempate. Con solo `order` las que empatan —toda
 * respuesta nacía con 0— salían en el orden que la base quisiera, distinto de
 * una carga a otra.
 */
const EN_SU_ORDEN = [{ order: 'asc' as const }, { id: 'asc' as const }];

/** ¿Puede quien llama editar o borrar esta respuesta? */
async function laPuedeTocarQuienLlama(id: number): Promise<boolean> {
    const quien = await quienVeLoPersonal();
    if (!quien) return false;
    const ok = laPuedeTocar((await lasDuenasDeRespuestas([id])).get(id), quien);
    if (!ok) console.warn('[respuestas] un asesor intentó tocar una respuesta que no es suya', { id });
    return ok;
}

/**
 * Sin guarda ninguna: el `userId` llegaba del navegador y entraba directo al
 * `where` y al `create`. Es el H02 de siempre.
 *
 * Aquí están además **los dos casos que un barrido por la firma no ve**:
 *
 * - `createRR` lo recibe **dentro de un objeto**, así que buscar `userId:
 *   string` en la firma no lo encuentra.
 * - `updateRR` recibe un `Partial<QuickReply>` entero, o sea que el navegador
 *   podía mandar `userId` dentro del `data` y **mudar la respuesta a otra
 *   cuenta**. Es la misma familia que el `assignNonBooleanFields` de Clientes:
 *   la identidad de la fila —quién es y de quién cuelga— no se copia de lo que
 *   llegue de fuera.
 */

/** El dueño sale de la FILA, no del navegador. */
async function laCuentaDeLaRespuesta(id: number) {
    const suya = await db.quickReply.findUnique({ where: { id }, select: { userId: true } });
    if (!suya?.userId) return null;
    return laCuentaDeLaAccion(suya.userId);
}

export async function getAllRRs(userId: string): Promise<RROperationResponse> {
    try {
        const cuenta = await laCuentaDeLaAccion(userId);
        if (!cuenta) return { success: false, message: 'No autorizado.' };

        const list = await db.quickReply.findMany({
            where: { userId: cuenta },
            orderBy: EN_SU_ORDEN,
        });
        return {
            success: true,
            message: 'Registros obtenidos correctamente.',
            data: await soloLasQueVe(list),
        };
    } catch (error) {
        console.error('Error al obtener registros rr:', error);
        return {
            success: false,
            message: 'Error al obtener los registros.',
        };
    }
}

export async function getAllRRsByUserIds(userIds: string[]): Promise<RROperationResponse> {
    if (!userIds.length) return { success: true, message: 'Sin usuarios.', data: [] };
    try {
        // Una lista que llega de fuera no decide a qué cuentas se llega: se
        // **filtra**, no se rechaza entera. Esto lo llama la precarga de Chats
        // con las líneas que ya resolvió el servidor, así que en el caso normal
        // no se cae ninguna; lo que se cierra es pedirla a mano con otros ids.
        const alcanzadas: string[] = [];
        for (const pedido of userIds) {
            const cuenta = await laCuentaDeLaAccion(pedido);
            if (cuenta) alcanzadas.push(cuenta);
        }
        if (!alcanzadas.length) return { success: true, message: 'Sin usuarios.', data: [] };

        const list = await db.quickReply.findMany({
            where: { userId: { in: alcanzadas } },
            orderBy: [{ userId: 'asc' as const }, ...EN_SU_ORDEN],
        });
        return {
            success: true,
            message: 'Registros obtenidos correctamente.',
            data: await soloLasQueVe(list),
        };
    } catch (error) {
        console.error('Error al obtener registros rr:', error);
        return {
            success: false,
            message: 'Error al obtener los registros.',
        };
    }
}

export async function createRR(data: {
    workflowId?: string;
    name?: string;
    mensaje?: string;
    category?: string;
    userId: string;
}): Promise<RROperationResponse> {
    try {
        // Primero la puerta de siempre, con el id que llega; después se sube a la
        // CUENTA de esa fila (`laCuentaDeLaFila`), que es bajo la que se lee.
        const alcanzada = await laCuentaDeLaAccion(data.userId);
        if (!alcanzada) return { success: false, message: 'No autorizado.' };
        const cuenta = await laCuentaDeLaFila(alcanzada);

        const quien = await quienVeLoPersonal();
        if (!quien) return { success: false, message: 'No autorizado.' };

        // El servidor manda: lo que diga el navegador sobre el tipo, el nombre
        // o el mensaje se vuelve a comprobar aquí. Una respuesta de texto sin
        // texto no sale en ningún sitio de Chats, y una de flujo sin flujo no
        // hace nada al usarla.
        const workflowId = String(data.workflowId ?? '').trim() || null;
        const tipo = elTipoDeLaRespuesta({ workflowId });
        const mensaje = String(data.mensaje ?? '').trim();
        if (tipo === 'texto' && !mensaje) {
            return { success: false, message: 'El mensaje es obligatorio para una respuesta de texto.' };
        }

        const ordenes = await db.quickReply.findMany({ where: { userId: cuenta }, select: { order: true } });
        const creada = await db.quickReply.create({
            data: {
                workflowId,
                name: elNombreQueSeGuarda(data.name, tipo),
                mensaje: tipo === 'texto' ? mensaje : null,
                category: normalizeQuickReplyCategory(data.category),
                userId: cuenta,
                order: elOrdenDeUnaNueva(ordenes.map((o) => o.order)),
            },
        });
        // Lo que crea un asesor es SUYO: sus compañeros no la ven.
        if (naceSuya(quien)) {
            try {
                await marcarComoPersonal('respuesta', creada.id, quien.personaId, cuenta);
            } catch (error) {
                console.error('[respuestas] no se pudo marcar como personal; se deshace', error);
                await db.quickReply.delete({ where: { id: creada.id } }).catch(() => undefined);
                return { success: false, message: 'Error al crear el registro.' };
            }
        }
        return {
            success: true,
            message: 'Respuesta rápida creada.',
        };
    } catch (error) {
        console.error('Error al crear rr:', error);
        return {
            success: false,
            message: 'Error al crear el registro.',
        };
    }
}

export async function getAllRRsByWorkflowId(workflowId: string): Promise<RROperationResponse> {
    try {
        const list = await db.quickReply.findMany({
            where: { workflowId },
            orderBy: { createdAt: 'desc' },
        });
        // El flujo no dice de quién es, así que se acota por las filas: se
        // devuelven solo las de cuentas que esta persona alcanza.
        const suyas: QuickReply[] = [];
        for (const fila of list) {
            if (fila.userId && (await laCuentaDeLaAccion(fila.userId))) suyas.push(fila);
        }
        return {
            success: true,
            message: 'Registros obtenidos correctamente.',
            data: await soloLasQueVe(suyas),
        };
    } catch (error) {
        console.error('Error al obtener registros rr:', error);
        return {
            success: false,
            message: 'Error al obtener los registros.',
        };
    }
}

export async function updateRR(id: number, data: Partial<QuickReply>): Promise<RROperationResponse> {
    try {
        if (!(await laCuentaDeLaRespuesta(id)) || !(await laPuedeTocarQuienLlama(id))) {
            return { success: false, message: 'No autorizado.' };
        }

        // La identidad de la fila no se copia de lo que llegue del navegador.
        // Y el orden tampoco: se cambia por `guardarElOrdenDeLasRespuestasAction`,
        // que lo hace sobre la lista entera.
        const { id: _id, userId: _userId, createdAt: _createdAt, order: _order, ...cambios } = data;

        const actual = await db.quickReply.findUnique({ where: { id }, select: { workflowId: true } });
        const tipo = elTipoDeLaRespuesta({
            workflowId: 'workflowId' in cambios ? cambios.workflowId : actual?.workflowId,
        });

        // El nombre se guarda como lo teclea Chats (`elNombreQueSeGuarda`), se
        // toque por donde se toque. Y vacío es `null`: con `undefined` Prisma no
        // tocaba la columna y borrar el atajo no borraba nada.
        if ('name' in cambios) cambios.name = elNombreQueSeGuarda(cambios.name, tipo);
        if ('category' in cambios) cambios.category = normalizeQuickReplyCategory(cambios.category);

        if ('mensaje' in cambios && tipo === 'texto') {
            const mensaje = String(cambios.mensaje ?? '').trim();
            if (!mensaje) return { success: false, message: 'El mensaje no puede quedar vacío.' };
            cambios.mensaje = mensaje;
        }
        if ('workflowId' in cambios && actual?.workflowId && !String(cambios.workflowId ?? '').trim()) {
            return { success: false, message: 'Elige el flujo que ejecuta esta respuesta.' };
        }

        await db.quickReply.update({
            where: { id },
            data: cambios,
        });
        return {
            success: true,
            message: 'Registro actualizado correctamente.',
        };
    } catch (error) {
        console.error('Error al actualizar rr:', error);
        return {
            success: false,
            message: 'Error al actualizar el registro.',
        };
    }
}

export async function deleteRR(id: number): Promise<RROperationResponse> {
    try {
        if (!(await laCuentaDeLaRespuesta(id)) || !(await laPuedeTocarQuienLlama(id))) {
            return { success: false, message: 'No autorizado.' };
        }

        await db.quickReply.delete({ where: { id } });
        await olvidarLaMarca('respuesta', id);
        return {
            success: true,
            message: 'Registro eliminado correctamente.',
        };
    } catch (error) {
        console.error('Error al eliminar rr:', error);
        return {
            success: false,
            message: 'Error al eliminar el registro.',
        };
    }
}

/**
 * Guarda el orden de la lista ENTERA de una vez.
 *
 * Antes eran N llamadas —una `updateRROrder` por fila— lanzadas a la vez desde
 * el navegador, y Next serializa las acciones de una página: con cuarenta
 * respuestas eran cuarenta idas y vueltas en fila india, y el aviso decía
 * «Orden actualizado» sin mirar ni una respuesta. Ahora es una acción y **una
 * sentencia** (`UPDATE ... FROM unnest`), y si no se puede se dice.
 *
 * Lo que llega es la lista que quien arrastró tiene delante. Quien no manda no
 * ve las personales de sus compañeros, así que las que se ven se reparten los
 * huecos que ya ocupaban y **las demás no se mueven** (`elOrdenConLasDemasEnSuSitio`).
 * La puerta es la de siempre para ordenar: ver la respuesta (`laVe`).
 */
export async function guardarElOrdenDeLasRespuestasAction(
    userId: string,
    ids: number[],
): Promise<RROperationResponse> {
    try {
        const cuenta = await laCuentaDeLaAccion(userId);
        const quien = await quienVeLoPersonal();
        if (!cuenta || !quien) return { success: false, message: 'No autorizado.' };

        const pedida = comoListaDeIdsNumericos(ids);
        if (pedida.length === 0) return { success: false, message: 'No se recibió ninguna respuesta.' };

        const filas = await db.quickReply.findMany({
            where: { userId: cuenta },
            orderBy: EN_SU_ORDEN,
            select: { id: true },
        });
        const completa = filas.map((f) => f.id);
        const duenas = await lasDuenasDeRespuestas(completa);
        const queVe = new Set(completa.filter((id) => laVe(duenas.get(id), quien)));
        const ajenas = pedida.filter((id) => !queVe.has(id));
        if (ajenas.length > 0) {
            console.warn('[respuestas] se pidió ordenar respuestas que no se ven', { ajenas });
        }

        const nueva = elOrdenConLasDemasEnSuSitio(
            completa,
            pedida.filter((id) => queVe.has(id)),
        );
        const posiciones = nueva.map((_, indice) => indice);

        await db.$executeRaw`
            UPDATE "rr" AS r SET "order" = v.o
            FROM (SELECT unnest(${nueva}::int[]) AS id, unnest(${posiciones}::int[]) AS o) AS v
            WHERE r."id" = v.id AND r."userId" = ${cuenta}
        `;
        return { success: true, message: 'Orden actualizado.' };
    } catch (error) {
        console.error('[respuestas] no se pudo guardar el orden', error);
        return {
            success: false,
            message: 'No se pudo guardar el orden.',
        };
    }
}
