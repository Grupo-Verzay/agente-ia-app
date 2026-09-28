import "server-only";

import { db } from "@/lib/db";
import type { Actualizacion, ArchivoDeActualizacion, ComoSeCerro } from "@/lib/actualizaciones";

/**
 * Dónde viven las ACTUALIZACIONES: dos tablas de la App, con
 * `CREATE TABLE IF NOT EXISTS` y **sin clave foránea**. Ni una columna en
 * `User`: esa es del BACKEND y añadirle columnas desde aquí es lo que reventó
 * el #360.
 *
 * - `actualizaciones`: lo publicado. Retirar una la BORRA junto con sus marcas
 *   de vista: una actualización retirada no tiene que saltarle a nadie.
 * - `actualizaciones_vistas`: `(personaId, actualizacionId)` como clave
 *   primaria. «Una sola vez por persona» no es una decisión de la pantalla que
 *   dos pestañas puedan saltarse: es la forma de la tabla.
 *
 * Por la PERSONA (`laPersonaQueActua`), no por la cuenta: dentro de una cuenta
 * ajena con «Ingresar» la ventana ya vista sigue vista, y a cada persona del
 * equipo le sale la suya.
 */

let tablasListas: Promise<void> | null = null;

/** Solo se traga «ya existe»: dos réplicas pueden crear la tabla a la vez. */
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
            CREATE TABLE IF NOT EXISTS "actualizaciones" (
                "id" TEXT PRIMARY KEY,
                "texto" TEXT NOT NULL,
                "archivoUrl" TEXT,
                "archivoNombre" TEXT,
                "archivoMime" TEXT,
                "archivoTamano" BIGINT NOT NULL DEFAULT 0,
                "publicadaPorId" TEXT,
                "publicadaPorNombre" TEXT,
                "publicadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "actualizaciones_publicada_idx"
            ON "actualizaciones" ("publicadaEn" DESC)
        `);
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "actualizaciones_vistas" (
                "personaId" TEXT NOT NULL,
                "actualizacionId" TEXT NOT NULL,
                "como" TEXT NOT NULL,
                "vistaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY ("personaId", "actualizacionId")
            )
        `);
    })().catch((error) => {
        tablasListas = null;
        throw error;
    });
    return tablasListas;
}

function esTablaQueFalta(error: unknown): boolean {
    const e = error as { code?: string; meta?: { code?: string }; message?: string };
    return e?.meta?.code === "42P01" || e?.code === "42P01" || Boolean(e?.message?.includes("42P01"));
}

async function conLasTablas<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLasTablas();
    try {
        return await hacer();
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        // El recuerdo de «ya las creé» es del proceso, no de la base.
        tablasListas = null;
        await asegurarLasTablas();
        return hacer();
    }
}

type Fila = {
    id: string;
    texto: string;
    archivoUrl: string | null;
    archivoNombre: string | null;
    archivoMime: string | null;
    archivoTamano: bigint | number | null;
    publicadaPorNombre: string | null;
    publicadaEn: Date;
};

function comoActualizacion(f: Fila): Actualizacion {
    const archivo: ArchivoDeActualizacion | null = f.archivoUrl
        ? {
              url: f.archivoUrl,
              nombre: f.archivoNombre ?? "archivo",
              mime: f.archivoMime,
              tamano: Number(f.archivoTamano ?? 0) || 0,
          }
        : null;
    return {
        id: f.id,
        texto: f.texto,
        archivo,
        publicadaEn: new Date(f.publicadaEn).toISOString(),
        publicadaPor: f.publicadaPorNombre,
    };
}

/** Las publicadas, la más reciente primero. */
export async function lasActualizaciones(tope = 50): Promise<Actualizacion[]> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Fila[]>`
            SELECT "id", "texto", "archivoUrl", "archivoNombre", "archivoMime",
                   "archivoTamano", "publicadaPorNombre", "publicadaEn"
            FROM "actualizaciones"
            ORDER BY "publicadaEn" DESC, "id" DESC
            LIMIT ${tope}
        `;
        return filas.map(comoActualizacion);
    });
}

