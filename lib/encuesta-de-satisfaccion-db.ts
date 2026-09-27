import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
    DIAS_ENTRE_ENCUESTAS,
    DIAS_PARA_RESPONDER,
    ENCUESTA_POR_DEFECTO,
    MENSAJES_QUE_SE_MIRAN,
    laRespuestaEntreLosMensajes,
    type AjustesDeLaEncuesta,
    type EstadoDeLaEncuesta,
} from "@/lib/encuesta-de-satisfaccion";

/**
 * Dónde vive la ENCUESTA DE SATISFACCIÓN: dos tablas de la App.
 *
 * - `encuesta_satisfaccion_ajustes`: una fila por CUENTA con su interruptor.
 *   Sin fila está apagada, que es lo de por defecto. Ni una columna en `User`:
 *   es del BACKEND y añadirle columnas desde aquí es lo que reventó el #360.
 * - `encuestas_satisfaccion`: una fila por encuesta mandada, con la
 *   conversación, el asesor que la tenía al resolverla y lo que contestó. Es lo
 *   que lee la ficha del contacto y el NPS del CRM.
 *
 * Sin clave foránea, como el resto de tablas de la App: borrar una conversación
 * deja la encuesta huérfana, y eso no molesta a nadie —el NPS de un mes pasado
 * no tiene por qué cambiar porque se limpió un lead—.
 */

let tablasListas: Promise<void> | null = null;

/** Solo se traga «ya existe»: con dos réplicas dos procesos pueden crear a la vez. */
async function ddl(ejecutar: () => Promise<unknown>): Promise<void> {
    try {
        await ejecutar();
    } catch (error) {
        const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
        const codigo = String(e?.meta?.code ?? e?.code ?? "");
        const texto = String(e?.message ?? "");
        const yaEstaba = ["23505", "42P07", "42710"].some((c) => codigo === c || texto.includes(c));
        if (!yaEstaba) throw error;
    }
}

