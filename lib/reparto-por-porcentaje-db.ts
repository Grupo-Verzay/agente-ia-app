import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
    comoPorcentaje,
    elegirPorPorcentaje,
    type AsesorDelReparto,
} from "@/lib/reparto-por-porcentaje";

/**
 * Las tablas del reparto por porcentaje.
 *
 * Son de la App, con `CREATE TABLE IF NOT EXISTS` y sin clave foránea. **Ni una
 * columna en `User`**: esa tabla es del backend y añadirle columnas desde aquí
 * es lo que reventó el #360. El backend las lee (y suma el contador) con la
 * MISMA forma y, si todavía no existen, reparte como siempre.
 *
 * - `reparto_porcentaje`: una fila por cuenta. `activo` es el modo: con él
 *   encendido manda el porcentaje; apagado, manda `auto_assign_max_chats`
 *   (Máx. chats o Ilimitado) exactamente como antes. Una cuenta SIN fila es lo
 *   de siempre, así que no hace falta backfill.
 * - `reparto_porcentaje_asesor`: el porcentaje y el CONTADOR acumulado de cada
 *   asesor. El contador se pone a cero al ACTIVAR el modo —«desde que se activó»—
 *   y no se vuelve a tocar mientras siga activo: ni al cambiar porcentajes ni al
 *   desactivar a un asesor.
 */

let tablasListas: Promise<void> | null = null;

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
    if (tablasListas) return tablasListas;
    tablasListas = (async () => {
        await ddl(() =>
            db.$executeRaw`
                CREATE TABLE IF NOT EXISTS "reparto_porcentaje" (
                    "cuentaId"      TEXT PRIMARY KEY,
                    "activo"        BOOLEAN NOT NULL DEFAULT false,
                    "activadoEn"    TIMESTAMPTZ,
                    "actualizadoEn" TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            `,
        );
        await ddl(() =>
            db.$executeRaw`
                CREATE TABLE IF NOT EXISTS "reparto_porcentaje_asesor" (
                    "cuentaId"   TEXT NOT NULL,
                    "asesorId"   TEXT NOT NULL,
                    "porcentaje" INTEGER NOT NULL DEFAULT 0,
                    "asignados"  INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY ("cuentaId", "asesorId")
                )
            `,
        );
    })().catch((error) => {
        tablasListas = null;
        throw error;
    });
    return tablasListas;
}

function esTablaQueFalta(error: unknown): boolean {
    const meta = (error as { meta?: { code?: string } } | null)?.meta;
    if (meta?.code === "42P01") return true;
    const texto = error instanceof Error ? error.message : String(error);
    return texto.includes("42P01");
}

async function conLasTablas<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLasTablas();
    try {
        return await hacer();
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        console.warn("[reparto] las tablas del reparto por porcentaje no estaban; se crean y se reintenta");
        tablasListas = null;
        await asegurarLasTablas();
        return hacer();
    }
}

export type RepartoGuardado = {
    activo: boolean;
    activadoEn: string | null;
    porcentajes: Record<string, { porcentaje: number; asignados: number }>;
};

type Cliente = Prisma.TransactionClient | typeof db;

/**
 * Los asesores que ENTRAN en el reparto de una cuenta, con su disponibilidad y
 * su fila de porcentaje. Es la MISMA gente que reparte el backend al entrar un
 * chat (`auto-assign.service.ts`): el equipo con papel y las cuentas vinculadas
 * marcadas como `agente`. Una vinculada con papel de administrador es otra
 * cuenta titular, no alguien a quien repartirle leads.
 */
export async function losAsesoresDelReparto(cuentaId: string, cliente: Cliente = db): Promise<AsesorDelReparto[]> {
    const filas = await cliente.$queryRaw<
        { id: string; disponible: boolean; porcentaje: number | null; asignados: number | null }[]
    >`
        WITH members AS (
            SELECT u.id, u.advisor_available
            FROM "User" u
            WHERE u.owner_id = ${cuentaId}
              AND u.advisor_role IS NOT NULL

            UNION

            SELECT u.id, u.advisor_available
            FROM "linked_accounts" la
            JOIN "User" u ON u.id = la."linked_user_id"
            WHERE la."master_user_id" = ${cuentaId}
              AND la.role::text = 'agente'
        )
        SELECT m.id,
               COALESCE(m.advisor_available, false) AS disponible,
               r."porcentaje",
               r."asignados"
        FROM members m
        LEFT JOIN "reparto_porcentaje_asesor" r
               ON r."cuentaId" = ${cuentaId} AND r."asesorId" = m.id
        ORDER BY m.id ASC
    `;
    return filas.map((f) => ({
        id: f.id,
        disponible: !!f.disponible,
        porcentaje: comoPorcentaje(f.porcentaje ?? 0),
        asignados: Math.max(0, Number(f.asignados ?? 0) || 0),
    }));
}