export async function publicarActualizacion(datos: {
    id: string;
    texto: string;
    archivo: ArchivoDeActualizacion | null;
    publicadaPorId: string;
    publicadaPorNombre: string | null;
}): Promise<Actualizacion> {
    return conLasTablas(async () => {
        const a = datos.archivo;
        const filas = await db.$queryRaw<Fila[]>`
            INSERT INTO "actualizaciones"
                ("id", "texto", "archivoUrl", "archivoNombre", "archivoMime", "archivoTamano",
                 "publicadaPorId", "publicadaPorNombre", "publicadaEn")
            VALUES (${datos.id}, ${datos.texto}, ${a?.url ?? null}, ${a?.nombre ?? null},
                    ${a?.mime ?? null}, ${a?.tamano ?? 0}, ${datos.publicadaPorId},
                    ${datos.publicadaPorNombre}, CURRENT_TIMESTAMP)
            RETURNING "id", "texto", "archivoUrl", "archivoNombre", "archivoMime",
                      "archivoTamano", "publicadaPorNombre", "publicadaEn"
        `;
        return comoActualizacion(filas[0]);
    });
}

/** Retira una actualización: la fila y sus marcas, en una transacción. */
export async function retirarActualizacion(id: string): Promise<boolean> {
    return conLasTablas(async () => {
        const [, borradas] = await db.$transaction([
            db.$executeRaw`DELETE FROM "actualizaciones_vistas" WHERE "actualizacionId" = ${id}`,
            db.$executeRaw`DELETE FROM "actualizaciones" WHERE "id" = ${id}`,
        ]);
        return Number(borradas) > 0;
    });
}

/**
 * La que le toca ver a esta persona, en UNA consulta: la más reciente, y solo
 * si no tiene marca. Es la misma regla que `laActualizacionPendiente` (pura),
 * escrita en SQL para no traerse la lista entera en cada apertura de la
 * plataforma; el banco comprueba que las dos dicen lo mismo.
 */
export async function laPendienteDe(personaId: string): Promise<Actualizacion | null> {
    if (!personaId) return null;
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Fila[]>`
            SELECT a."id", a."texto", a."archivoUrl", a."archivoNombre", a."archivoMime",
                   a."archivoTamano", a."publicadaPorNombre", a."publicadaEn"
            FROM (
                SELECT * FROM "actualizaciones"
                ORDER BY "publicadaEn" DESC, "id" DESC
                LIMIT 1
            ) a
            WHERE NOT EXISTS (
                SELECT 1 FROM "actualizaciones_vistas" v
                WHERE v."personaId" = ${personaId} AND v."actualizacionId" = a."id"
            )
        `;
        return filas[0] ? comoActualizacion(filas[0]) : null;
    });
}

/**
 * Apunta que esta persona ya la vio o la cerró. `ON CONFLICT DO NOTHING`: dos
 * pestañas cerrando a la vez escriben una sola fila, y la primera manera de
 * despedirse es la que queda.
 */
export async function marcarVista(personaId: string, actualizacionId: string, como: ComoSeCerro): Promise<void> {
    if (!personaId || !actualizacionId) return;
    await conLasTablas(async () => {
        await db.$executeRaw`
            INSERT INTO "actualizaciones_vistas" ("personaId", "actualizacionId", "como", "vistaEn")
            SELECT ${personaId}, "id", ${como}, CURRENT_TIMESTAMP
            FROM "actualizaciones" WHERE "id" = ${actualizacionId}
            ON CONFLICT ("personaId", "actualizacionId") DO NOTHING
        `;
    });
}

/** Cuántas personas la vieron o la cerraron. Para la lista de la pantalla. */
export async function cuantasLaVieron(ids: string[]): Promise<Record<string, number>> {
    if (!ids.length) return {};
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<{ actualizacionId: string; n: bigint }[]>`
            SELECT "actualizacionId", COUNT(*)::bigint AS n
            FROM "actualizaciones_vistas"
            WHERE "actualizacionId" = ANY(${ids}::text[])
            GROUP BY "actualizacionId"
        `;
        return Object.fromEntries(filas.map((f) => [f.actualizacionId, Number(f.n)]));
    });
}
