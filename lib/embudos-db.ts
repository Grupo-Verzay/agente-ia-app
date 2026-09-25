import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sinGruposSql } from "@/lib/conversaciones-de-grupo";
import {
    ETAPAS_INICIALES,
    ETAPAS_INICIALES_VIEJAS,
    HEX_DEL_COLOR_VIEJO,
    comoEtapaDeSistema,
    type Embudo,
    type Etapa,
    type EtapaDeSistema,
    type EtapaPedida,
} from "@/lib/embudos";
import { TOPE_DE_LA_PAPELERA, type EnLaPapelera, diasQueQuedan } from "@/lib/papelera-de-embudos";
import type { AQuienSeMira } from "@/lib/embudos-de-la-cuenta";

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
 * - `embudo_vaciadas` — la papelera de la columna de Perdido: de dónde salió
 *   cada conversación y cuándo, para poder devolverla a su etapa durante
 *   treinta días. La clave es el `sessionId`: una conversación está vaciada o
 *   no está, no medio vaciada en dos embudos.
 *
 * De qué embudo es una conversación NO se guarda: se deduce de su asesor. Ver
 * `lib/embudos.ts`.
 *
 * # Las columnas que se añadieron después
 *
 * `embudo_etapas` ya estaba desplegada cuando llegaron las etapas de sistema y
 * los colores libres, y **un `CREATE TABLE IF NOT EXISTS` no toca una tabla que
 * ya existe**: es el fallo que se comete solo al añadirle una columna a una
 * tabla de la App ya viva. Así que `sistema` y `colorHex` entran con
 * `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, y el color viejo —un índice de
 * paleta— se traduce a hex **una vez**, con un `UPDATE` acotado a las filas que
 * todavía no lo tienen. Lo que no se traduzca lo sigue leyendo
 * `HEX_DEL_COLOR_VIEJO` al pintar: sin ese respaldo, un backfill que no corriera
 * dejaría las etapas viejas sin color de golpe el día del despliegue.
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

        // Las etapas de sistema y los colores libres llegaron después: la tabla
        // ya estaba desplegada, así que van por `ADD COLUMN IF NOT EXISTS`. Se
        // puede repetir en cada arranque sin ruido.
        await ddl(() => db.$executeRaw`
            ALTER TABLE "embudo_etapas" ADD COLUMN IF NOT EXISTS "sistema" TEXT
        `);
        await ddl(() => db.$executeRaw`
            ALTER TABLE "embudo_etapas" ADD COLUMN IF NOT EXISTS "colorHex" TEXT
        `);
        // El color viejo era un índice de paleta. Se traduce a hex UNA vez: la
        // condición `"colorHex" IS NULL` lo hace idempotente, así que esto no
        // pisa nada el día que alguien elija un color de verdad.
        for (const [indice, hex] of HEX_DEL_COLOR_VIEJO.entries()) {
            await ddl(() => db.$executeRaw`
                UPDATE "embudo_etapas" SET "colorHex" = ${hex}
                WHERE "colorHex" IS NULL AND "color" = ${indice}
            `);
        }

        // La papelera de la columna de Perdido. El nombre y el número se COPIAN
        // dentro, como `autorNombre` en un mensaje: la papelera sigue diciendo
        // de quién era cada conversación sin unir con `Session` en cada lectura.
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "embudo_vaciadas" (
                "sessionId" INTEGER PRIMARY KEY,
                "cuentaId" TEXT NOT NULL,
                "embudoId" TEXT NOT NULL,
                "etapaId" TEXT NOT NULL,
                "nombre" TEXT NOT NULL DEFAULT '',
                "remoteJid" TEXT NOT NULL DEFAULT '',
                "vaciadoPorId" TEXT,
                "vaciadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "embudo_vaciadas_cuenta_idx"
            ON "embudo_vaciadas" ("cuentaId", "vaciadoEn")
        `);
        // El barrido que borra en firme busca por fecha en TODA la plataforma,
        // sin cuenta que dar: sin este índice recorrería la tabla entera.
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "embudo_vaciadas_fecha_idx" ON "embudo_vaciadas" ("vaciadoEn")
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
type FilaEtapa = {
    id: string;
    embudoId: string;
    nombre: string;
    /** El índice de la paleta VIEJA. Solo se lee, y solo como respaldo. */
    color: number | null;
    colorHex: string | null;
    orden: number;
    sistema: string | null;
};

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

