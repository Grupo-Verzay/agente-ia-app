import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sinGruposSql } from "@/lib/conversaciones-de-grupo";
import type { ConversacionEvaluada, Resolvio, Responsable } from "@/lib/calidad-de-conversaciones";

/**
 * Dónde vive la calidad: `calidad_conversaciones`, UNA fila por conversación
 * (cuenta + línea + contacto).
 *
 * Tabla de la App, con `CREATE TABLE IF NOT EXISTS` y **sin clave foránea**,
 * como todas las demás. Ni una columna en `Session` ni en `chat_messages`:
 * las dos las escribe también el backend, y añadirles columnas desde aquí es
 * lo que reventó el #360.
 *
 * Una fila por conversación, y no una por evaluación, a propósito: lo que se
 * mira es «cómo está atendida esta conversación», y una conversación evaluada
 * cinco veces no puede contar cinco veces en el promedio de su asesor. Cuando
 * entran mensajes nuevos, la fila se REESCRIBE con la evaluación de ahora.
 *
 * Y guarda **números y una frase**, nunca el texto de la conversación: el
 * texto ya está en `chat_messages`, y una copia aquí sería un segundo sitio
 * donde vive lo que dijo un cliente — que habría que borrar también cuando
 * alguien borre ese chat.
 */

let tablaLista: Promise<void> | null = null;

