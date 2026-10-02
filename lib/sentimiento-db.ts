import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { SERVER_TIME_ZONE } from "@/lib/utils";
import {
    cayoANegativo,
    elNegativoDesde,
    elTextoDelMensaje,
    llaveDelSentimiento,
    SENTIMIENTO_POR_DEFECTO,
    VERSION_DE_LA_CALIBRACION,
    type CaidaDelReporte,
    type MensajeParaAnalizar,
    type Sentimiento,
    type SentimientoDeLaConversacion,
} from "@/lib/sentimiento";

/**
 * Dónde vive el sentimiento de cada conversación de Chats.
 *
 * Dos tablas de la App, con `CREATE TABLE IF NOT EXISTS` y **sin clave
 * foránea**, como el resto. Ni una columna en `Session` ni en `chat_messages`:
 * `Session` es del backend (el #360), y `chat_messages` la escriben tres sitios
 * distintos.
 *
 * - `sentimiento_de_conversacion`: UNA fila por conversación
 *   (cuenta, línea, jid), con su último sentimiento. Es lo que pinta el aro del
 *   avatar y la franja de alerta.
 * - `sentimiento_caidas`: una fila cada vez que una conversación CAE a negativo,
 *   una como mucho por conversación y día, con el asesor que la llevaba en ese
 *   momento. Es lo que cuenta el reporte del CRM.
 *
 * Y la fila guarda las TRES identidades del contacto (`remoteJid`,
 * `remoteJidAlt`, `senderPn`): la lista trae al contacto por la que devuelva el
 * proveedor esa vuelta, y preguntar por una sola forma «devuelve correcto y
 * vacío» — la regla de siempre de Chats.
 */

let tablasListas: Promise<void> | null = null;

/** Dos réplicas: solo se traga «ya existe». La misma que `lib/embudos-db.ts`. */
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
            CREATE TABLE IF NOT EXISTS "sentimiento_de_conversacion" (
                "userId" TEXT NOT NULL,
                "instanceName" TEXT NOT NULL,
                "remoteJid" TEXT NOT NULL,
                "remoteJidAlt" TEXT,
                "senderPn" TEXT,
                "sentimiento" TEXT,
                "mensajeId" TEXT,
                "mensajeEn" TIMESTAMP(3),
                "negativoDesde" TIMESTAMP(3),
                "analizandoId" TEXT,
                "analizandoDesde" TIMESTAMP(3),
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY ("userId", "instanceName", "remoteJid")
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "sentimiento_de_conversacion_linea_idx"
            ON "sentimiento_de_conversacion" ("userId", "instanceName")
        `);
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "sentimiento_caidas" (
                "userId" TEXT NOT NULL,
                "instanceName" TEXT NOT NULL,
                "remoteJid" TEXT NOT NULL,
                "dia" DATE NOT NULL,
                "asesorId" TEXT,
                "sucedioEn" TIMESTAMP(3) NOT NULL,
                PRIMARY KEY ("userId", "instanceName", "remoteJid", "dia")
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "sentimiento_caidas_cuenta_dia_idx"
            ON "sentimiento_caidas" ("userId", "dia")
        `);
        // La versión de la calibración con la que se clasificó (ver
        // `VERSION_DE_LA_CALIBRACION`). La tabla ya está en producción: entra
        // con ADD COLUMN, no reescribiendo el CREATE. Sin valor = la 1.
        await ddl(() => db.$executeRaw`
            ALTER TABLE "sentimiento_de_conversacion" ADD COLUMN IF NOT EXISTS "calibracion" INTEGER
        `);
        // Y la de cada caída: el reporte solo cuenta las de la calibración
        // vigente, así los falsos «molesto» de la v1 no salen en él.
        await ddl(() => db.$executeRaw`
            ALTER TABLE "sentimiento_caidas" ADD COLUMN IF NOT EXISTS "calibracion" INTEGER
        `);
        // El interruptor de la CUENTA. Sin fila = apagada: así nacen las
        // cuentas nuevas y así quedan todas las que ya existían.
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "sentimiento_ajustes" (
                "cuentaId" TEXT PRIMARY KEY,
                "activa" BOOLEAN NOT NULL DEFAULT false,
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
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
        tablasListas = null;
        await asegurarLasTablas();
        return hacer();
    }
}

/* ── El interruptor de la cuenta ─────────────────────────────────────── */

