"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import { clientesDeLaCuenta } from "@/lib/cuentas-cliente";
import {
    TOPE_DE_MINUTOS,
    type CierreConTiempo,
} from "@/lib/tiempo-de-tarea";

/**
 * El trabajo de una tarea: a qué cuenta se le dedica y cuánto costó.
 *
 * ## Por qué es una tabla aparte y no dos columnas en `tasks`
 *
 * `tasks` es del BACKEND —lo dice `docs/db-migrations-ownership.md` y el propio
 * comentario del modelo— y añadirle columnas desde la App es lo que reventó el
 * #360: si la App despliega antes con la columna declarada, **toda** consulta a
 * `tasks` empieza a fallar. Así que va como `task_comments` y `task_alerts`:
 * tabla de la App, `CREATE TABLE IF NOT EXISTS`, **sin clave foránea** —una
 * `FOREIGN KEY` desde aquí ataría las dos migraciones—.
 *
 * Una fila por tarea, con la tarea como clave primaria: las dos cosas que
 * guarda son de la tarea y no hay historia que llevar.
 *
 * ## Y por qué «cliente» no es ninguno de los campos que ya había
 *
 * `tasks` parece tener con qué y no lo tiene:
 *
 * - `ownerId` es la cuenta **dueña** de la tarea —de quién es la agenda—, no la
 *   cuenta a la que se le dedica el rato. En la casa son todas la misma.
 * - `sessionId` / `contactJid` son un **contacto de WhatsApp**, un lead. Un
 *   cliente de la plataforma es otra cosa: una fila de `User`.
 *
 * Usar cualquiera de los dos habría dado un número que parece bueno y mide otra
 * cosa. Es un campo nuevo, y opcional a propósito: hay tareas internas que no
 * son de ningún cliente y forzarlas a elegir uno ensuciaría el reparto.
 *
 * ## Quién cerró la tarea NO estaba guardado
 *
 * Los dos caminos que cierran —el botón de Tareas (`completeTaskAction`) y
 * arrastrar a «Hecho» en el tablero (`moveProjectTaskAction`)— escribían
 * `status: "done"` y nada más. Quién lo hizo se sabía en ese instante y se
 * tiraba.
 *
 * Y **no vale `assignedToId`**: un administrador cierra tareas de otros, y
 * desde el tablero puede mover cualquiera. Medir por el asignado le atribuiría
 * el rato a quien no lo hizo, que es justo lo que esta función viene a contar.
 */

let laTablaEstaHecha: Promise<void> | null = null;