export async function leerElReparto(cuentaId: string): Promise<RepartoGuardado> {
    return conLasTablas(async () => {
        const cabecera = await db.$queryRaw<{ activo: boolean; activadoEn: Date | null }[]>`
            SELECT "activo", "activadoEn" FROM "reparto_porcentaje" WHERE "cuentaId" = ${cuentaId} LIMIT 1
        `;
        const filas = await db.$queryRaw<{ asesorId: string; porcentaje: number; asignados: number }[]>`
            SELECT "asesorId", "porcentaje", "asignados"
            FROM "reparto_porcentaje_asesor"
            WHERE "cuentaId" = ${cuentaId}
        `;
        const porcentajes: RepartoGuardado["porcentajes"] = {};
        for (const f of filas) {
            porcentajes[f.asesorId] = { porcentaje: comoPorcentaje(f.porcentaje), asignados: Number(f.asignados) || 0 };
        }
        return {
            activo: !!cabecera[0]?.activo,
            activadoEn: cabecera[0]?.activadoEn ? new Date(cabecera[0].activadoEn).toISOString() : null,
            porcentajes,
        };
    });
}

/**
 * Enciende el modo (o lo deja encendido) con estos porcentajes. Al pasar de
 * apagado a encendido los contadores vuelven a cero: la proporción se mide
 * «desde que se activó». Con el modo ya encendido, cambiar un porcentaje NO
 * toca los contadores. Todo en una transacción con candado por cuenta, el mismo
 * que usa el reparto: un chat que entra mientras se guarda no ve medio cambio.
 */
export async function guardarElReparto(cuentaId: string, porcentajes: Record<string, number>): Promise<void> {
    await conLasTablas(() =>
        db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reparto-porcentaje:${cuentaId}`}))`;
            const antes = await tx.$queryRaw<{ activo: boolean }[]>`
                SELECT "activo" FROM "reparto_porcentaje" WHERE "cuentaId" = ${cuentaId} FOR UPDATE
            `;
            const seActiva = !antes[0]?.activo;
            await tx.$executeRaw`
                INSERT INTO "reparto_porcentaje" ("cuentaId", "activo", "activadoEn", "actualizadoEn")
                VALUES (${cuentaId}, true, now(), now())
                ON CONFLICT ("cuentaId") DO UPDATE
                SET "activo" = true,
                    "activadoEn" = CASE WHEN "reparto_porcentaje"."activo" THEN "reparto_porcentaje"."activadoEn" ELSE now() END,
                    "actualizadoEn" = now()
            `;
            if (seActiva) {
                await tx.$executeRaw`
                    UPDATE "reparto_porcentaje_asesor" SET "asignados" = 0 WHERE "cuentaId" = ${cuentaId}
                `;
            }
            for (const [asesorId, valor] of Object.entries(porcentajes)) {
                const porcentaje = comoPorcentaje(valor);
                await tx.$executeRaw`
                    INSERT INTO "reparto_porcentaje_asesor" ("cuentaId", "asesorId", "porcentaje", "asignados")
                    VALUES (${cuentaId}, ${asesorId}, ${porcentaje}, 0)
                    ON CONFLICT ("cuentaId", "asesorId") DO UPDATE SET "porcentaje" = ${porcentaje}
                `;
            }
        }),
    );
}

/**
 * Apaga el modo. Los porcentajes se conservan para cuando se vuelva a encender;
 * los contadores se quedan como estaban, pero al volver a encender arrancan de
 * cero.
 */
export async function apagarElReparto(cuentaId: string): Promise<void> {
    await conLasTablas(async () => {
        await db.$executeRaw`
            UPDATE "reparto_porcentaje" SET "activo" = false, "actualizadoEn" = now()
            WHERE "cuentaId" = ${cuentaId}
        `;
    });
}

/**
 * Asigna UN chat por porcentaje. Devuelve el asesor, `null` si no hay nadie a
 * quien dárselo, u `"ocupada"` si otro camino la asignó mientras tanto.
 *
 * Elegir, asignar y sumar el contador van en UNA transacción con candado por
 * cuenta. Sin él, dos chats que entran a la vez leen los mismos contadores y
 * caen los dos en el mismo asesor, y el reparto deja de converger.
 */
export async function asignarPorPorcentaje(
    cuentaId: string,
    sessionId: number,
): Promise<string | null | "ocupada"> {
    return conLasTablas(() =>
        db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reparto-porcentaje:${cuentaId}`}))`;
            const asesores = await losAsesoresDelReparto(cuentaId, tx);
            const elegido = elegirPorPorcentaje(asesores);
            if (!elegido) return null;
            const actualizadas = await tx.$executeRaw`
                UPDATE "Session" SET assigned_advisor_id = ${elegido}
                WHERE id = ${sessionId} AND assigned_advisor_id IS NULL
            `;
            if (Number(actualizadas) <= 0) return "ocupada";
            await tx.$executeRaw`
                INSERT INTO "reparto_porcentaje_asesor" ("cuentaId", "asesorId", "porcentaje", "asignados")
                VALUES (${cuentaId}, ${elegido}, 0, 1)
                ON CONFLICT ("cuentaId", "asesorId") DO UPDATE
                SET "asignados" = "reparto_porcentaje_asesor"."asignados" + 1
            `;
            return elegido;
        }),
    );
}
