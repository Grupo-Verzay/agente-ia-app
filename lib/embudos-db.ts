import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
    ETAPAS_INICIALES,
    type Embudo,
    type Etapa,
    type EtapaPedida,
} from "@/lib/embudos";

/**
 * Dónde viven los embudos.
 *
 * **Cuatro tablas de la App, con `CREATE TABLE IF NOT EXISTS` y sin clave
 * foránea.** Ni una columna en `Session`: esa tabla es del BACKEND y añadirle
 * columnas desde aquí es lo que reventó el #360. Sin clave foránea, así que al
 * borrar un embudo o una etapa la limpieza es explícita y va en la misma
 * transacción.
 *
 * - `embudos` — de la CUENTA (`cuentaId`), con su nombre, su orden y si es el
 *   por defecto.
 * - `embudo_etapas` — las columnas de un embudo, con su orden y su color.
 * - `embudo_asesores` — qué embudo tiene cada persona del equipo. Uno por
 *   persona: la clave es `(cuentaId, personaId)`.
 * - `embudo_posiciones` — en qué etapa está una conversación **dentro de un
 *   embudo**. La clave es `(sessionId, embudoId)`: por eso una conversación que
 *   cambia de embudo y vuelve recupera la etapa que tenía.
 *
 * De qué embudo es una conversación NO se guarda: se deduce de su asesor. Ver
 * `lib/embudos.ts`.
 */

let tablasListas: Promise<void> | null = null;

/**
 * Un `CREATE … IF NOT EXISTS` no basta con dos réplicas: dos procesos que lo
 * ejecuten a la vez pasan los dos la comprobación y el segundo revienta con un
 * «ya existe». Solo se traga eso; cualquier otro error sube. Es la misma
 * función que `lib/documentacion-db.ts`, por el mismo motivo.
 */
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
            CREATE TABLE IF NOT EXISTS "embudos" (
                "id" TEXT PRIMARY KEY,
                "cuentaId" TEXT NOT NULL,
                "nombre" TEXT NOT NULL,
                "porDefecto" BOOLEAN NOT NULL DEFAULT FALSE,
                "orden" INTEGER NOT NULL DEFAULT 0,
                "creadoPorId" TEXT,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "embudos_cuenta_idx" ON "embudos" ("cuentaId")
        `);
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "embudo_etapas" (
                "id" TEXT PRIMARY KEY,
                "embudoId" TEXT NOT NULL,
                "nombre" TEXT NOT NULL,
                "color" INTEGER,
                "orden" INTEGER NOT NULL DEFAULT 0
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "embudo_etapas_embudo_idx" ON "embudo_etapas" ("embudoId")
        `);
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "embudo_asesores" (
                "cuentaId" TEXT NOT NULL,
                "personaId" TEXT NOT NULL,
                "embudoId" TEXT NOT NULL,
                "asignadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY ("cuentaId", "personaId")
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "embudo_posiciones" (
                "sessionId" INTEGER NOT NULL,
                "embudoId" TEXT NOT NULL,
                "etapaId" TEXT NOT NULL,
                "movidoPorId" TEXT,
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY ("sessionId", "embudoId")
            )
        `);
        // El tablero lee las posiciones de UN embudo de una vez: la clave
        // primaria empieza por sessionId, así que hace falta este.
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "embudo_posiciones_embudo_idx" ON "embudo_posiciones" ("embudoId")
        `);
    })().catch((error) => {
        tablasListas = null;
        throw error;
    });
    return tablasListas;
}

/** ¿Es el `42P01` de Postgres? Se mira `meta.code` y el texto, no solo `code`. */
function faltaLaTabla(error: unknown): boolean {
    const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
    if (e?.meta?.code === "42P01" || e?.code === "42P01") return true;
    return typeof e?.message === "string" && e.message.includes("42P01");
}

/**
 * El recuerdo de «ya las creé» es del proceso, no de la base: ante un `42P01`
 * se olvida, se crean y se reintenta **una** vez.
 */
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

type FilaEmbudo = { id: string; nombre: string; porDefecto: boolean; orden: number };
type FilaEtapa = { id: string; embudoId: string; nombre: string; color: number | null; orden: number };

export async function losEmbudosDe(cuentaId: string): Promise<Embudo[]> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<FilaEmbudo[]>`
            SELECT "id", "nombre", "porDefecto", "orden"
            FROM "embudos"
            WHERE "cuentaId" = ${cuentaId}
            ORDER BY "orden" ASC, "creadoEn" ASC
        `;
        return filas.map((f) => ({ ...f, orden: Number(f.orden) }));
    });
}

