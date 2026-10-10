import "server-only";

import { db } from "@/lib/db";
import { asegurarTabla } from "@/lib/ddl-sin-bloquear";
import type { DecisionDeLaLlamada } from "@/lib/ciclo-de-la-cita";

/**
 * Las dos tablas del ciclo automático de la cita (de la App, sin clave
 * foránea: `Appointment` es del esquema del backend):
 *
 * - `cita_ciclo_ajustes`: una fila por CUENTA, el interruptor «Flujo
 *   automático de la cita» de Agenda › Ajustes. Sin fila = apagado.
 * - `cita_ciclo`: una fila por CITA con lo que pasó en su ciclo —la respuesta
 *   al recordatorio, la llamada, la prórroga y el cierre—. La escriben el reloj
 *   de la espera, la respuesta del cliente y la herramienta de la llamada.
 *
 * Se crean con `asegurarTabla` (catálogo primero, `lock_timeout`): nunca un
 * DDL a pelo.
 */

const AJUSTES = "cita_ciclo_ajustes";
const CICLO = "cita_ciclo";

let tablasListas: Promise<void> | null = null;

function asegurarLasTablas(): Promise<void> {
    tablasListas ??= (async () => {
        await asegurarTabla(
            AJUSTES,
            `CREATE TABLE IF NOT EXISTS "${AJUSTES}" (
                "cuentaId" TEXT NOT NULL PRIMARY KEY,
                "activo" BOOLEAN NOT NULL DEFAULT false,
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`,
        );
        await asegurarTabla(
            CICLO,
            `CREATE TABLE IF NOT EXISTS "${CICLO}" (
                "citaId" TEXT NOT NULL PRIMARY KEY,
                "cuentaId" TEXT NOT NULL,
                "clienteEntroEn" TIMESTAMP(3),
                "asistencia" TEXT,
                "respondidaEn" TIMESTAMP(3),
                "llamadaEn" TIMESTAMP(3),
                "llamadaResultado" TEXT,
                "decision" TEXT,
                "decididaEn" TIMESTAMP(3),
                "esperaHasta" TIMESTAMP(3),
                "cerradaEn" TIMESTAMP(3),
                "cierre" TEXT,
                "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`,
        );
    })().catch((error) => {
        tablasListas = null;
        throw error;
    });
    return tablasListas;
}

/** En una consulta en crudo el código de Postgres viaja en `meta.code`. */
function faltaLaTabla(error: unknown): boolean {
    const e = error as { code?: string; meta?: { code?: string }; message?: string };
    return (e?.meta?.code ?? e?.code) === "42P01" || String(e?.message ?? "").includes("42P01");
}

async function conLasTablas<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLasTablas();
    try {
        return await hacer();
    } catch (error) {
        if (!faltaLaTabla(error)) throw error;
        tablasListas = null;
        await asegurarLasTablas();
        return hacer();
    }
}

/* ── El interruptor de la cuenta ───────────────────────────────────────── */

export async function elCicloEstaActivo(cuentaId: string): Promise<boolean> {
    if (!cuentaId) return false;
    const filas = await conLasTablas(() => db.$queryRaw<{ activo: boolean }[]>`
        SELECT "activo" FROM "cita_ciclo_ajustes" WHERE "cuentaId" = ${cuentaId} LIMIT 1
    `);
    return Boolean(filas[0]?.activo);
}

export async function guardarElCicloActivo(cuentaId: string, activo: boolean): Promise<boolean> {
    await conLasTablas(() => db.$executeRaw`
        INSERT INTO "cita_ciclo_ajustes" ("cuentaId", "activo", "actualizadoEn")
        VALUES (${cuentaId}, ${activo}, CURRENT_TIMESTAMP)
        ON CONFLICT ("cuentaId") DO UPDATE SET "activo" = EXCLUDED."activo", "actualizadoEn" = CURRENT_TIMESTAMP
    `);
    return elCicloEstaActivo(cuentaId);
}

/** Las cuentas con el ciclo encendido. Las lee el reloj de la espera. */
export async function lasCuentasConElCiclo(): Promise<string[]> {
    const filas = await conLasTablas(() => db.$queryRaw<{ cuentaId: string }[]>`
        SELECT "cuentaId" FROM "cita_ciclo_ajustes" WHERE "activo" = true
    `);
    return filas.map((f) => f.cuentaId);
}

/* ── Lo que pasó en el ciclo de una cita ───────────────────────────────── */