function asegurarLasTablas(): Promise<void> {
    tablasListas ??= (async () => {
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "encuesta_satisfaccion_ajustes" (
                "cuentaId" TEXT PRIMARY KEY,
                "activa" BOOLEAN NOT NULL DEFAULT FALSE,
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "encuestas_satisfaccion" (
                "id" TEXT PRIMARY KEY,
                "cuentaId" TEXT NOT NULL,
                "sessionId" INTEGER NOT NULL,
                "instanceName" TEXT NOT NULL,
                "remoteJid" TEXT NOT NULL,
                "identidades" TEXT[] NOT NULL DEFAULT '{}',
                "asesorId" TEXT,
                "estado" TEXT NOT NULL,
                "motivo" TEXT,
                "puntuacion" INTEGER,
                "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "enviadaEn" TIMESTAMP(3),
                "respondidaEn" TIMESTAMP(3)
            )
        `);
        // La ficha pregunta por UNA conversación, la más reciente primero.
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "encuestas_satisfaccion_sesion_idx"
            ON "encuestas_satisfaccion" ("sessionId", "creadaEn" DESC)
        `);
        // El NPS pregunta por cuentas y un rango de fechas.
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "encuestas_satisfaccion_cuenta_idx"
            ON "encuestas_satisfaccion" ("cuentaId", "enviadaEn")
        `);
    })().catch((error) => {
        tablasListas = null;
        throw error;
    });
    return tablasListas;
}

/** En una consulta en crudo el `42P01` de Postgres viaja en `meta.code`. */
function esTablaQueFalta(error: unknown): boolean {
    const e = error as { code?: string; meta?: { code?: string }; message?: string };
    return e?.meta?.code === "42P01" || e?.code === "42P01" || Boolean(e?.message?.includes("42P01"));
}

/**
 * El recuerdo de «ya las creé» es del proceso, no de la base: si las tablas se
 * van por debajo se olvida, se crean y se reintenta UNA vez.
 */
async function conLasTablas<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLasTablas();
    try {
        return await hacer();
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        tablasListas = null;
        await asegurarLasTablas();
        return hacer();
    }
}

/* ── Ajustes ─────────────────────────────────────────────────────────── */

/** Nunca falla: si no se puede leer, apagada — no se manda nada que nadie pidió. */
export async function leerLosAjustesDeLaEncuesta(cuentaId: string): Promise<AjustesDeLaEncuesta> {
    try {
        const filas = await conLasTablas(() => db.$queryRaw<{ activa: boolean }[]>`
            SELECT "activa" FROM "encuesta_satisfaccion_ajustes" WHERE "cuentaId" = ${cuentaId}
        `);
        return { activa: filas[0]?.activa === true };
    } catch (error) {
        console.warn("[encuesta] no se pudieron leer los ajustes", { cuentaId, error: String(error) });
        return { ...ENCUESTA_POR_DEFECTO };
    }
}

export async function guardarLosAjustesDeLaEncuesta(cuentaId: string, activa: boolean): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        INSERT INTO "encuesta_satisfaccion_ajustes" ("cuentaId", "activa", "actualizadoEn")
        VALUES (${cuentaId}, ${activa}, NOW())
        ON CONFLICT ("cuentaId") DO UPDATE SET "activa" = EXCLUDED."activa", "actualizadoEn" = NOW()
    `);
}

/* ── Encuestas ───────────────────────────────────────────────────────── */

export type ReservaDeEncuesta = {
    cuentaId: string;
    sessionId: number;
    instanceName: string;
    remoteJid: string;
    identidades: string[];
    asesorId: string | null;
};

/**
 * Reserva la encuesta de una conversación, o `null` si ya tiene una reciente.
 *
 * Contar y apuntar van en UNA transacción con un candado por conversación: un
 * `INSERT … WHERE NOT EXISTS` suelto no basta en READ COMMITTED —dos «Resolver»
 * a la vez, o el lote y el botón, verían los dos que no hay ninguna y el
 * cliente recibiría la pregunta dos veces—. Una `fallida` no cuenta: no le
 * llegó, así que no hay nada que repetir.
 */
export async function reservarLaEncuesta(reserva: ReservaDeEncuesta): Promise<string | null> {
    const id = randomUUID();
    return conLasTablas(() =>
        db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"encuesta:" + reserva.sessionId}))`;
            const hay = await tx.$queryRaw<{ n: number }[]>`
                SELECT COUNT(*)::int AS n FROM "encuestas_satisfaccion"
                WHERE "sessionId" = ${reserva.sessionId}
                  AND "estado" <> 'fallida'
                  AND "creadaEn" > NOW() - make_interval(days => ${DIAS_ENTRE_ENCUESTAS}::int)
            `;
            if ((hay[0]?.n ?? 0) > 0) return null;
            await tx.$executeRaw`
                INSERT INTO "encuestas_satisfaccion"
                    ("id", "cuentaId", "sessionId", "instanceName", "remoteJid", "identidades", "asesorId", "estado")
                VALUES (${id}, ${reserva.cuentaId}, ${reserva.sessionId}, ${reserva.instanceName},
                        ${reserva.remoteJid}, ${reserva.identidades}::text[], ${reserva.asesorId}, 'pendiente')
            `;
            return id;
        }),
    );
}

/** Salió: desde aquí se cuenta la respuesta. `enviadaEn` es la hora de ANTES de mandar. */
export async function marcarLaEncuestaEnviada(id: string, enviadaEn: Date): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        UPDATE "encuestas_satisfaccion" SET "estado" = 'enviada', "enviadaEn" = ${enviadaEn}, "motivo" = NULL
        WHERE "id" = ${id}
    `);
}