/**
 * Las etapas de unos embudos, en su orden.
 *
 * El color sale de `colorHex`, y si esa fila todavía no lo tiene —el backfill no
 * ha corrido— se traduce su índice viejo al pintar. Sin ese respaldo, las etapas
 * creadas antes de los colores libres se quedarían sin color de golpe.
 */
export async function lasEtapasDe(embudoIds: readonly string[]): Promise<Etapa[]> {
    if (embudoIds.length === 0) return [];
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<FilaEtapa[]>`
            SELECT "id", "embudoId", "nombre", "color", "colorHex", "orden", "sistema"
            FROM "embudo_etapas"
            WHERE "embudoId" = ANY(${[...embudoIds]}::text[])
            ORDER BY "orden" ASC
        `;
        return filas.map((f) => ({
            id: f.id,
            embudoId: f.embudoId,
            nombre: f.nombre,
            color: f.colorHex ?? elHexDelIndiceViejo(f.color),
            orden: Number(f.orden),
            sistema: comoEtapaDeSistema(f.sistema),
        }));
    });
}

/** El color de una etapa guardada con la paleta vieja, por su índice. */
function elHexDelIndiceViejo(indice: number | null): string | null {
    if (indice === null || indice === undefined) return null;
    const i = Number(indice);
    return Number.isInteger(i) && i >= 0 && i < HEX_DEL_COLOR_VIEJO.length ? HEX_DEL_COLOR_VIEJO[i] : null;
}

/**
 * id → su marca de sistema, para el embudo pedido.
 *
 * Es lo que `comoListaDeEtapas` necesita para no dejar que el navegador decida
 * qué etapa es de sistema. Las claves son **todos** los ids del embudo, así que
 * la misma consulta dice además cuáles son suyos.
 */
export async function lasMarcasDeSistemaDe(embudoId: string): Promise<Record<string, EtapaDeSistema | null>> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Array<{ id: string; sistema: string | null }>>`
            SELECT "id", "sistema" FROM "embudo_etapas" WHERE "embudoId" = ${embudoId}
        `;
        const mapa: Record<string, EtapaDeSistema | null> = {};
        for (const f of filas) mapa[f.id] = comoEtapaDeSistema(f.sistema);
        return mapa;
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
 * Las DOS formas de `AQuienSeMira`, escritas una al lado de la otra a propósito.
 *
 * Una decisión y dos renderizados: el `where` de Prisma con el que se traen las
 * tarjetas, y el trozo de SQL con el que se cuentan por etapa —que va en crudo
 * porque tiene que unir `embudo_posiciones`, que es tabla nuestra—. Separadas,
 * el día que se afine una las cabeceras dirían un número y las columnas
 * enseñarían otro.
 *
 * **Las listas vacías van con `= ANY(array)` y no con `IN (…)`.** Un `IN ()` es
 * un error de sintaxis, así que con cero ajenos —una cuenta donde nadie tiene
 * embudo asignado, que es lo normal— la consulta se caería entera. Con `ANY` de
 * un arreglo vacío el resultado es falso, y su negación cierta, que es justo lo
 * que hace falta: sin ajenos, entran todos.
 */
export function comoWhereDeAsesor(a: AQuienSeMira): Record<string, unknown> {
    switch (a.tipo) {
        case "una-persona":
            return { assignedAdvisorId: a.personaId };
        case "sin-asesor":
            return { assignedAdvisorId: null };
        case "estos":
            return { assignedAdvisorId: { in: a.asesores } };
        case "todos-menos":
            return { OR: [{ assignedAdvisorId: null }, { assignedAdvisorId: { notIn: a.ajenos } }] };
    }
}

/**
 * El mismo filtro en SQL. La columna es la de la BASE
 * (`assigned_advisor_id`): en SQL en crudo Prisma no traduce los `@map`, y
 * escribir `assignedAdvisorId` es el `42703` que ya costó un año de avisos que
 * nadie leía.
 */
