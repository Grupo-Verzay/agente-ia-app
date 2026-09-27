import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureResolvedAtColumn } from "@/lib/session-resolved";
import { laMencionSigueVigente } from "@/lib/acceso-por-mencion";

/**
 * Dónde vive el acceso por mención: `acceso_por_mencion`, una fila por
 * (conversación, persona).
 *
 * Tabla de la App con `CREATE TABLE IF NOT EXISTS` y **sin clave foránea**.
 * Ni una columna en `Session`: es del BACKEND y añadirle columnas desde aquí es
 * lo que reventó el #360. Y **no** es `session_participants`: aquella es de
 * quien se agrega a mano y no caduca; esto se va solo al resolver. Mezclarlas
 * haría que resolver se llevara también a los participantes de siempre.
 */

let tablaLista: Promise<void> | null = null;

/** Solo se traga «ya existe»: con dos réplicas el `IF NOT EXISTS` no basta. */
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

function asegurarLaTabla(): Promise<void> {
    tablaLista ??= (async () => {
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "acceso_por_mencion" (
                "sessionId" INTEGER NOT NULL,
                "personaId" TEXT NOT NULL,
                "otorgadoPorId" TEXT,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY ("sessionId", "personaId")
            )
        `);
        // Para «¿qué conversaciones me abrieron?» sin recorrer la tabla.
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "acceso_por_mencion_persona_idx"
            ON "acceso_por_mencion" ("personaId")
        `);
        await ensureResolvedAtColumn();
    })().catch((error) => {
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

/** En una consulta en crudo el código de Postgres viaja en `meta.code`. */
function codigoDePostgres(error: unknown): string {
    const e = error as { code?: string; meta?: { code?: string }; message?: string };
    const codigo = e?.meta?.code ?? e?.code ?? "";
    if (codigo === "42P01" || codigo === "42703") return codigo;
    const texto = String(e?.message ?? "");
    return texto.includes("42P01") ? "42P01" : texto.includes("42703") ? "42703" : codigo;
}

/**
 * Reintenta UNA vez si falta la tabla (`42P01`) o la columna `resolved_at`
 * (`42703`). Los dos recuerdos —«ya creé la tabla», «ya puse la columna»— son
 * del proceso, no de la base: si alguien los quita por debajo, sin esto cada
 * consulta fallaría hasta reiniciar, y la puerta del invitado se cerraría sola.
 */
async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLaTabla();
    try {
        return await hacer();
    } catch (error) {
        const codigo = codigoDePostgres(error);
        if (codigo === "42P01") {
            tablaLista = null;
            await asegurarLaTabla();
        } else if (codigo === "42703") {
            await db.$executeRawUnsafe('ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP(3)');
        } else {
            throw error;
        }
        return hacer();
    }
}

/**
 * Da acceso. Volver a mencionar a alguien **renueva la fecha**: si la
 * conversación se resolvió y se reabrió, una mención nueva vuelve a abrirle la
 * puerta — que es lo que se espera al volver a pedirle ayuda.
 */
export async function darAccesoPorMencion(
    sessionId: number,
    personas: readonly string[],
    otorgadoPorId: string,
): Promise<number> {
    if (!personas.length) return 0;
    return conLaTabla(() => db.$executeRaw`
        INSERT INTO "acceso_por_mencion" ("sessionId", "personaId", "otorgadoPorId", "creadoEn")
        VALUES ${Prisma.join(
            personas.map((p) => Prisma.sql`(${sessionId}, ${p}, ${otorgadoPorId}, CURRENT_TIMESTAMP)`),
        )}
        ON CONFLICT ("sessionId", "personaId") DO UPDATE
            SET "otorgadoPorId" = EXCLUDED."otorgadoPorId", "creadoEn" = EXCLUDED."creadoEn"
    `);
}

export type AccesoPorMencion = {
    personaId: string;
    otorgadoPorId: string | null;
    creadoEn: Date;
};

/**
 * Los accesos VIGENTES de una conversación. Los que una resolución dejó atrás
 * no salen aunque la fila siga ahí (ver `laMencionSigueVigente`).
 */
export async function losAccesosDeLaConversacion(sessionId: number): Promise<AccesoPorMencion[]> {
    const filas = await conLaTabla(() => db.$queryRaw<
        { personaId: string; otorgadoPorId: string | null; creadoEn: Date; resueltaEn: Date | null }[]
    >`
        SELECT a."personaId", a."otorgadoPorId", a."creadoEn", s.resolved_at AS "resueltaEn"
        FROM "acceso_por_mencion" a
        JOIN "Session" s ON s.id = a."sessionId"
        WHERE a."sessionId" = ${sessionId}
        ORDER BY a."creadoEn" ASC
    `);
    return filas
        .filter((f) => laMencionSigueVigente(f.creadoEn, f.resueltaEn))
        .map(({ personaId, otorgadoPorId, creadoEn }) => ({ personaId, otorgadoPorId, creadoEn }));
}

/** El acceso vigente de UNA persona a UNA conversación, o `null`. */
export async function elAccesoPorMencion(
    sessionId: number,
    personaId: string,
): Promise<AccesoPorMencion | null> {
    const filas = await conLaTabla(() => db.$queryRaw<
        { personaId: string; otorgadoPorId: string | null; creadoEn: Date; resueltaEn: Date | null }[]
    >`
        SELECT a."personaId", a."otorgadoPorId", a."creadoEn", s.resolved_at AS "resueltaEn"
        FROM "acceso_por_mencion" a
        JOIN "Session" s ON s.id = a."sessionId"
        WHERE a."sessionId" = ${sessionId} AND a."personaId" = ${personaId}
    `);
    const f = filas[0];
    if (!f || !laMencionSigueVigente(f.creadoEn, f.resueltaEn)) return null;
    return { personaId: f.personaId, otorgadoPorId: f.otorgadoPorId, creadoEn: f.creadoEn };
}

export async function quitarAccesoPorMencion(sessionId: number, personaId: string): Promise<number> {
    return conLaTabla(() => db.$executeRaw`
        DELETE FROM "acceso_por_mencion"
        WHERE "sessionId" = ${sessionId} AND "personaId" = ${personaId}
    `);
}

/** Al resolver: la conversación se cierra para todos sus invitados. */
export async function olvidarLosAccesosDe(sessionId: number): Promise<number> {
    return conLaTabla(() => db.$executeRaw`
        DELETE FROM "acceso_por_mencion" WHERE "sessionId" = ${sessionId}
    `);
}