/** Nunca falla: si no se puede leer, apagada — no se juzga a nadie que nadie pidió. */
export async function leerLosAjustesDelSentimiento(cuentaId: string): Promise<{ activa: boolean }> {
    try {
        const filas = await conLasTablas(() => db.$queryRaw<{ activa: boolean }[]>`
            SELECT "activa" FROM "sentimiento_ajustes" WHERE "cuentaId" = ${cuentaId}
        `);
        return { activa: filas[0]?.activa === true };
    } catch (error) {
        console.warn("[sentimiento] no se pudieron leer los ajustes", { cuentaId, error: String(error) });
        return { ...SENTIMIENTO_POR_DEFECTO };
    }
}

export async function guardarLosAjustesDelSentimiento(cuentaId: string, activa: boolean): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        INSERT INTO "sentimiento_ajustes" ("cuentaId", "activa", "actualizadoEn")
        VALUES (${cuentaId}, ${activa}, NOW())
        ON CONFLICT ("cuentaId") DO UPDATE SET "activa" = EXCLUDED."activa", "actualizadoEn" = NOW()
    `);
}

/** De estas cuentas, las que tienen la función ENCENDIDA. Si falla, ninguna. */
export async function lasCuentasConSentimiento(cuentas: readonly string[]): Promise<string[]> {
    if (!cuentas.length) return [];
    try {
        const filas = await conLasTablas(() => db.$queryRaw<{ cuentaId: string }[]>`
            SELECT "cuentaId" FROM "sentimiento_ajustes"
            WHERE "activa" = true AND "cuentaId" = ANY(${[...cuentas]}::text[])
        `);
        return filas.map((f) => f.cuentaId);
    } catch (error) {
        console.warn("[sentimiento] no se pudo saber qué cuentas tienen la función", String(error));
        return [];
    }
}

/**
 * La cuenta DUEÑA de una línea, en SQL: la de `Instancias`, prefiriendo la
 * fila de la conversación si coincide; sin línea conocida, la de la fila. Es
 * la misma regla con la que se elige quién paga (`pagador`), y por eso es
 * también la que decide si la función está encendida para esa conversación.
 */
function laDuenaDeLaLinea(linea: Prisma.Sql, fila: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`COALESCE((
        SELECT i."userId" FROM "Instancias" i
        WHERE i."instanceName" = ${linea}
        ORDER BY (i."userId" = ${fila}) DESC
        LIMIT 1
    ), ${fila})`;
}

/** De estas líneas, las que son de una cuenta con la función encendida. */
export async function lasLineasConSentimiento(lineas: readonly string[]): Promise<string[]> {
    if (!lineas.length) return [];
    try {
        const filas = await conLasTablas(() => db.$queryRaw<{ instanceName: string }[]>`
            SELECT DISTINCT i."instanceName"
            FROM "Instancias" i
            JOIN "sentimiento_ajustes" a ON a."cuentaId" = i."userId" AND a."activa" = true
            WHERE i."instanceName" = ANY(${[...lineas]}::text[])
        `);
        return filas.map((f) => f.instanceName);
    } catch (error) {
        console.warn("[sentimiento] no se pudo saber qué líneas tienen la función", String(error));
        return [];
    }
}

/** Un análisis que se reclamó y no terminó se puede volver a intentar pasado esto. */
export const RECLAMO_CADUCA_SEGUNDOS = 120;

/** Una conversación con un mensaje del cliente sin analizar. */
export type Pendiente = {
    userId: string;
    instanceName: string;
    remoteJid: string;
    remoteJidAlt: string | null;
    senderPn: string | null;
    messageId: string;
    messageTimestamp: Date;
    /**
     * La cuenta que PAGA el análisis: la dueña de la LÍNEA (`Instancias`), que
     * es la dueña de la conversación. Casi siempre es `userId`; no lo es en las
     * conversaciones que quedaron guardadas bajo otra fila (el dueño anterior de
     * la línea, la persona que la atendía), y a esas no se les puede cobrar a
     * una fila que normalmente no tiene bolsa: se quedarían pendientes para
     * siempre sin color. Sin línea conocida, `userId`.
     */
    pagador: string;
};

/**
 * Las conversaciones cuyo ÚLTIMO mensaje del cliente todavía no se analizó.
 *
 * **Sin ventana de tiempo**: se analiza al ABRIR Chats y tiene que cubrir TODO
 * lo pendiente de esas cuentas y líneas, no la última media hora. Lo que ya se
 * analizó y no tiene mensajes nuevos del cliente no sale (conserva su color).
 *
 * Se parte de `chat_conversations` —una fila por conversación, la misma que
 * pinta la bandeja— y no de `chat_messages`: recorrer la tabla de mensajes de
 * una cuenta entera para quedarse con el último de cada conversación es leer
 * cientos de miles de filas en cada apertura. Con la conversación delante se
 * descartan de entrada las que no se movieron desde su análisis
 * (`lastMessageTimestamp <= mensajeEn`), y del resto se pide el último
 * mensaje ENTRANTE por su índice exacto
 * (`chat_messages_user_instance_jid_ts_idx`), con un `LATERAL ... LIMIT 1`.
 *
 * Se mira el último mensaje ENTRANTE (`fromMe = false`) y no el último a secas:
 * con la IA activa el último es casi siempre su respuesta, y mirando ese no se
 * analizaría nunca nada. Grupos, estados y difusiones fuera: ahí no hay UN
 * cliente cuyo ánimo juzgar.
 */
export async function losPendientes(opciones: {
    cuentas: readonly string[];
    lineas?: readonly string[] | null;
    tope: number;
    /**
     * Cuentas pagadoras que ya se sabe que no tienen créditos: sus
     * conversaciones no salen, para que no tapen la página de las demás.
     */
    excluirPagadores?: readonly string[] | null;
}): Promise<Pendiente[]> {
    const tope = Math.max(1, Math.min(500, Math.floor(opciones.tope)));
    if (!opciones.cuentas.length) return [];
    const porLinea = opciones.lineas?.length
        ? Prisma.sql`AND c."instanceName" = ANY(${[...opciones.lineas]}::text[])`
        : Prisma.empty;
    const sinPagadores = opciones.excluirPagadores?.length
        ? Prisma.sql`AND COALESCE(il."userId", c."userId") <> ALL(${[...opciones.excluirPagadores]}::text[])`
        : Prisma.empty;
    return conLasTablas(() => db.$queryRaw<Pendiente[]>`
        SELECT c."userId", c."instanceName", c."remoteJid", u."remoteJidAlt", u."senderPn",
               u."messageId", u."messageTimestamp",
               COALESCE(il."userId", c."userId") AS "pagador"
        FROM "chat_conversations" c
        LEFT JOIN LATERAL (
            SELECT i."userId" FROM "Instancias" i
            WHERE i."instanceName" = c."instanceName"
            ORDER BY (i."userId" = c."userId") DESC
            LIMIT 1
        ) il ON TRUE
        LEFT JOIN "sentimiento_de_conversacion" s
          ON s."userId" = c."userId" AND s."instanceName" = c."instanceName" AND s."remoteJid" = c."remoteJid"
        CROSS JOIN LATERAL (
            SELECT m."remoteJidAlt", m."senderPn", m."messageId", m."messageTimestamp"
            FROM "chat_messages" m
            WHERE m."userId" = c."userId"
              AND m."instanceName" = c."instanceName"
              AND m."remoteJid" = c."remoteJid"
              AND m."fromMe" = false
            ORDER BY m."messageTimestamp" DESC
            LIMIT 1
        ) u
        WHERE c."userId" = ANY(${[...opciones.cuentas]}::text[])
          ${porLinea}
          ${sinPagadores}
          AND c."remoteJid" NOT LIKE '%@g.us'
          AND c."remoteJid" NOT LIKE '%@broadcast'
          AND c."remoteJid" NOT LIKE '%@newsletter'
          AND EXISTS (
            SELECT 1 FROM "sentimiento_ajustes" a
            WHERE a."cuentaId" = COALESCE(il."userId", c."userId") AND a."activa" = true
          )
          AND (s."mensajeEn" IS NULL OR s."mensajeEn" <= u."messageTimestamp")
          AND (
            (
              (s."mensajeEn" IS NULL OR c."lastMessageTimestamp" IS NULL OR c."lastMessageTimestamp" > s."mensajeEn")
              AND s."mensajeId" IS DISTINCT FROM u."messageId"
            )
            OR (s."sentimiento" = 'negativo' AND COALESCE(s."calibracion", 1) < ${VERSION_DE_LA_CALIBRACION}::int)
          )
          AND (
            s."analizandoId" IS NULL
            OR s."analizandoId" IS DISTINCT FROM u."messageId"
            OR s."analizandoDesde" < NOW() - make_interval(secs => ${RECLAMO_CADUCA_SEGUNDOS}::int)
          )
        ORDER BY u."messageTimestamp" DESC
        LIMIT ${tope}
    `);
}

/**
 * Reclama el análisis de un mensaje. Solo UNO lo consigue, aunque dos réplicas
 * lo intenten a la vez: el `ON CONFLICT DO UPDATE` bloquea la fila y su `WHERE`
 * deja fuera al segundo. Devuelve cómo estaba la conversación ANTES (lo que el
 * análisis necesita para saber si «cayó»), o `null` si otro se adelantó.
 */
export async function reclamarElAnalisis(p: Pendiente): Promise<
    { sentimiento: Sentimiento | null; negativoDesde: Date | null; recalibrando: boolean } | null
> {
    const filas = await conLasTablas(() => db.$queryRaw<
        { sentimiento: string | null; negativoDesde: Date | null; calibracion: number | null }[]
    >`
        INSERT INTO "sentimiento_de_conversacion" AS s
            ("userId", "instanceName", "remoteJid", "remoteJidAlt", "senderPn", "analizandoId", "analizandoDesde")
        VALUES (${p.userId}, ${p.instanceName}, ${p.remoteJid}, ${p.remoteJidAlt}, ${p.senderPn}, ${p.messageId}, NOW())
        ON CONFLICT ("userId", "instanceName", "remoteJid") DO UPDATE SET
            "analizandoId" = EXCLUDED."analizandoId",
            "analizandoDesde" = NOW(),
            "remoteJidAlt" = COALESCE(EXCLUDED."remoteJidAlt", s."remoteJidAlt"),
            "senderPn" = COALESCE(EXCLUDED."senderPn", s."senderPn")
        WHERE (
            s."mensajeId" IS DISTINCT FROM EXCLUDED."analizandoId"
            OR (s."sentimiento" = 'negativo' AND COALESCE(s."calibracion", 1) < ${VERSION_DE_LA_CALIBRACION}::int)
          )
          AND (
            s."analizandoId" IS NULL
            OR s."analizandoId" IS DISTINCT FROM EXCLUDED."analizandoId"
            OR s."analizandoDesde" < NOW() - make_interval(secs => ${RECLAMO_CADUCA_SEGUNDOS}::int)
          )
        RETURNING s."sentimiento", s."negativoDesde", s."calibracion"
    `);
    if (!filas.length) return null;
    const s = filas[0].sentimiento;
    const sentimiento = s === "positivo" || s === "neutro" || s === "negativo" ? s : null;
    return {
        sentimiento,
        negativoDesde: filas[0].negativoDesde,
        recalibrando: sentimiento === "negativo" && (filas[0].calibracion ?? 1) < VERSION_DE_LA_CALIBRACION,
    };
}

/** Los últimos mensajes de la conversación, en orden cronológico, para la IA. */
export async function losMensajesDeContexto(p: Pendiente, cuantos: number): Promise<MensajeParaAnalizar[]> {
    const identidades = [p.remoteJid, p.remoteJidAlt, p.senderPn].filter(
        (j): j is string => typeof j === "string" && j.length > 0,
    );
    const filas = await db.$queryRaw<
        { fromMe: boolean; content: string | null; messageType: string | null; transcripcion: string | null }[]
    >`
        SELECT m."fromMe", m."content", m."messageType", m."raw"->>'transcripcion' AS "transcripcion"
        FROM "chat_messages" m
        WHERE m."userId" = ${p.userId}
          AND m."instanceName" = ${p.instanceName}
          AND m."remoteJid" = ANY(${identidades}::text[])
          AND m."messageTimestamp" <= ${p.messageTimestamp}
        ORDER BY m."messageTimestamp" DESC
        LIMIT ${Math.max(1, Math.min(30, cuantos * 2))}
    `;
    return filas
        .reverse()
        .map((f) => ({ fromMe: Boolean(f.fromMe), texto: elTextoDelMensaje(f) }));
}

/** El día de un instante, en la zona del servidor (`YYYY-MM-DD`). */
export function elDiaDe(fecha: Date): string {
    return fecha.toLocaleDateString("sv-SE", { timeZone: SERVER_TIME_ZONE });
}

/**
 * Guarda el resultado. Solo quien reclamó escribe (`analizandoId`), y nunca un
 * mensaje más viejo encima de uno más nuevo. Si la conversación CAYÓ a
 * negativo, apunta la caída con el asesor que la llevaba en ese momento.
 */
export async function guardarElAnalisis(
    p: Pendiente,
    antes: { sentimiento: Sentimiento | null; negativoDesde: Date | null; recalibrando?: boolean },
    ahora: Sentimiento,
): Promise<{ guardado: boolean; cayo: boolean }> {
    const negativoDesde = elNegativoDesde(antes, ahora, p.messageTimestamp);
    const tocadas = await conLasTablas(() => db.$executeRaw`
        UPDATE "sentimiento_de_conversacion" SET
            "sentimiento" = ${ahora},
            "mensajeId" = ${p.messageId},
            "mensajeEn" = ${p.messageTimestamp},
            "negativoDesde" = ${negativoDesde},
            "calibracion" = ${VERSION_DE_LA_CALIBRACION}::int,
            "analizandoId" = NULL,
            "analizandoDesde" = NULL,
            "actualizadoEn" = NOW()
        WHERE "userId" = ${p.userId} AND "instanceName" = ${p.instanceName} AND "remoteJid" = ${p.remoteJid}
          AND "analizandoId" = ${p.messageId}
          AND ("mensajeEn" IS NULL OR "mensajeEn" <= ${p.messageTimestamp})
    `);
    if (!tocadas) return { guardado: false, cayo: false };
    // Una caída que solo existió por la calibración vieja y que con la nueva
    // NO es negativa se borra del reporte: era un falso «molesto». Solo esa
    // caída (por su fecha), nunca las demás de la conversación.
    if (antes.recalibrando && ahora !== "negativo" && antes.negativoDesde) {
        await conLasTablas(() => db.$executeRaw`
            DELETE FROM "sentimiento_caidas"
            WHERE "userId" = ${p.userId} AND "instanceName" = ${p.instanceName} AND "remoteJid" = ${p.remoteJid}
              AND "sucedioEn" = ${antes.negativoDesde}
        `).catch((error) => {
            console.warn("[sentimiento] no se pudo quitar una caída de la calibración vieja", {
                linea: p.instanceName,
                motivo: (error as Error)?.message,
            });
        });
    }
    if (!cayoANegativo(antes.sentimiento, ahora)) return { guardado: true, cayo: false };

    const asesorId = await elAsesorDeLaConversacion(p).catch((error) => {
        console.warn("[sentimiento] no se pudo leer el asesor de la conversación", {
            linea: p.instanceName,
            motivo: (error as Error)?.message,
        });
        return null;
    });
    await conLasTablas(() => db.$executeRaw`
        INSERT INTO "sentimiento_caidas" ("userId", "instanceName", "remoteJid", "dia", "asesorId", "sucedioEn", "calibracion")
        VALUES (${p.userId}, ${p.instanceName}, ${p.remoteJid}, ${elDiaDe(p.messageTimestamp)}::date, ${asesorId}, ${p.messageTimestamp}, ${VERSION_DE_LA_CALIBRACION}::int)
        ON CONFLICT ("userId", "instanceName", "remoteJid", "dia") DO NOTHING
    `);
    return { guardado: true, cayo: true };
}

/** Suelta un reclamo que no se pudo terminar, para que la vuelta siguiente lo reintente. */
export async function soltarElReclamo(p: Pendiente): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        UPDATE "sentimiento_de_conversacion" SET "analizandoId" = NULL, "analizandoDesde" = NULL
        WHERE "userId" = ${p.userId} AND "instanceName" = ${p.instanceName} AND "remoteJid" = ${p.remoteJid}
          AND "analizandoId" = ${p.messageId}
    `);
}