export async function lasEtapasDe(embudoIds: readonly string[]): Promise<Etapa[]> {
    if (embudoIds.length === 0) return [];
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<FilaEtapa[]>`
            SELECT "id", "embudoId", "nombre", "color", "orden"
            FROM "embudo_etapas"
            WHERE "embudoId" = ANY(${[...embudoIds]}::text[])
            ORDER BY "orden" ASC
        `;
        return filas.map((f) => ({
            ...f,
            color: f.color === null ? null : Number(f.color),
            orden: Number(f.orden),
        }));
    });
}

/** persona → embudo, de toda la cuenta. */
export async function lasAsignacionesDe(cuentaId: string): Promise<Record<string, string>> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Array<{ personaId: string; embudoId: string }>>`
            SELECT "personaId", "embudoId" FROM "embudo_asesores" WHERE "cuentaId" = ${cuentaId}
        `;
        const mapa: Record<string, string> = {};
        for (const f of filas) mapa[f.personaId] = f.embudoId;
        return mapa;
    });
}

/** sessionId → etapaId, dentro de un embudo, para las conversaciones pedidas. */
export async function lasPosicionesDe(
    embudoId: string,
    sessionIds: readonly number[],
): Promise<Record<number, string>> {
    if (sessionIds.length === 0) return {};
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Array<{ sessionId: number; etapaId: string }>>`
            SELECT "sessionId", "etapaId"
            FROM "embudo_posiciones"
            WHERE "embudoId" = ${embudoId} AND "sessionId" = ANY(${[...sessionIds]}::int[])
        `;
        const mapa: Record<number, string> = {};
        for (const f of filas) mapa[Number(f.sessionId)] = f.etapaId;
        return mapa;
    });
}

/**
 * Los embudos y las asignaciones de VARIAS cuentas, en una consulta cada uno.
 *
 * La bandeja enseña las líneas de la cuenta y las de las que cuelgan de ella,
 * así que una carga de Chats mira varias. Con `losEmbudosDe` sería una consulta
 * por cuenta y otra más por sus asignaciones —2N— en el camino más caliente de
 * la App, compitiendo por los diez turnos del pool con la propia bandeja. Así
 * son **dos**, cuenten las cuentas que cuenten.
 */
export async function losEmbudosDeVarias(cuentaIds: readonly string[]): Promise<Map<string, Embudo[]>> {
    const mapa = new Map<string, Embudo[]>();
    if (cuentaIds.length === 0) return mapa;
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Array<FilaEmbudo & { cuentaId: string }>>`
            SELECT "cuentaId", "id", "nombre", "porDefecto", "orden"
            FROM "embudos"
            WHERE "cuentaId" = ANY(${[...cuentaIds]}::text[])
            ORDER BY "orden" ASC, "creadoEn" ASC
        `;
        for (const f of filas) {
            const lista = mapa.get(f.cuentaId) ?? [];
            lista.push({ id: f.id, nombre: f.nombre, porDefecto: f.porDefecto, orden: Number(f.orden) });
            mapa.set(f.cuentaId, lista);
        }
        return mapa;
    });
}

/** cuenta → (persona → embudo), para varias cuentas a la vez. */
export async function lasAsignacionesDeVarias(
    cuentaIds: readonly string[],
): Promise<Map<string, Record<string, string>>> {
    const mapa = new Map<string, Record<string, string>>();
    if (cuentaIds.length === 0) return mapa;
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Array<{ cuentaId: string; personaId: string; embudoId: string }>>`
            SELECT "cuentaId", "personaId", "embudoId"
            FROM "embudo_asesores"
            WHERE "cuentaId" = ANY(${[...cuentaIds]}::text[])
        `;
        for (const f of filas) {
            const de = mapa.get(f.cuentaId) ?? {};
            de[f.personaId] = f.embudoId;
            mapa.set(f.cuentaId, de);
        }
        return mapa;
    });
}

/**
 * Lo mismo para VARIOS embudos a la vez: `sessionId → { embudoId, etapaId }`.
 *
 * La bandeja pinta la etapa de todas sus filas, y esas filas pueden ser de
 * varias cuentas y por tanto de varios embudos. Con `lasPosicionesDe` sería una
 * consulta por embudo en el camino más caliente de la App —«muchas peticiones
 * pequeñas son turno, no trabajo», por dentro—, así que van todas en una.
 *
 * Una conversación puede tener posición guardada en más de un embudo (cambió de
 * asesor y volvió), así que la llave lleva el embudo dentro: quien lee se queda
 * con la del embudo que le toca a esa conversación AHORA.
 */