/** No salió, y se dice por qué. No bloquea mandar otra más adelante. */
export async function marcarLaEncuestaFallida(id: string, motivo: string): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        UPDATE "encuestas_satisfaccion" SET "estado" = 'fallida', "motivo" = ${motivo.slice(0, 500)}
        WHERE "id" = ${id}
    `);
}

type FilaPendiente = {
    id: string;
    cuentaId: string;
    instanceName: string;
    identidades: string[];
    enviadaEn: Date;
};

type FilaDeMensaje = { content: string | null; messageTimestamp: Date };

/**
 * Los mensajes del cliente detrás de la pregunta, dentro de la ventana.
 *
 * Por las TRES identidades del contacto, en tres ramas con `UNION ALL`: un
 * contacto se guarda bajo la que devolvió el proveedor esa vuelta, y un `OR`
 * sobre las tres columnas en el mismo `WHERE` deja la consulta sin índice y
 * recorre `chat_messages` entera. Cada rama lleva su propio `LIMIT`.
 */
async function losMensajesDetrasDeLaPregunta(e: FilaPendiente): Promise<FilaDeMensaje[]> {
    const hasta = new Date(e.enviadaEn.getTime() + DIAS_PARA_RESPONDER * 86_400_000);
    const tope = MENSAJES_QUE_SE_MIRAN;
    const rama = (columna: "remoteJid" | "remoteJidAlt" | "senderPn") => Prisma.sql`
        (SELECT m."content", m."messageTimestamp", m."messageId"
         FROM "chat_messages" m
         WHERE m."userId" = ${e.cuentaId}
           AND m."instanceName" = ${e.instanceName}
           AND m.${Prisma.raw(`"${columna}"`)} = ANY(${e.identidades}::text[])
           AND m."fromMe" = FALSE
           AND m."messageTimestamp" > ${e.enviadaEn}
           AND m."messageTimestamp" <= ${hasta}
         ORDER BY m."messageTimestamp" ASC
         LIMIT ${tope})
    `;
    const filas = await db.$queryRaw<(FilaDeMensaje & { messageId: string })[]>`
        ${rama("remoteJid")} UNION ALL ${rama("remoteJidAlt")} UNION ALL ${rama("senderPn")}
    `;
    // La misma fila puede salir por dos ramas (remoteJid y senderPn iguales).
    const vistos = new Set<string>();
    return filas.filter((f) => {
        const clave = `${f.messageId}|${f.messageTimestamp.getTime()}`;
        if (vistos.has(clave)) return false;
        vistos.add(clave);
        return true;
    });
}

/** Cuántas pendientes se miran por vuelta: una consulta corta cada una. */
const PENDIENTES_POR_VUELTA = 200;

/**
 * Recoge las respuestas: por cada encuesta `enviada` mira los mensajes del
 * cliente y se queda con la primera puntuación válida. Pasada la ventana sin
 * ninguna, la cierra como `sin_respuesta`.
 *
 * **La App no recibe los webhooks de WhatsApp** —los recibe el backend, que
 * guarda cada mensaje en `chat_messages`—, así que la respuesta no «llega»: se
 * va a buscar. Se hace al LEER (el NPS del CRM, la ficha del contacto) y en el
 * barrido diario, que es lo que cierra las que nadie mira. Es idempotente: el
 * `UPDATE` va condicionado a que siga `enviada`.
 */
export async function recogerLasRespuestas(filtro: {
    cuentas?: readonly string[];
    sessionId?: number;
}, ahora: Date = new Date()): Promise<{ respondidas: number; cerradas: number }> {
    const resultado = { respondidas: 0, cerradas: 0 };
    let pendientes: FilaPendiente[] = [];
    try {
        pendientes = await conLasTablas(() => {
            if (filtro.sessionId !== undefined) {
                return db.$queryRaw<FilaPendiente[]>`
                    SELECT "id", "cuentaId", "instanceName", "identidades", "enviadaEn"
                    FROM "encuestas_satisfaccion"
                    WHERE "estado" = 'enviada' AND "sessionId" = ${filtro.sessionId}
                    ORDER BY "enviadaEn" ASC LIMIT ${PENDIENTES_POR_VUELTA}
                `;
            }
            if (filtro.cuentas) {
                if (filtro.cuentas.length === 0) return Promise.resolve([]);
                return db.$queryRaw<FilaPendiente[]>`
                    SELECT "id", "cuentaId", "instanceName", "identidades", "enviadaEn"
                    FROM "encuestas_satisfaccion"
                    WHERE "estado" = 'enviada' AND "cuentaId" = ANY(${[...filtro.cuentas]}::text[])
                    ORDER BY "enviadaEn" ASC LIMIT ${PENDIENTES_POR_VUELTA}
                `;
            }
            return db.$queryRaw<FilaPendiente[]>`
                SELECT "id", "cuentaId", "instanceName", "identidades", "enviadaEn"
                FROM "encuestas_satisfaccion"
                WHERE "estado" = 'enviada'
                ORDER BY "enviadaEn" ASC LIMIT ${PENDIENTES_POR_VUELTA}
            `;
        });
    } catch (error) {
        console.warn("[encuesta] no se pudieron leer las pendientes", String(error));
        return resultado;
    }

    for (const e of pendientes) {
        try {
            const mensajes = await losMensajesDetrasDeLaPregunta(e);
            const respuesta = laRespuestaEntreLosMensajes(
                mensajes.map((m) => ({ texto: m.content, cuando: m.messageTimestamp })),
            );
            if (respuesta) {
                const n = await db.$executeRaw`
                    UPDATE "encuestas_satisfaccion"
                    SET "estado" = 'respondida', "puntuacion" = ${respuesta.puntuacion},
                        "respondidaEn" = ${respuesta.cuando}
                    WHERE "id" = ${e.id} AND "estado" = 'enviada'
                `;
                resultado.respondidas += n;
                continue;
            }
            // Se cierra por dos lados: pasó la ventana, o el cliente ya escribió
            // los mensajes que se miran y ninguno era una puntuación —lo que
            // venga detrás es conversación, no respuesta—.
            const cierra =
                mensajes.length >= MENSAJES_QUE_SE_MIRAN ||
                e.enviadaEn.getTime() + DIAS_PARA_RESPONDER * 86_400_000 < ahora.getTime();
            if (cierra) {
                const n = await db.$executeRaw`
                    UPDATE "encuestas_satisfaccion" SET "estado" = 'sin_respuesta'
                    WHERE "id" = ${e.id} AND "estado" = 'enviada'
                `;
                resultado.cerradas += n;
            }
        } catch (error) {
            // Una que falla no puede dejar sin mirar a las de detrás.
            console.warn("[encuesta] no se pudo mirar la respuesta", { id: e.id, error: String(error) });
        }
    }
    return resultado;
}

export type EncuestaDeLaFicha = {
    id: string;
    estado: EstadoDeLaEncuesta;
    puntuacion: number | null;
    asesorId: string | null;
    enviadaEn: Date | null;
    respondidaEn: Date | null;
    creadaEn: Date;
    motivo: string | null;
};

/** Las encuestas de una conversación, la más reciente primero. Sin puerta: la pone quien llama. */
export async function lasEncuestasDeLaSesion(sessionId: number, tope = 10): Promise<EncuestaDeLaFicha[]> {
    return conLasTablas(() => db.$queryRaw<EncuestaDeLaFicha[]>`
        SELECT "id", "estado", "puntuacion", "asesorId", "enviadaEn", "respondidaEn", "creadaEn", "motivo"
        FROM "encuestas_satisfaccion"
        WHERE "sessionId" = ${sessionId}
        ORDER BY "creadaEn" DESC
        LIMIT ${tope}
    `);
}

export type FilasDelNps = {
    respondidas: { asesorId: string | null; puntuacion: number }[];
    enviadas: number;
};

/**
 * Lo que alimenta el NPS: las respondidas del rango y cuántas se mandaron. Por
 * la fecha de ENVÍO, las dos: si una se contara por cuándo se contestó y la
 * otra por cuándo salió, la tasa de respuesta mezclaría dos periodos.
 */
export async function lasFilasDelNps(cuentas: readonly string[], desde: Date): Promise<FilasDelNps> {
    if (cuentas.length === 0) return { respondidas: [], enviadas: 0 };
    return conLasTablas(async () => {
        const lista = [...cuentas];
        const [respondidas, enviadas] = await Promise.all([
            db.$queryRaw<{ asesorId: string | null; puntuacion: number }[]>`
                SELECT "asesorId", "puntuacion"
                FROM "encuestas_satisfaccion"
                WHERE "cuentaId" = ANY(${lista}::text[]) AND "estado" = 'respondida'
                  AND "enviadaEn" >= ${desde} AND "puntuacion" IS NOT NULL
            `,
            db.$queryRaw<{ n: number }[]>`
                SELECT COUNT(*)::int AS n
                FROM "encuestas_satisfaccion"
                WHERE "cuentaId" = ANY(${lista}::text[])
                  AND "estado" IN ('enviada', 'respondida', 'sin_respuesta')
                  AND "enviadaEn" >= ${desde}
            `,
        ]);
        return { respondidas, enviadas: enviadas[0]?.n ?? 0 };
    });
}