/**
 * El asesor que lleva la conversación: el de su ficha en ESA línea, buscada por
 * todas las identidades. `assigned_advisor_id` es la columna de la BASE (en SQL
 * en crudo Prisma no traduce los `@map`).
 */
async function elAsesorDeLaConversacion(p: Pendiente): Promise<string | null> {
    const identidades = [p.remoteJid, p.remoteJidAlt, p.senderPn].filter(
        (j): j is string => typeof j === "string" && j.length > 0,
    );
    const filas = await db.$queryRaw<{ asesor: string | null }[]>`
        SELECT s."assigned_advisor_id" AS "asesor"
        FROM "Session" s
        LEFT JOIN "Instancias" i ON i."instanceName" = ${p.instanceName} AND i."userId" = s."userId"
        WHERE s."userId" = ${p.userId}
          AND (s."remoteJid" = ANY(${identidades}::text[]) OR s."remoteJidAlt" = ANY(${identidades}::text[]))
        ORDER BY (s."instanceId" = ${p.instanceName} OR s."instanceId" = i."instanceId") DESC NULLS LAST,
                 s."updatedAt" DESC
        LIMIT 1
    `;
    return filas[0]?.asesor ?? null;
}

/**
 * Lo que viaja con la lista de chats: el sentimiento de TODAS las conversaciones
 * analizadas de estas cuentas y líneas —positivo, neutro y negativo—, bajo cada
 * una de sus identidades.
 *
 * Neutro viaja también. Antes no, con el argumento de que «sin fila la pantalla
 * pinta lo de siempre»; pero lo de siempre era un aro del color del FONDO, así
 * que una conversación neutra no se distinguía de una sin analizar y el aro
 * gris no existía. Es una fila por conversación y ya se leía por el mismo
 * índice: no cuesta más consulta.
 */