export async function lasPosicionesDeVarios(
    embudoIds: readonly string[],
    sessionIds: readonly number[],
): Promise<Map<string, string>> {
    const mapa = new Map<string, string>();
    if (embudoIds.length === 0 || sessionIds.length === 0) return mapa;
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Array<{ sessionId: number; embudoId: string; etapaId: string }>>`
            SELECT "sessionId", "embudoId", "etapaId"
            FROM "embudo_posiciones"
            WHERE "embudoId" = ANY(${[...embudoIds]}::text[])
              AND "sessionId" = ANY(${[...sessionIds]}::int[])
        `;
        for (const f of filas) mapa.set(`${f.embudoId}::${Number(f.sessionId)}`, f.etapaId);
        return mapa;
    });
}

/**
 * Crea un embudo con sus etapas iniciales. El primero de una cuenta nace como
 * por defecto: es a donde van las conversaciones sin asesor.
 */
export async function crearEmbudo(input: {
    cuentaId: string;
    nombre: string;
    creadoPorId: string;
}): Promise<string> {
    const id = randomUUID();
    await conLasTablas(async () => {
        await db.$transaction(async (tx) => {
            const [{ cuantos, maximo }] = await tx.$queryRaw<Array<{ cuantos: bigint; maximo: number | null }>>`
                SELECT COUNT(*) AS "cuantos", MAX("orden") AS "maximo"
                FROM "embudos" WHERE "cuentaId" = ${input.cuentaId}
            `;
            const esElPrimero = Number(cuantos) === 0;
            await tx.$executeRaw`
                INSERT INTO "embudos" ("id", "cuentaId", "nombre", "porDefecto", "orden", "creadoPorId")
                VALUES (${id}, ${input.cuentaId}, ${input.nombre}, ${esElPrimero},
                        ${(maximo === null ? -1 : Number(maximo)) + 1}, ${input.creadoPorId})
            `;
            const valores = ETAPAS_INICIALES.map(
                (nombre, i) => Prisma.sql`(${randomUUID()}, ${id}, ${nombre}, NULL, ${i})`,
            );
            await tx.$executeRaw`
                INSERT INTO "embudo_etapas" ("id", "embudoId", "nombre", "color", "orden")
                VALUES ${Prisma.join(valores)}
            `;
        });
    });
    return id;
}

/** ¿Es este embudo de esta cuenta? Lo pregunta toda escritura antes de tocar nada. */
export async function esDeLaCuenta(cuentaId: string, embudoId: string): Promise<boolean> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "embudos" WHERE "id" = ${embudoId} AND "cuentaId" = ${cuentaId}
        `;
        return filas.length > 0;
    });
}

export async function renombrarEmbudo(cuentaId: string, embudoId: string, nombre: string): Promise<boolean> {
    return conLasTablas(async () => {
        const tocadas = await db.$executeRaw`
            UPDATE "embudos" SET "nombre" = ${nombre}, "actualizadoEn" = NOW()
            WHERE "id" = ${embudoId} AND "cuentaId" = ${cuentaId}
        `;
        return tocadas > 0;
    });
}

/** Marca uno como por defecto y desmarca los demás, en una transacción. */
export async function usarPorDefecto(cuentaId: string, embudoId: string): Promise<boolean> {
    return conLasTablas(async () =>
        db.$transaction(async (tx) => {
            if (!(await esDeLaCuentaTx(tx, cuentaId, embudoId))) return false;
            await tx.$executeRaw`
                UPDATE "embudos" SET "porDefecto" = ("id" = ${embudoId}), "actualizadoEn" = NOW()
                WHERE "cuentaId" = ${cuentaId}
            `;
            return true;
        }),
    );
}

async function esDeLaCuentaTx(tx: Prisma.TransactionClient, cuentaId: string, embudoId: string) {
    const filas = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "embudos" WHERE "id" = ${embudoId} AND "cuentaId" = ${cuentaId} FOR UPDATE
    `;
    return filas.length > 0;
}

/**
 * Borra un embudo con todo lo que cuelga de él: etapas, asignaciones y
 * posiciones. Las conversaciones NO se tocan — son de `Session` y siguen ahí;
 * las de sus asesores pasan a salir en el embudo por defecto.
 *
 * Si era el por defecto, el siguiente pasa a serlo al leer
 * (`elEmbudoPorDefecto` cae en el primero), sin tener que escribir nada.
 */
export async function borrarEmbudo(cuentaId: string, embudoId: string): Promise<boolean> {
    return conLasTablas(async () =>
        db.$transaction(async (tx) => {
            if (!(await esDeLaCuentaTx(tx, cuentaId, embudoId))) return false;
            await tx.$executeRaw`DELETE FROM "embudo_posiciones" WHERE "embudoId" = ${embudoId}`;
            await tx.$executeRaw`DELETE FROM "embudo_asesores" WHERE "embudoId" = ${embudoId}`;
            await tx.$executeRaw`DELETE FROM "embudo_etapas" WHERE "embudoId" = ${embudoId}`;
            await tx.$executeRaw`DELETE FROM "embudos" WHERE "id" = ${embudoId}`;
            return true;
        }),
    );
}