export type FilaDelCiclo = {
    citaId: string;
    cuentaId: string;
    /** Cuándo entró el PROSPECTO a la videollamada (un asesor que entra no cuenta). */
    clienteEntroEn: Date | null;
    asistencia: "si" | "no" | null;
    respondidaEn: Date | null;
    llamadaEn: Date | null;
    llamadaResultado: string | null;
    decision: DecisionDeLaLlamada | null;
    decididaEn: Date | null;
    esperaHasta: Date | null;
    cerradaEn: Date | null;
    cierre: string | null;
};

export async function lasFilasDelCiclo(citaIds: readonly string[]): Promise<Map<string, FilaDelCiclo>> {
    const salida = new Map<string, FilaDelCiclo>();
    if (citaIds.length === 0) return salida;
    const filas = await conLasTablas(() => db.$queryRaw<FilaDelCiclo[]>`
        SELECT * FROM "cita_ciclo" WHERE "citaId" = ANY(${[...citaIds]}::text[])
    `);
    for (const f of filas) salida.set(f.citaId, f);
    return salida;
}

export async function laFilaDelCiclo(citaId: string): Promise<FilaDelCiclo | null> {
    return (await lasFilasDelCiclo([citaId])).get(citaId) ?? null;
}

async function laFilaExiste(citaId: string, cuentaId: string): Promise<void> {
    await db.$executeRaw`
        INSERT INTO "cita_ciclo" ("citaId", "cuentaId") VALUES (${citaId}, ${cuentaId})
        ON CONFLICT ("citaId") DO NOTHING
    `;
}

/** Apunta que el prospecto entró a la videollamada. Solo la primera vez. */
export async function apuntarQueEntroElCliente(citaId: string, cuentaId: string): Promise<void> {
    await conLasTablas(async () => {
        await laFilaExiste(citaId, cuentaId);
        await db.$executeRaw`
            UPDATE "cita_ciclo" SET "clienteEntroEn" = COALESCE("clienteEntroEn", CURRENT_TIMESTAMP) WHERE "citaId" = ${citaId}
        `;
    });
}

/** Apunta la respuesta al recordatorio. Solo la PRIMERA cuenta: un segundo «sí» no cambia nada. */
export async function apuntarLaAsistencia(citaId: string, cuentaId: string, asistencia: "si" | "no"): Promise<boolean> {
    return conLasTablas(async () => {
        await laFilaExiste(citaId, cuentaId);
        const n = await db.$executeRaw`
            UPDATE "cita_ciclo" SET "asistencia" = ${asistencia}, "respondidaEn" = CURRENT_TIMESTAMP
            WHERE "citaId" = ${citaId} AND "asistencia" IS NULL
        `;
        return n > 0;
    });
}

/**
 * Reclama la llamada del minuto 5. Es atómico: con dos vueltas del reloj a la
 * vez solo una gana, y al prospecto no le llaman dos veces.
 */
export async function reclamarLaLlamada(citaId: string, cuentaId: string): Promise<boolean> {
    return conLasTablas(async () => {
        await laFilaExiste(citaId, cuentaId);
        const n = await db.$executeRaw`
            UPDATE "cita_ciclo" SET "llamadaEn" = CURRENT_TIMESTAMP
            WHERE "citaId" = ${citaId} AND "llamadaEn" IS NULL
        `;
        return n > 0;
    });
}

export async function apuntarElResultadoDeLaLlamada(citaId: string, resultado: string): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        UPDATE "cita_ciclo" SET "llamadaResultado" = ${resultado.slice(0, 500)} WHERE "citaId" = ${citaId}
    `);
}

export async function apuntarLaDecision(
    citaId: string,
    cuentaId: string,
    decision: DecisionDeLaLlamada,
    esperaHasta: Date | null,
): Promise<void> {
    await conLasTablas(async () => {
        await laFilaExiste(citaId, cuentaId);
        await db.$executeRaw`
            UPDATE "cita_ciclo"
            SET "decision" = ${decision}, "decididaEn" = CURRENT_TIMESTAMP, "esperaHasta" = ${esperaHasta}
            WHERE "citaId" = ${citaId}
        `;
    });
}

export async function apuntarElCierre(citaId: string, cuentaId: string, cierre: string): Promise<void> {
    await conLasTablas(async () => {
        await laFilaExiste(citaId, cuentaId);
        await db.$executeRaw`
            UPDATE "cita_ciclo" SET "cierre" = ${cierre}, "cerradaEn" = CURRENT_TIMESTAMP WHERE "citaId" = ${citaId}
        `;
    });
}

/** Al reagendar, el ciclo empieza de cero: otra hora, otra respuesta, otra llamada. */
export async function olvidarElCiclo(citaId: string): Promise<void> {
    await conLasTablas(() => db.$executeRaw`DELETE FROM "cita_ciclo" WHERE "citaId" = ${citaId}`);
}
