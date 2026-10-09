import "server-only";

import { db } from "@/lib/db";
import {
    AJUSTES_DE_FABRICA,
    comoAjustes,
    queHacerAlAsignar,
    type AjustesDelAsesor,
    type MarcaDelAsesor,
} from "@/lib/ia-del-asesor";

/**
 * Las tablas de los interruptores «Sesión» y «Agente» de cada asesor.
 *
 * Son de la App, con `CREATE TABLE IF NOT EXISTS` y sin clave foránea. **Ni una
 * columna en `Session` ni en `User`**: son del backend (#360). El motor las lee
 * con la MISMA forma al asignar y, si no existen, reparte como siempre.
 *
 * - `asesor_ia_ajustes`: una fila por cuenta y asesor (una cuenta vinculada
 *   atiende en varias cuentas, y cada una decide lo suyo). Sin fila = los dos
 *   encendidos.
 * - `asesor_ia_marcas`: una fila por conversación que ESTE mecanismo apagó, con
 *   qué partes apagó y cómo estaba `aiOptIn`. Es lo único que permite devolver
 *   lo apagado sin tocar lo que alguien apagó a mano.
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
                CREATE TABLE IF NOT EXISTS "asesor_ia_ajustes" (
                    "asesorId"      TEXT NOT NULL,
                    "cuentaId"      TEXT NOT NULL,
                    "sesionApagada" BOOLEAN NOT NULL DEFAULT false,
                    "agenteApagado" BOOLEAN NOT NULL DEFAULT false,
                    "actualizadoEn" TIMESTAMPTZ NOT NULL DEFAULT now(),
                    PRIMARY KEY ("cuentaId", "asesorId")
                )
            `,
        );
        await ddl(() =>
            db.$executeRaw`
                CREATE TABLE IF NOT EXISTS "asesor_ia_marcas" (
                    "sessionId"    INTEGER PRIMARY KEY,
                    "asesorId"     TEXT,
                    "apagoSesion"  BOOLEAN NOT NULL DEFAULT false,
                    "apagoAgente"  BOOLEAN NOT NULL DEFAULT false,
                    "aiOptInAntes" BOOLEAN NOT NULL DEFAULT false,
                    "creadoEn"     TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            `,
        );
        await ddl(() =>
            db.$executeRaw`
                CREATE INDEX IF NOT EXISTS "asesor_ia_marcas_asesor_idx" ON "asesor_ia_marcas" ("asesorId")
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
        console.warn("[ia-del-asesor] las tablas no estaban; se crean y se reintenta");
        tablasListas = null;
        await asegurarLasTablas();
        return hacer();
    }
}

/**
 * Los ajustes de varios asesores en sus cuentas. La llave del mapa es
 * `cuenta::asesor`. Sin fila = los dos encendidos.
 */
export function laLlaveDeLosAjustes(cuentaId: string, asesorId: string): string {
    return `${cuentaId}::${asesorId}`;
}

export async function losAjustesDeLosAsesores(cuentaIds: string[]): Promise<Map<string, AjustesDelAsesor>> {
    const ids = Array.from(new Set(cuentaIds.filter((id) => typeof id === "string" && id)));
    const mapa = new Map<string, AjustesDelAsesor>();
    if (ids.length === 0) return mapa;
    const filas = await conLasTablas(() =>
        db.$queryRaw<Array<{ cuentaId: string; asesorId: string; sesionApagada: boolean; agenteApagado: boolean }>>`
            SELECT "cuentaId", "asesorId", "sesionApagada", "agenteApagado"
              FROM "asesor_ia_ajustes"
             WHERE "cuentaId" = ANY(${ids}::text[])
        `,
    );
    for (const f of filas) mapa.set(laLlaveDeLosAjustes(f.cuentaId, f.asesorId), comoAjustes(f));
    return mapa;
}