/**
 * Guarda la lista ENTERA de etapas de un embudo, en su orden: las que traen id
 * se actualizan, las nuevas se crean y las que faltan se borran junto con sus
 * posiciones (esas conversaciones caen en la primera etapa al leer).
 *
 * Una lista completa y no un cambio suelto: cada guardado es una foto coherente
 * y dos personas a la vez no dejan el orden a medias.
 */
export async function guardarEtapas(
    cuentaId: string,
    embudoId: string,
    etapas: readonly EtapaPedida[],
): Promise<boolean> {
    return conLasTablas(async () =>
        db.$transaction(async (tx) => {
            if (!(await esDeLaCuentaTx(tx, cuentaId, embudoId))) return false;
            const quedan = etapas.map((e) => e.id).filter((id): id is string => Boolean(id));
            const sobran = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT "id" FROM "embudo_etapas"
                WHERE "embudoId" = ${embudoId} AND NOT ("id" = ANY(${quedan}::text[]))
            `;
            const idsQueSobran = sobran.map((s) => s.id);
            if (idsQueSobran.length > 0) {
                await tx.$executeRaw`
                    DELETE FROM "embudo_posiciones"
                    WHERE "embudoId" = ${embudoId} AND "etapaId" = ANY(${idsQueSobran}::text[])
                `;
                await tx.$executeRaw`
                    DELETE FROM "embudo_etapas" WHERE "id" = ANY(${idsQueSobran}::text[])
                `;
            }
            for (const [orden, etapa] of etapas.entries()) {
                if (etapa.id) {
                    await tx.$executeRaw`
                        UPDATE "embudo_etapas"
                        SET "nombre" = ${etapa.nombre}, "color" = ${etapa.color}, "orden" = ${orden}
                        WHERE "id" = ${etapa.id} AND "embudoId" = ${embudoId}
                    `;
                } else {
                    await tx.$executeRaw`
                        INSERT INTO "embudo_etapas" ("id", "embudoId", "nombre", "color", "orden")
                        VALUES (${randomUUID()}, ${embudoId}, ${etapa.nombre}, ${etapa.color}, ${orden})
                    `;
                }
            }
            await tx.$executeRaw`UPDATE "embudos" SET "actualizadoEn" = NOW() WHERE "id" = ${embudoId}`;
            return true;
        }),
    );
}

/**
 * Asigna (o quita, con `embudoId: null`) el embudo de varias personas, en una
 * transacción. Los embudos que no sean de la cuenta se ignoran: una lista que
 * llega de fuera no decide a qué se llega.
 */
export async function asignarEmbudos(
    cuentaId: string,
    pares: ReadonlyArray<{ personaId: string; embudoId: string | null }>,
): Promise<void> {
    if (pares.length === 0) return;
    await conLasTablas(async () =>
        db.$transaction(async (tx) => {
            const propios = new Set(
                (
                    await tx.$queryRaw<Array<{ id: string }>>`
                        SELECT "id" FROM "embudos" WHERE "cuentaId" = ${cuentaId}
                    `
                ).map((f) => f.id),
            );
            for (const par of pares) {
                await tx.$executeRaw`
                    DELETE FROM "embudo_asesores"
                    WHERE "cuentaId" = ${cuentaId} AND "personaId" = ${par.personaId}
                `;
                if (par.embudoId && propios.has(par.embudoId)) {
                    await tx.$executeRaw`
                        INSERT INTO "embudo_asesores" ("cuentaId", "personaId", "embudoId")
                        VALUES (${cuentaId}, ${par.personaId}, ${par.embudoId})
                    `;
                }
            }
        }),
    );
}

/** Pone una conversación en una etapa de un embudo. */
export async function moverConversacion(input: {
    sessionId: number;
    embudoId: string;
    etapaId: string;
    movidoPorId: string;
}): Promise<void> {
    await conLasTablas(async () => {
        await db.$executeRaw`
            INSERT INTO "embudo_posiciones" ("sessionId", "embudoId", "etapaId", "movidoPorId", "actualizadoEn")
            VALUES (${input.sessionId}, ${input.embudoId}, ${input.etapaId}, ${input.movidoPorId}, NOW())
            ON CONFLICT ("sessionId", "embudoId")
            DO UPDATE SET "etapaId" = EXCLUDED."etapaId", "movidoPorId" = EXCLUDED."movidoPorId",
                          "actualizadoEn" = NOW()
        `;
    });
}