function comoSqlDeAsesor(a: AQuienSeMira, alias: string): Prisma.Sql {
    const col = Prisma.raw(`${alias}."assigned_advisor_id"`);
    switch (a.tipo) {
        case "una-persona":
            return Prisma.sql`${col} = ${a.personaId}`;
        case "sin-asesor":
            return Prisma.sql`${col} IS NULL`;
        case "estos":
            return Prisma.sql`${col} = ANY(${[...a.asesores]}::text[])`;
        case "todos-menos":
            return Prisma.sql`(${col} IS NULL OR NOT (${col} = ANY(${[...a.ajenos]}::text[])))`;
    }
}

/**
 * Cuántas conversaciones hay en cada etapa de un embudo: un `COUNT`, no el
 * `length` de lo que se pudo cargar.
 *
 * El tablero trae como mucho `TOPE_DE_TARJETAS`, así que contar las tarjetas
 * pintadas da «cuántas de las primeras 500 cayeron aquí», que no es un número
 * que nadie pueda usar. Devuelve solo las etapas que tienen algo guardado; lo
 * que no tiene posición —o la tiene en una etapa borrada— lo reparte
 * `losTotalesPorEtapa` sobre la primera, que es donde se pinta.
 *
 * Es UNA consulta por carga del tablero. Entra por `embudo_posiciones_embudo_idx`
 * y de ahí a `Session` por su clave primaria; no toca `chat_messages` ni ninguna
 * de las tablas grandes.
 *
 * Lo vaciado NO se cuenta: si se contara, la cabecera de Perdido seguiría
 * diciendo doce sobre una columna que se acaba de quedar vacía.
 */
export async function losConteosPorEtapa(input: {
    embudoId: string;
    cuentaId: string;
    aQuien: AQuienSeMira;
}): Promise<Record<string, number>> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Array<{ etapaId: string; cuantas: number }>>`
            SELECT p."etapaId" AS "etapaId", COUNT(*)::int AS "cuantas"
            FROM "embudo_posiciones" p
            JOIN "Session" s ON s."id" = p."sessionId"
            WHERE p."embudoId" = ${input.embudoId}
              AND s."userId" = ${input.cuentaId}
              ${sinGruposSql("s")}
              AND ${comoSqlDeAsesor(input.aQuien, "s")}
              AND NOT EXISTS (SELECT 1 FROM "embudo_vaciadas" v WHERE v."sessionId" = p."sessionId")
            GROUP BY p."etapaId"
        `;
        const mapa: Record<string, number> = {};
        for (const f of filas) mapa[f.etapaId] = Number(f.cuantas);
        return mapa;
    });
}

/** Las siete etapas iniciales, para un embudo recién creado. */
function insertarLasEtapasIniciales(tx: Prisma.TransactionClient, embudoId: string) {
    const valores = ETAPAS_INICIALES.map(
        (e, i) => Prisma.sql`(${randomUUID()}, ${embudoId}, ${e.nombre}, ${e.color}, ${i}, ${e.sistema})`,
    );
    return tx.$executeRaw`
        INSERT INTO "embudo_etapas" ("id", "embudoId", "nombre", "colorHex", "orden", "sistema")
        VALUES ${Prisma.join(valores)}
    `;
}

/**
 * Crea un embudo con sus siete etapas. El primero de una cuenta nace como por
 * defecto: es a donde van las conversaciones sin asesor.
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
            await insertarLasEtapasIniciales(tx, id);
        });
    });
    return id;
}

/** Cómo se llama el embudo que nace solo. */
export const EMBUDO_POR_DEFECTO = "Embudo de ventas";