function asegurarLaTabla(): Promise<void> {
    laTablaEstaHecha ??= (async () => {
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "task_work" (
                "taskId" INTEGER PRIMARY KEY,
                -- La cuenta se copia aqui para poder acotar sin unir con
                -- "tasks" en cada consulta, igual que en comentarios y avisos.
                "ownerId" TEXT NOT NULL,
                -- La cuenta de la plataforma a la que se le dedica. NULL =
                -- tarea interna, que es un caso normal y no un hueco.
                "clienteId" TEXT,
                -- SIEMPRE en minutos. La unidad con la que se escribio no se
                -- guarda: se vuelve a elegir sola al enseñarlo.
                "minutos" INTEGER,
                "cerradaPorId" TEXT,
                "cerradaPorNombre" TEXT,
                "cerradaEn" TIMESTAMP(3),
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "task_work_owner_cerrada_idx"
            ON "task_work" ("ownerId", "cerradaEn")
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "task_work_owner_cliente_idx"
            ON "task_work" ("ownerId", "clienteId")
        `;
    })();
    return laTablaEstaHecha;
}

/**
 * El `42P01` de Postgres NO está donde parece: en una consulta en crudo el
 * `code` de primer nivel es el de Prisma (`P2010`) y el de Postgres viaja
 * dentro, en `meta.code`. Preguntando por `error.code` el reintento no se
 * dispara nunca.
 */
function esTablaQueFalta(error: unknown): boolean {
    const meta = (error as { meta?: { code?: string } } | null)?.meta;
    if (meta?.code === "42P01") return true;
    const texto = error instanceof Error ? error.message : String(error);
    return texto.includes("42P01");
}

async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
    try {
        await asegurarLaTabla();
        return await hacer();
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        // El recuerdo de «ya la creé» es del proceso, no de la base.
        laTablaEstaHecha = null;
        await asegurarLaTabla();
        return hacer();
    }
}

/**
 * Anota a qué cuenta se le dedica una tarea. `null` la deja como interna.
 *
 * Es una escritura del día a día y **no puede tumbar nada**: se llama al
 * guardar la tarea, y la tarea ya está guardada cuando llega aquí.
 */
export async function guardarElClienteDeLaTarea(
    taskId: number,
    ownerId: string,
    clienteId: string | null,
): Promise<{ success: boolean }> {
    try {
        await conLaTabla(async () => {
            await db.$executeRaw`
                INSERT INTO "task_work" ("taskId", "ownerId", "clienteId")
                VALUES (${taskId}, ${ownerId}, ${clienteId})
                ON CONFLICT ("taskId") DO UPDATE
                SET "clienteId" = EXCLUDED."clienteId",
                    "actualizadoEn" = CURRENT_TIMESTAMP
            `;
        });
        return { success: true };
    } catch (error) {
        console.warn("[trabajo] no se pudo guardar el cliente de la tarea", {
            taskId,
            error: error instanceof Error ? error.message : String(error),
        });
        return { success: false };
    }
}

/**
 * Sella el cierre: cuánto costó y **quién lo cerró**.
 *
 * `minutos` ya viene convertido (`aMinutos`), pero se vuelve a acotar aquí: una
 * acción de servidor no puede fiarse de que el número llegue sano del
 * navegador, y un valor absurdo envenena todas las sumas de esa persona.
 *
 * El `ON CONFLICT` **conserva el `clienteId`** que ya hubiera: cerrar una tarea
 * no es cambiarle el cliente, y pisarlo con un nulo sacaría del reparto a la
 * cuenta a la que se le dedicó el rato.
 */
export async function registrarElCierre(args: {
    taskId: number;
    ownerId: string;
    minutos: number;
    cerradaPorId: string;
    cerradaPorNombre: string | null;
}): Promise<{ success: boolean }> {
    const minutos = Math.max(1, Math.min(Math.round(args.minutos), TOPE_DE_MINUTOS));

    try {
        await conLaTabla(async () => {
            await db.$executeRaw`
                INSERT INTO "task_work"
                    ("taskId", "ownerId", "minutos", "cerradaPorId", "cerradaPorNombre", "cerradaEn")
                VALUES (${args.taskId}, ${args.ownerId}, ${minutos},
                        ${args.cerradaPorId}, ${args.cerradaPorNombre}, CURRENT_TIMESTAMP)
                ON CONFLICT ("taskId") DO UPDATE
                SET "minutos" = EXCLUDED."minutos",
                    "cerradaPorId" = EXCLUDED."cerradaPorId",
                    "cerradaPorNombre" = EXCLUDED."cerradaPorNombre",
                    "cerradaEn" = EXCLUDED."cerradaEn",
                    "actualizadoEn" = CURRENT_TIMESTAMP
            `;
        });
        return { success: true };
    } catch (error) {
        // Sin esto, un fallo aquí se ve como un tiempo que no se guardó y nadie
        // sabe por qué. La tarea ya está cerrada: esto no puede deshacerlo.
        console.warn("[trabajo] no se pudo registrar el cierre de la tarea", {
            taskId: args.taskId,
            error: error instanceof Error ? error.message : String(error),
        });
        return { success: false };
    }
}

/**
 * Guarda el cliente de una tarea desde el navegador.
 *
 * `guardarElClienteDeLaTarea` recibe el `ownerId` porque la llaman sitios que
 * ya lo tienen resuelto; **esta no lo acepta de fuera**, lo resuelve ella. Un
 * `ownerId` que llegue del navegador es un id que decide de quién es el dato, y
 * eso no se acepta tal cual —es la regla de siempre: ninguna acción usa un id
 * que le llega sin comprobar de quién es—.
 */
export async function guardarElClienteDeLaTareaAction(
    taskId: number,
    clienteId: string | null,
): Promise<{ success: boolean }> {
    const user = await currentUser();
    if (!user?.id) return { success: false };
    const ownerId = user.ownerId ?? user.id;

    // Y la tarea tiene que ser de esta cuenta. Sin esto, cualquiera con sesión
    // podría anotarle un cliente a la tarea de otra cuenta con solo acertar el
    // número.
    const suya = await db.task.findFirst({
        where: { id: taskId, ownerId },
        select: { id: true },
    });
    if (!suya) {
        console.warn("[trabajo] se pidió anotar el cliente de una tarea ajena", { taskId });
        return { success: false };
    }

    return guardarElClienteDeLaTarea(taskId, ownerId, clienteId);
}

/**
 * Las cuentas a las que se le puede atribuir una tarea.
 *
 * Sale de `clientesDeLaCuenta`, que es la misma pregunta que ya contestan
 * repartir clientes entre el equipo y elegir a quién se le enseña un diagrama.
 * Si esto tuviera su propia lista acabaría diciendo otra cosa que las demás.
 */
export async function clientesParaLaTareaAction(): Promise<
    { id: string; nombre: string }[]
> {
    try {
        const user = await currentUser();
        if (!user?.id) return [];
        const cuenta = await cuentaQueManda(user);
        const clientes = await clientesDeLaCuenta({ id: cuenta.id, role: cuenta.role });
        return clientes.map((c) => ({
            id: c.id,
            nombre: c.company?.trim() || c.name?.trim() || c.email,
        }));
    } catch (error) {
        console.warn("[trabajo] no se pudieron leer las cuentas para la tarea", {
            error: error instanceof Error ? error.message : String(error),
        });
        return [];
    }
}

/** El cliente que ya tiene cada tarea, para pintar el desplegable. */
export async function leerLosClientesDeLasTareas(
    ownerId: string,
    taskIds: number[],
): Promise<Record<number, string | null>> {
    if (!taskIds.length) return {};
    try {
        return await conLaTabla(async () => {
            const filas = await db.$queryRaw<{ taskId: number; clienteId: string | null }[]>`
                SELECT "taskId", "clienteId" FROM "task_work"
                WHERE "ownerId" = ${ownerId} AND "taskId" = ANY(${taskIds}::int[])
            `;
            return Object.fromEntries(filas.map((f) => [f.taskId, f.clienteId]));
        });
    } catch (error) {
        console.warn("[trabajo] no se pudieron leer los clientes de las tareas", {
            error: error instanceof Error ? error.message : String(error),
        });
        return {};
    }
}

/**
 * El reparto del trabajo: por cuenta y por persona.
 *
 * **Solo para quien administra la cuenta.** La marca de las ocho horas no la ve
 * la persona a la que le toca, que es parte del encargo: es un dato de gestión,
 * y enseñárselo a quien lo produce lo convierte en otra cosa. La puerta está
 * aquí, en la consulta, y no en la pantalla.
 */
export async function leerElTrabajo(): Promise<{ cierres: CierreConTiempo[] } | null> {
    const user = await currentUser();
    if (!user?.id) return null;
    if (!canManageWorkspace(user)) return null;

    const ownerId = user.ownerId ?? user.id;

    try {
        return await conLaTabla(async () => {
            const filas = await db.$queryRaw<
                {
                    taskId: number;
                    personaId: string;
                    personaNombre: string | null;
                    clienteId: string | null;
                    clienteNombre: string | null;
                    minutos: number;
                    cerradaEn: Date;
                }[]
            >`
                SELECT
                    w."taskId",
                    w."cerradaPorId" AS "personaId",
                    COALESCE(NULLIF(TRIM(w."cerradaPorNombre"), ''),
                             NULLIF(TRIM(p."name"), ''), p."email") AS "personaNombre",
                    w."clienteId",
                    COALESCE(NULLIF(TRIM(c."name"), ''), c."email") AS "clienteNombre",
                    w."minutos",
                    w."cerradaEn"
                FROM "task_work" w
                LEFT JOIN "User" p ON p."id" = w."cerradaPorId"
                LEFT JOIN "User" c ON c."id" = w."clienteId"
                WHERE w."ownerId" = ${ownerId}
                  AND w."cerradaEn" IS NOT NULL
                  AND w."minutos" IS NOT NULL
                  AND w."cerradaPorId" IS NOT NULL
            `;

            return {
                cierres: filas.map((f) => ({
                    taskId: f.taskId,
                    personaId: f.personaId,
                    personaNombre: f.personaNombre,
                    clienteId: f.clienteId,
                    clienteNombre: f.clienteNombre,
                    minutos: f.minutos,
                    cerradaEn: f.cerradaEn.toISOString(),
                })),
            };
        });
    } catch (error) {
        console.warn("[trabajo] no se pudo leer el reparto del trabajo", {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