export async function guardarLosAjustes(
    asesorId: string,
    cuentaId: string,
    ajustes: AjustesDelAsesor,
): Promise<void> {
    await conLasTablas(() =>
        db.$executeRaw`
            INSERT INTO "asesor_ia_ajustes" ("asesorId", "cuentaId", "sesionApagada", "agenteApagado", "actualizadoEn")
            VALUES (${asesorId}, ${cuentaId}, ${ajustes.sesionApagada}, ${ajustes.agenteApagado}, now())
            ON CONFLICT ("cuentaId", "asesorId") DO UPDATE
               SET "sesionApagada" = EXCLUDED."sesionApagada",
                   "agenteApagado" = EXCLUDED."agenteApagado",
                   "actualizadoEn" = now()
        `,
    );
}

export type ResultadoDeAplicar = { apagadas: number; devueltas: number };

/**
 * Pone la IA de estas conversaciones como dicen los interruptores de SU asesor
 * de ahora (sin asesor = los dos encendidos). Lo usan el interruptor y cada
 * camino que asigna o suelta una conversación.
 *
 * Nunca lanza: lo que ya ocurrió (una asignación) no se puede deshacer por
 * esto. Pero no es mudo.
 */
export async function aplicarALasConversaciones(sessionIds: number[]): Promise<ResultadoDeAplicar> {
    const ids = Array.from(new Set(sessionIds.filter((id) => Number.isInteger(id) && id > 0)));
    const resultado: ResultadoDeAplicar = { apagadas: 0, devueltas: 0 };
    if (ids.length === 0) return resultado;
    try {
        await asegurarLasTablas();
        const sesiones = await db.session.findMany({
            where: { id: { in: ids } },
            select: { id: true, userId: true, assignedAdvisorId: true },
        });
        const ajustes = await losAjustesDeLosAsesores(sesiones.map((s) => s.userId));
        for (const s of sesiones) {
            const del = s.assignedAdvisorId
                ? (ajustes.get(laLlaveDeLosAjustes(s.userId, s.assignedAdvisorId)) ?? AJUSTES_DE_FABRICA)
                : AJUSTES_DE_FABRICA;
            const r = await aplicarAUna(s.id, del);
            if (r === "apagada") resultado.apagadas++;
            if (r === "devuelta") resultado.devueltas++;
        }
    } catch (error) {
        console.error("[ia-del-asesor] no se pudo aplicar a las conversaciones", {
            sesiones: ids.length,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    return resultado;
}

async function aplicarAUna(sessionId: number, ajustes: AjustesDelAsesor): Promise<"apagada" | "devuelta" | null> {
    return db.$transaction(async (tx) => {
        const filas = await tx.$queryRaw<Array<{ status: boolean; agentDisabled: boolean; aiOptIn: boolean; asesor: string | null }>>`
            SELECT status, "agentDisabled", "ai_opt_in" AS "aiOptIn", "assigned_advisor_id" AS asesor
              FROM "Session" WHERE id = ${sessionId} FOR UPDATE
        `;
        const estado = filas[0];
        if (!estado) return null;
        const marcas = await tx.$queryRaw<Array<MarcaDelAsesor>>`
            SELECT "apagoSesion", "apagoAgente", "aiOptInAntes"
              FROM "asesor_ia_marcas" WHERE "sessionId" = ${sessionId}
        `;
        const marca = marcas[0] ?? null;
        const cambio = queHacerAlAsignar(
            { status: Boolean(estado.status), agentDisabled: Boolean(estado.agentDisabled), aiOptIn: Boolean(estado.aiOptIn) },
            marca,
            ajustes,
        );
        if (Object.keys(cambio.datos).length > 0) {
            await tx.session.update({ where: { id: sessionId }, data: cambio.datos });
        }
        if (cambio.marca) {
            await tx.$executeRaw`
                INSERT INTO "asesor_ia_marcas" ("sessionId", "asesorId", "apagoSesion", "apagoAgente", "aiOptInAntes")
                VALUES (${sessionId}, ${estado.asesor}, ${cambio.marca.apagoSesion}, ${cambio.marca.apagoAgente}, ${cambio.marca.aiOptInAntes})
                ON CONFLICT ("sessionId") DO UPDATE
                   SET "asesorId" = EXCLUDED."asesorId",
                       "apagoSesion" = EXCLUDED."apagoSesion",
                       "apagoAgente" = EXCLUDED."apagoAgente",
                       "aiOptInAntes" = EXCLUDED."aiOptInAntes"
            `;
        } else if (marca) {
            await tx.$executeRaw`DELETE FROM "asesor_ia_marcas" WHERE "sessionId" = ${sessionId}`;
        }
        const apago = cambio.datos.status === false || cambio.datos.agentDisabled === true;
        const devolvio = cambio.datos.status === true || cambio.datos.agentDisabled === false;
        return apago ? "apagada" : devolvio ? "devuelta" : null;
    });
}

/** Las conversaciones que lleva un asesor en una cuenta, más las que marcó él. */
export async function lasConversacionesDelAsesor(asesorId: string, cuentaId: string): Promise<number[]> {
    const asignadas = await db.session.findMany({
        where: { assignedAdvisorId: asesorId, userId: cuentaId },
        select: { id: true },
    });
    const marcadas = await conLasTablas(() =>
        db.$queryRaw<Array<{ sessionId: number }>>`
            SELECT m."sessionId"
              FROM "asesor_ia_marcas" m
              JOIN "Session" s ON s.id = m."sessionId"
             WHERE m."asesorId" = ${asesorId} AND s."userId" = ${cuentaId}
        `,
    );
    return Array.from(new Set([...asignadas.map((s) => s.id), ...marcadas.map((m) => Number(m.sessionId))]));
}

/**
 * Una persona cambió a mano esa parte de la IA: la marca de esa parte se
 * olvida, para que volver a encender el interruptor no pise su decisión.
 */
export async function olvidarLaMarca(sessionId: number, parte: "sesion" | "agente"): Promise<void> {
    try {
        await asegurarLasTablas();
        if (parte === "sesion") {
            await db.$executeRaw`UPDATE "asesor_ia_marcas" SET "apagoSesion" = false WHERE "sessionId" = ${sessionId}`;
        } else {
            await db.$executeRaw`UPDATE "asesor_ia_marcas" SET "apagoAgente" = false WHERE "sessionId" = ${sessionId}`;
        }
        await db.$executeRaw`
            DELETE FROM "asesor_ia_marcas"
             WHERE "sessionId" = ${sessionId} AND NOT "apagoSesion" AND NOT "apagoAgente"
        `;
    } catch (error) {
        console.warn("[ia-del-asesor] no se pudo olvidar la marca", {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/**
 * Por asesor, cuántas de sus conversaciones de ESTA cuenta tiene pausadas el
 * interruptor «Sesión».
 *
 * Apagarlo pone `status = false`, y `status = false` es también «cerrada». Las
 * cuentas de Equipo que miran solo `status = true` dejaban al asesor con 0
 * activas en cuanto apagaba el interruptor, y parecía que le habían quitado
 * los chats aunque `assigned_advisor_id` no se movía. Una pausada por el
 * interruptor sigue siendo SUYA y sigue abierta: se suma a sus activas.
 */
export async function lasPausadasPorElInterruptor(cuentaId: string): Promise<Map<string, number>> {
    const filas = await conLasTablas(() =>
        db.$queryRaw<Array<{ asesorId: string; n: number }>>`
            SELECT s."assigned_advisor_id" AS "asesorId", COUNT(*)::int AS n
              FROM "asesor_ia_marcas" m
              JOIN "Session" s ON s.id = m."sessionId"
             WHERE s."userId" = ${cuentaId}
               AND m."apagoSesion"
               AND s.status = false
               AND s."assigned_advisor_id" IS NOT NULL
             GROUP BY s."assigned_advisor_id"
        `,
    );
    return new Map(filas.map((f) => [f.asesorId, Number(f.n)]));
}

/** ¿Este mecanismo tiene la sesión pausada? (para no reabrirla sola). */
export async function laSesionLaPausoSuAsesor(sessionIds: number[]): Promise<Set<number>> {
    const ids = sessionIds.filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return new Set();
    try {
        await asegurarLasTablas();
        const filas = await db.$queryRaw<Array<{ sessionId: number }>>`
            SELECT "sessionId" FROM "asesor_ia_marcas"
             WHERE "sessionId" = ANY(${ids}::int[]) AND "apagoSesion"
        `;
        return new Set(filas.map((f) => Number(f.sessionId)));
    } catch (error) {
        console.warn("[ia-del-asesor] no se pudo leer la marca", error instanceof Error ? error.message : String(error));
        return new Set();
    }
}