/**
 * **Toda cuenta nace con su embudo.** Si no tiene ninguno se le crea el por
 * defecto, con sus siete etapas, la primera vez que alguien abre el tablero.
 *
 * Se hace al LEER y no con una migración porque una migración solo alcanza a
 * las cuentas que ya existen: esto vale igual para la que se dé de alta mañana,
 * sin que nadie tenga que acordarse de sembrarle nada. Y cuesta **una vez en la
 * vida de la cuenta**: en cuanto hay un embudo, esta función mira la lista que
 * ya se había traído y no escribe nada.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **El candado es el que decide, no el `if`.** Dos pestañas abriendo el
 *    tablero a la vez leen las dos «no hay ninguno» y crearían dos embudos con
 *    el mismo nombre. `pg_advisory_xact_lock` sobre la cuenta las pone en fila,
 *    y la segunda vuelve a contar ya dentro del candado.
 * 2. **También corre si el primero en mirar es un asesor.** El embudo es de la
 *    CUENTA, no del que abrió la pantalla: sin esto, un equipo cuyo dueño no
 *    entra se quedaría sin embudo y sus asesores verían una pantalla vacía sin
 *    poder hacer nada.
 * 3. **Un embudo SIN ESTRENAR de la versión vieja se pone al día**: sus tres
 *    etapas son exactamente las de antes, nadie ha movido ni una tarjeta en él,
 *    así que cambiarlas no pierde nada y la cuenta ve las siete. Con una tarjeta
 *    colocada, o con las etapas ya tocadas, **no se toca**: el trabajo de
 *    alguien no se reescribe para que una pantalla quede más bonita.
 */