/** Dos réplicas: el «ya existe» se traga, cualquier otro error sube. */
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
            CREATE TABLE IF NOT EXISTS "calidad_conversaciones" (
                "id" TEXT PRIMARY KEY,
                "cuentaId" TEXT NOT NULL,
                "instanceName" TEXT NOT NULL,
                "remoteJid" TEXT NOT NULL,
                "sessionId" INTEGER,
                "contacto" TEXT,
                "asesorId" TEXT,
                "responsable" TEXT NOT NULL DEFAULT 'sin_asignar',
                "puntaje" INTEGER,
                "saludo" INTEGER,
                "tono" INTEGER,
                "resolvio" TEXT,
                "primeraRespuestaSeg" INTEGER,
                "resolucionSeg" INTEGER,
                "mejora" TEXT NOT NULL DEFAULT '',
                "ejemplo" BOOLEAN NOT NULL DEFAULT FALSE,
                "motivo" TEXT,
                "mensajes" INTEGER NOT NULL DEFAULT 0,
                "tokens" INTEGER NOT NULL DEFAULT 0,
                "ultimoMensajeEn" TIMESTAMP(3) NOT NULL,
                "evaluadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "calidad_conversaciones_cuenta_ultimo_idx"
            ON "calidad_conversaciones" ("cuentaId", "ultimoMensajeEn" DESC)
        `);
    })().catch((error) => {
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

function esTablaQueFalta(error: unknown): boolean {
    const e = error as { code?: string; meta?: { code?: string }; message?: string };
    return e?.meta?.code === "42P01" || e?.code === "42P01" || Boolean(e?.message?.includes("42P01"));
}

async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLaTabla();
    try {
        return await hacer();
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        // El recuerdo de «ya la creé» es del proceso, no de la base.
        tablaLista = null;
        await asegurarLaTabla();
        return hacer();
    }
}

export interface CandidataDeCalidad {
    instanceName: string;
    remoteJid: string;
    remoteJidAlt: string | null;
    senderPn: string | null;
    pushName: string | null;
    ultimoMensajeEn: Date;
}

/**
 * Las conversaciones de una cuenta que toca evaluar: con actividad en la
 * ventana y que no se hayan
 * evaluado desde su último mensaje.
 *
 * Sale de `chat_conversations`, que es una fila por conversación y lleva la
 * hora del último mensaje: barrer `chat_messages` para esto sería recorrer la
 * tabla más grande de la plataforma para contestar algo que ya está resumido.
 * Entra por `chat_conversations_user_last_ts_idx`.
 *
 * **Sin grupos** (`sinGruposSql`): esto es CRM, y un grupo no es un cliente al
 * que se atiende. Y sin estados ni difusiones, que no son conversaciones.
 */
export async function lasConversacionesPorEvaluar(params: {
    cuentaId: string;
    desde: Date;
    hasta: Date;
    tope: number;
}): Promise<CandidataDeCalidad[]> {
    return conLaTabla(() =>
        db.$queryRaw<CandidataDeCalidad[]>`
            SELECT c."instanceName", c."remoteJid", c."remoteJidAlt", c."senderPn", c."pushName",
                   c."lastMessageTimestamp" AS "ultimoMensajeEn"
            FROM "chat_conversations" c
            LEFT JOIN "calidad_conversaciones" q
              ON q."id" = c."userId" || '::' || c."instanceName" || '::' || c."remoteJid"
            WHERE c."userId" = ${params.cuentaId}
              AND c."lastMessageTimestamp" >= ${params.desde}
              AND c."lastMessageTimestamp" <= ${params.hasta}
              ${sinGruposSql("c")}
              AND lower(c."remoteJid") NOT LIKE '%@broadcast'
              AND lower(c."remoteJid") NOT LIKE '%@newsletter'
              AND (q."id" IS NULL OR q."ultimoMensajeEn" < c."lastMessageTimestamp")
            ORDER BY c."lastMessageTimestamp" DESC
            LIMIT ${params.tope}
        `,
    );
}

export interface FilaDeCalidad {
    id: string;
    cuentaId: string;
    instanceName: string;
    remoteJid: string;
    sessionId: number | null;
    contacto: string | null;
    asesorId: string | null;
    responsable: Responsable;
    puntaje: number | null;
    saludo: number | null;
    tono: number | null;
    resolvio: Resolvio | null;
    primeraRespuestaSeg: number | null;
    resolucionSeg: number | null;
    mejora: string;
    ejemplo: boolean;
    /** Por qué no hay puntaje, cuando no lo hay. */
    motivo: string | null;
    mensajes: number;
    tokens: number;
    ultimoMensajeEn: Date;
}

/** Guarda (o reescribe) la evaluación de una conversación. */
export async function guardarLaEvaluacion(f: FilaDeCalidad): Promise<void> {
    await conLaTabla(() => db.$executeRaw`
        INSERT INTO "calidad_conversaciones" (
            "id", "cuentaId", "instanceName", "remoteJid", "sessionId", "contacto", "asesorId",
            "responsable", "puntaje", "saludo", "tono", "resolvio", "primeraRespuestaSeg",
            "resolucionSeg", "mejora", "ejemplo", "motivo", "mensajes", "tokens",
            "ultimoMensajeEn", "evaluadoEn"
        ) VALUES (
            ${f.id}, ${f.cuentaId}, ${f.instanceName}, ${f.remoteJid}, ${f.sessionId}, ${f.contacto}, ${f.asesorId},
            ${f.responsable}, ${f.puntaje}, ${f.saludo}, ${f.tono}, ${f.resolvio}, ${f.primeraRespuestaSeg},
            ${f.resolucionSeg}, ${f.mejora}, ${f.ejemplo}, ${f.motivo}, ${f.mensajes}, ${f.tokens},
            ${f.ultimoMensajeEn}, NOW()
        )
        ON CONFLICT ("id") DO UPDATE SET
            "sessionId" = EXCLUDED."sessionId",
            "contacto" = EXCLUDED."contacto",
            "asesorId" = EXCLUDED."asesorId",
            "responsable" = EXCLUDED."responsable",
            "puntaje" = EXCLUDED."puntaje",
            "saludo" = EXCLUDED."saludo",
            "tono" = EXCLUDED."tono",
            "resolvio" = EXCLUDED."resolvio",
            "primeraRespuestaSeg" = EXCLUDED."primeraRespuestaSeg",
            "resolucionSeg" = EXCLUDED."resolucionSeg",
            "mejora" = EXCLUDED."mejora",
            "ejemplo" = EXCLUDED."ejemplo",
            "motivo" = EXCLUDED."motivo",
            "mensajes" = EXCLUDED."mensajes",
            "tokens" = EXCLUDED."tokens",
            "ultimoMensajeEn" = EXCLUDED."ultimoMensajeEn",
            "evaluadoEn" = NOW()
    `);
}

/**
 * Lo evaluado de unas cuentas en una ventana, para el tablero. Solo las que
 * tienen puntaje: las que no se pudieron evaluar (sin respuesta, sin texto) no
 * son conversaciones atendidas, y meterlas en la lista la llenaría de filas
 * sin nada que mirar.
 */
export async function laCalidadDeLasCuentas(params: {
    cuentas: string[];
    desde: Date;
    tope: number;
}): Promise<ConversacionEvaluada[]> {
    if (params.cuentas.length === 0) return [];
    const filas = await conLaTabla(() =>
        db.$queryRaw<(Omit<ConversacionEvaluada, "evaluadoEn" | "ultimoMensajeEn"> & { evaluadoEn: Date; ultimoMensajeEn: Date })[]>`
            SELECT "id", "cuentaId", "instanceName", "remoteJid", "contacto", "asesorId", "responsable",
                   "puntaje", "saludo", "tono", "resolvio", "primeraRespuestaSeg", "resolucionSeg",
                   "mejora", "ejemplo", "evaluadoEn", "ultimoMensajeEn"
            FROM "calidad_conversaciones"
            WHERE "cuentaId" IN (${Prisma.join(params.cuentas)})
              AND "ultimoMensajeEn" >= ${params.desde}
              AND "puntaje" IS NOT NULL
            ORDER BY "ultimoMensajeEn" DESC
            LIMIT ${params.tope}
        `,
    );
    return filas.map((f) => ({
        ...f,
        evaluadoEn: f.evaluadoEn.toISOString(),
        ultimoMensajeEn: f.ultimoMensajeEn.toISOString(),
    }));
}

/** Cuándo se evaluó por última vez algo de estas cuentas: para decirlo en pantalla. */
export async function laUltimaEvaluacion(cuentas: string[]): Promise<Date | null> {
    if (cuentas.length === 0) return null;
    const filas = await conLaTabla(() =>
        db.$queryRaw<{ ultima: Date | null }[]>`
            SELECT MAX("evaluadoEn") AS "ultima" FROM "calidad_conversaciones"
            WHERE "cuentaId" IN (${Prisma.join(cuentas)})
        `,
    );
    return filas[0]?.ultima ?? null;
}