export async function losSentimientosDeLasLineas(
    cuentas: readonly string[],
    lineas: readonly string[],
): Promise<Record<string, SentimientoDeLaConversacion>> {
    if (!cuentas.length || !lineas.length) return {};
    const filas = await conLasTablas(() => db.$queryRaw<
        {
            instanceName: string;
            remoteJid: string;
            remoteJidAlt: string | null;
            senderPn: string | null;
            sentimiento: string;
            negativoDesde: Date | null;
        }[]
    >`
        SELECT s."instanceName", s."remoteJid", s."remoteJidAlt", s."senderPn",
               CASE WHEN s."sentimiento" = 'negativo' AND COALESCE(s."calibracion", 1) < ${VERSION_DE_LA_CALIBRACION}::int
                    THEN 'neutro' ELSE s."sentimiento" END AS "sentimiento",
               s."negativoDesde"
        FROM "sentimiento_de_conversacion" s
        WHERE s."userId" = ANY(${[...cuentas]}::text[])
          AND s."instanceName" = ANY(${[...lineas]}::text[])
          AND s."sentimiento" IN ('positivo', 'neutro', 'negativo')
          AND EXISTS (
            SELECT 1 FROM "sentimiento_ajustes" a
            WHERE a."activa" = true
              AND a."cuentaId" = ${laDuenaDeLaLinea(Prisma.sql`s."instanceName"`, Prisma.sql`s."userId"`)}
          )
    `);
    const salida: Record<string, SentimientoDeLaConversacion> = {};
    for (const f of filas) {
        const valor: SentimientoDeLaConversacion = {
            sentimiento: f.sentimiento as Sentimiento,
            negativoDesde: f.sentimiento === "negativo" && f.negativoDesde ? f.negativoDesde.toISOString() : null,
        };
        for (const jid of [f.remoteJid, f.remoteJidAlt, f.senderPn]) {
            if (jid) salida[llaveDelSentimiento(f.instanceName, jid)] = valor;
        }
    }
    return salida;
}

/** Las caídas a negativo de estas cuentas desde un día, agrupadas por día y asesor. */
export async function lasCaidas(cuentas: readonly string[], desde: string): Promise<CaidaDelReporte[]> {
    if (!cuentas.length) return [];
    const filas = await conLasTablas(() => db.$queryRaw<
        { dia: string; asesorId: string | null; asesorNombre: string | null; cantidad: number }[]
    >`
        SELECT to_char(c."dia", 'YYYY-MM-DD') AS "dia", c."asesorId",
               MAX(u."name") AS "asesorNombre", COUNT(*)::int AS "cantidad"
        FROM "sentimiento_caidas" c
        LEFT JOIN "User" u ON u."id" = c."asesorId"
        WHERE c."userId" = ANY(${[...cuentas]}::text[])
          AND c."dia" >= ${desde}::date
          AND COALESCE(c."calibracion", 1) >= ${VERSION_DE_LA_CALIBRACION}::int
        GROUP BY c."dia", c."asesorId"
        ORDER BY c."dia"
    `);
    return filas.map((f) => ({ ...f, cantidad: Number(f.cantidad) }));
}