export async function asegurarElEmbudoPorDefecto(input: {
    cuentaId: string;
    creadoPorId: string;
}): Promise<{ creado: boolean; puestoAlDia: boolean }> {
    return conLasTablas(async () =>
        db.$transaction(async (tx) => {
            // El candado va por cuenta: dos cuentas abriendo su tablero a la vez
            // no se esperan.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`embudo:${input.cuentaId}`}))`;

            const embudos = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT "id" FROM "embudos" WHERE "cuentaId" = ${input.cuentaId}
                ORDER BY "orden" ASC, "creadoEn" ASC
            `;

            if (embudos.length === 0) {
                const id = randomUUID();
                await tx.$executeRaw`
                    INSERT INTO "embudos" ("id", "cuentaId", "nombre", "porDefecto", "orden", "creadoPorId")
                    VALUES (${id}, ${input.cuentaId}, ${EMBUDO_POR_DEFECTO}, TRUE, 0, ${input.creadoPorId})
                `;
                await insertarLasEtapasIniciales(tx, id);
                return { creado: true, puestoAlDia: false };
            }

            // ¿Hay uno sin estrenar de la versión de tres etapas? Se reconoce
            // por las dos cosas juntas: sus etapas son exactamente las viejas y
            // no tiene ninguna tarjeta colocada.
            let puestoAlDia = false;
            for (const { id } of embudos) {
                const etapas = await tx.$queryRaw<Array<{ nombre: string; sistema: string | null }>>`
                    SELECT "nombre", "sistema" FROM "embudo_etapas"
                    WHERE "embudoId" = ${id} ORDER BY "orden" ASC
                `;
                const sinEstrenar =
                    etapas.length === ETAPAS_INICIALES_VIEJAS.length &&
                    etapas.every((e, i) => e.nombre === ETAPAS_INICIALES_VIEJAS[i] && e.sistema === null);
                if (!sinEstrenar) continue;
                const [{ colocadas }] = await tx.$queryRaw<Array<{ colocadas: bigint }>>`
                    SELECT COUNT(*) AS "colocadas" FROM "embudo_posiciones" WHERE "embudoId" = ${id}
                `;
                if (Number(colocadas) > 0) continue;
                await tx.$executeRaw`DELETE FROM "embudo_etapas" WHERE "embudoId" = ${id}`;
                await insertarLasEtapasIniciales(tx, id);
                puestoAlDia = true;
            }
            return { creado: false, puestoAlDia };
        }),
    );
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
            // La papelera de este embudo se va con él: sus filas dicen «devuelve
            // esta conversación a la etapa X de este embudo», y sin el embudo no
            // hay dónde devolverla. **Son las conversaciones las que se quedan**:
            // dejar la fila de papelera sería dejarlas condenadas al borrado en
            // firme por un embudo que ya no existe.
            await tx.$executeRaw`DELETE FROM "embudo_vaciadas" WHERE "embudoId" = ${embudoId}`;
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
                    // `sistema` no se toca: la marca es de la fila y `EtapaPedida`
                    // solo la trae porque la leyó de aquí. Reescribirla sería
                    // dejar que una lista del navegador decidiera cuál es la
                    // columna de Perdido.
                    await tx.$executeRaw`
                        UPDATE "embudo_etapas"
                        SET "nombre" = ${etapa.nombre}, "colorHex" = ${etapa.color}, "orden" = ${orden}
                        WHERE "id" = ${etapa.id} AND "embudoId" = ${embudoId}
                    `;
                } else {
                    // Una etapa nueva nunca es de sistema: las tres las pone el
                    // embudo al nacer y no se añaden después.
                    await tx.$executeRaw`
                        INSERT INTO "embudo_etapas" ("id", "embudoId", "nombre", "colorHex", "orden", "sistema")
                        VALUES (${randomUUID()}, ${embudoId}, ${etapa.nombre}, ${etapa.color}, ${orden}, NULL)
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

// ─── La papelera de la columna de Perdido ────────────────────────────────────

/**
 * Los ids ya vaciados de una cuenta, para que el tablero no los pinte.
 *
 * **Se lee una vez por carga y se pasa como `notIn`**, que es lo que permite
 * dejar la consulta de tarjetas en Prisma tal como estaba. La lista no crece sin
 * fin: el barrido borra en firme a los treinta días, así que como mucho es lo
 * que esa cuenta vació en un mes. Aun así lleva tope y **lo que se recorta se
 * dice**: sin el aviso, una cuenta que se pasara vería reaparecer tarjetas
 * vaciadas sin ninguna explicación.
 */
export const TOPE_DE_VACIADAS_EN_MEMORIA = 5000;

export async function lasVaciadasDe(cuentaId: string): Promise<number[]> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Array<{ sessionId: number }>>`
            SELECT "sessionId" FROM "embudo_vaciadas"
            WHERE "cuentaId" = ${cuentaId}
            ORDER BY "vaciadoEn" DESC
            LIMIT ${TOPE_DE_VACIADAS_EN_MEMORIA}
        `;
        if (filas.length === TOPE_DE_VACIADAS_EN_MEMORIA) {
            console.warn("[embudos] la papelera llegó al tope que cabe en memoria", {
                cuenta: cuentaId,
                tope: TOPE_DE_VACIADAS_EN_MEMORIA,
            });
        }
        return filas.map((f) => Number(f.sessionId));
    });
}

/**
 * Cuántas conversaciones hay en una etapa, con el filtro puesto y sin las
 * vaciadas. Es el número que el diálogo de confirmación enseña, y es el mismo
 * `COUNT` que la cabecera de la columna.
 */
export async function cuantasHayEnLaEtapa(input: {
    embudoId: string;
    etapaId: string;
    cuentaId: string;
    aQuien: AQuienSeMira;
}): Promise<number> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Array<{ cuantas: number }>>`
            SELECT COUNT(*)::int AS "cuantas"
            FROM "embudo_posiciones" p
            JOIN "Session" s ON s."id" = p."sessionId"
            WHERE p."embudoId" = ${input.embudoId}
              AND p."etapaId" = ${input.etapaId}
              AND s."userId" = ${input.cuentaId}
              ${sinGruposSql("s")}
              AND ${comoSqlDeAsesor(input.aQuien, "s")}
              AND NOT EXISTS (SELECT 1 FROM "embudo_vaciadas" v WHERE v."sessionId" = p."sessionId")
        `;
        return Number(filas[0]?.cuantas ?? 0);
    });
}

/**
 * Vacía una etapa: las conversaciones pasan a la papelera y salen del tablero.
 *
 * **No borra ni una fila de ninguna otra tabla.** La ficha, el historial, las
 * etiquetas y los seguimientos se quedan enteros: de eso va «recuperable». Lo
 * único que se borra es su posición en el embudo, que es lo que la sacaba en esa
 * columna, y esa posición queda guardada en la papelera para poder devolverla.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Se vacía lo que se VE.** El filtro de asesor entra en la consulta, así
 *    que con un filtro puesto no se lleva por delante las conversaciones de los
 *    demás. Es la misma regla que «marcar todo marca lo que se ve», y no se
 *    deshace sin querer: el número que la persona confirmó sale de este mismo
 *    filtro (`cuantasHayEnLaEtapa`).
 * 2. **Va a trozos** (`TOPE_DE_LA_PAPELERA`) y **lo que queda se dice**. Una
 *    columna con miles de conversaciones no puede quedarse reescribiendo filas
 *    mientras alguien espera, y un «listo» que deja doscientas dentro es peor
 *    que un error.
 * 3. **El nombre y el número se copian** al entrar. La papelera tiene que poder
 *    decir de quién era cada conversación sin unir con `Session` en cada lectura.
 */
export async function vaciarLaEtapa(input: {
    embudoId: string;
    etapaId: string;
    cuentaId: string;
    aQuien: AQuienSeMira;
    vaciadoPorId: string;
}): Promise<{ vaciadas: number; quedan: number }> {
    return conLasTablas(async () =>
        db.$transaction(async (tx) => {
            const candidatas = await tx.$queryRaw<
                Array<{ sessionId: number; nombre: string; remoteJid: string }>
            >`
                SELECT p."sessionId" AS "sessionId",
                       COALESCE(NULLIF(TRIM(s."custom_name"), ''), s."pushName") AS "nombre",
                       s."remoteJid" AS "remoteJid"
                FROM "embudo_posiciones" p
                JOIN "Session" s ON s."id" = p."sessionId"
                WHERE p."embudoId" = ${input.embudoId}
                  AND p."etapaId" = ${input.etapaId}
                  AND s."userId" = ${input.cuentaId}
                  ${sinGruposSql("s")}
                  AND ${comoSqlDeAsesor(input.aQuien, "s")}
                  AND NOT EXISTS (SELECT 1 FROM "embudo_vaciadas" v WHERE v."sessionId" = p."sessionId")
                ORDER BY p."sessionId" ASC
                LIMIT ${TOPE_DE_LA_PAPELERA + 1}
            `;
            const lote = candidatas.slice(0, TOPE_DE_LA_PAPELERA);
            if (lote.length === 0) return { vaciadas: 0, quedan: 0 };

            const valores = lote.map(
                (c) => Prisma.sql`(${Number(c.sessionId)}, ${input.cuentaId}, ${input.embudoId},
                                   ${input.etapaId}, ${c.nombre ?? ""}, ${c.remoteJid ?? ""},
                                   ${input.vaciadoPorId})`,
            );
            await tx.$executeRaw`
                INSERT INTO "embudo_vaciadas"
                    ("sessionId", "cuentaId", "embudoId", "etapaId", "nombre", "remoteJid", "vaciadoPorId")
                VALUES ${Prisma.join(valores)}
                ON CONFLICT ("sessionId") DO NOTHING
            `;
            const ids = lote.map((c) => Number(c.sessionId));
            await tx.$executeRaw`
                DELETE FROM "embudo_posiciones"
                WHERE "embudoId" = ${input.embudoId} AND "sessionId" = ANY(${ids}::int[])
            `;
            return { vaciadas: lote.length, quedan: candidatas.length > TOPE_DE_LA_PAPELERA ? 1 : 0 };
        }),
    );
}

/** Lo que hay en la papelera de una cuenta, lo más reciente primero. */
export async function laPapeleraDe(cuentaId: string): Promise<EnLaPapelera[]> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<
            Array<{ sessionId: number; nombre: string; remoteJid: string; vaciadoEn: Date }>
        >`
            SELECT "sessionId", "nombre", "remoteJid", "vaciadoEn"
            FROM "embudo_vaciadas"
            WHERE "cuentaId" = ${cuentaId}
            ORDER BY "vaciadoEn" DESC
            LIMIT ${TOPE_DE_LA_PAPELERA}
        `;
        return filas.map((f) => ({
            sessionId: Number(f.sessionId),
            nombre: f.nombre || "Sin nombre",
            remoteJid: f.remoteJid,
            vaciadoEn: new Date(f.vaciadoEn).toISOString(),
            diasQueQuedan: diasQueQuedan(new Date(f.vaciadoEn)),
        }));
    });
}

/**
 * Devuelve conversaciones de la papelera a su etapa.
 *
 * Con `sessionIds` vacío se restaura la papelera entera de la cuenta, que es lo
 * que hace el botón de «Restaurar todo».
 *
 * **La etapa a la que vuelve sale de la papelera, no del navegador**, y si esa
 * etapa ya no existe la conversación vuelve igual: sin posición, así que cae en
 * la primera —«Nuevo»— por la regla de siempre. Lo que no puede pasar es que una
 * etapa borrada deje una conversación atrapada en la papelera hasta que el
 * barrido la borre en firme.
 */
export async function restaurarDeLaPapelera(input: {
    cuentaId: string;
    sessionIds: readonly number[];
}): Promise<number> {
    return conLasTablas(async () =>
        db.$transaction(async (tx) => {
            const todas = input.sessionIds.length === 0;
            const ids = [...input.sessionIds].slice(0, TOPE_DE_LA_PAPELERA);
            const filas = await tx.$queryRaw<
                Array<{ sessionId: number; embudoId: string; etapaId: string }>
            >`
                SELECT v."sessionId", v."embudoId", v."etapaId"
                FROM "embudo_vaciadas" v
                WHERE v."cuentaId" = ${input.cuentaId}
                  AND (${todas} OR v."sessionId" = ANY(${ids}::int[]))
                LIMIT ${TOPE_DE_LA_PAPELERA}
            `;
            if (filas.length === 0) return 0;

            for (const f of filas) {
                // Solo si su etapa sigue existiendo. Si no, se queda sin
                // posición y cae en la primera al leer.
                await tx.$executeRaw`
                    INSERT INTO "embudo_posiciones" ("sessionId", "embudoId", "etapaId", "actualizadoEn")
                    SELECT ${Number(f.sessionId)}, ${f.embudoId}, ${f.etapaId}, NOW()
                    WHERE EXISTS (
                        SELECT 1 FROM "embudo_etapas" e
                        WHERE e."id" = ${f.etapaId} AND e."embudoId" = ${f.embudoId}
                    )
                    ON CONFLICT ("sessionId", "embudoId")
                    DO UPDATE SET "etapaId" = EXCLUDED."etapaId", "actualizadoEn" = NOW()
                `;
            }
            const suyos = filas.map((f) => Number(f.sessionId));
            await tx.$executeRaw`
                DELETE FROM "embudo_vaciadas"
                WHERE "cuentaId" = ${input.cuentaId} AND "sessionId" = ANY(${suyos}::int[])
            `;
            return filas.length;
        }),
    );
}

/**
 * Las que ya pasaron de su plazo, las más viejas primero. Las lee el barrido
 * diario para borrarlas en firme.
 *
 * El parámetro va **moldeado** (`make_interval(days => $1::int)`): Prisma lo
 * manda sin tipo y `make_interval` solo acepta `int`, así que sin el molde la
 * consulta cae con «no existe la función».
 */
export async function lasQueLesTocaElBorradoEnFirme(input: {
    dias: number;
    limite: number;
}): Promise<Array<{ sessionId: number; cuentaId: string; nombre: string; remoteJid: string }>> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<
            Array<{ sessionId: number; cuentaId: string; nombre: string; remoteJid: string }>
        >`
            SELECT "sessionId", "cuentaId", "nombre", "remoteJid"
            FROM "embudo_vaciadas"
            WHERE "vaciadoEn" < NOW() - make_interval(days => ${input.dias}::int)
            ORDER BY "vaciadoEn" ASC
            LIMIT ${input.limite}
        `;
        return filas.map((f) => ({ ...f, sessionId: Number(f.sessionId) }));
    });
}

/** Saca una fila de la papelera, una vez borrada en firme. */
export async function olvidarDeLaPapelera(sessionId: number): Promise<void> {
    await conLasTablas(async () => {
        await db.$executeRaw`DELETE FROM "embudo_vaciadas" WHERE "sessionId" = ${sessionId}`;
    });
}
