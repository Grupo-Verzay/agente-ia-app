import "server-only";

import { db } from "@/lib/db";
import { comoModoDeReunion, elAvatarDelEntorno, type AjustesParaGuardar, type ModoDeReunion } from "@/lib/videollamada-ia";

/**
 * Dónde vive la videollamada con IA. Dos tablas de la App, con
 * `CREATE TABLE IF NOT EXISTS` y **sin clave foránea** (ni una columna en
 * `User` ni en `Appointment`: son del backend, #360):
 *
 * | tabla | una fila por |
 * | --- | --- |
 * | `videollamada_ajustes` | CUENTA: el modo de reunión |
 * | `videollamadas_ia` | CITA: la conversación de Tavus, cuándo entró, la transcripción |
 *
 * El avatar es UNO para toda la plataforma (el Pal «Verzy»): su persona y su
 * clave salen del entorno (`elAvatarDeVerzay`). Las columnas `personaId`,
 * `claveSellada` y `claveFinal` quedan de la primera versión y ya no se leen.
 *
 * El backend LEE estas dos tablas en SQL crudo (el reloj de ausencia) y tolera
 * que no existan: sin fila, la cuenta está en el modo de siempre.
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
    tablasListas ??= (async () => {
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "videollamada_ajustes" (
                "cuentaId" TEXT PRIMARY KEY,
                "modo" TEXT NOT NULL DEFAULT 'enlace',
                "personaId" TEXT,
                "claveSellada" TEXT,
                "claveFinal" TEXT,
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "videollamadas_ia" (
                "citaId" TEXT PRIMARY KEY,
                "cuentaId" TEXT NOT NULL,
                "conversacionId" TEXT,
                "conversacionUrl" TEXT,
                "estado" TEXT NOT NULL DEFAULT 'creando',
                "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "entroEn" TIMESTAMP(3),
                "finalizadaEn" TIMESTAMP(3),
                "transcripcion" TEXT,
                "resumen" TEXT,
                "grabacionUrl" TEXT,
                "mensajeId" TEXT
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "videollamadas_ia_conversacion_idx"
            ON "videollamadas_ia" ("conversacionId")
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

/* ── Ajustes de la cuenta ──────────────────────────────────────────────── */

export type AjustesDeLaVideollamada = {
    modo: ModoDeReunion;
    /** Si la plataforma tiene su avatar configurado (sin él no hay modo Tavus). */
    disponible: boolean;
};

/** El avatar fijo de la plataforma. Solo para el servidor que llama a Tavus. */
export function elAvatarDeVerzay(): { clave: string; personaId: string } | null {
    return elAvatarDelEntorno({ TAVUS_API_KEY: process.env.TAVUS_API_KEY, TAVUS_PERSONA_ID: process.env.TAVUS_PERSONA_ID });
}

export async function leerLosAjustes(cuentaId: string): Promise<AjustesDeLaVideollamada> {
    const disponible = Boolean(elAvatarDeVerzay());
    if (!cuentaId) return { modo: "enlace", disponible };
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<{ modo: string }[]>`
            SELECT "modo" FROM "videollamada_ajustes"
            WHERE "cuentaId" = ${cuentaId} LIMIT 1
        `;
        return { modo: comoModoDeReunion(filas[0]?.modo), disponible };
    });
}

export async function guardarLosAjustes(cuentaId: string, ajustes: AjustesParaGuardar): Promise<AjustesDeLaVideollamada> {
    await conLasTablas(async () => {
        await db.$executeRaw`
            INSERT INTO "videollamada_ajustes" ("cuentaId", "modo", "actualizadoEn")
            VALUES (${cuentaId}, ${ajustes.modo}, CURRENT_TIMESTAMP)
            ON CONFLICT ("cuentaId") DO UPDATE SET
                "modo" = EXCLUDED."modo",
                "actualizadoEn" = CURRENT_TIMESTAMP
        `;
    });
    return leerLosAjustes(cuentaId);
}

/* ── La videollamada de una cita ───────────────────────────────────────── */

export type VideollamadaDeLaCita = {
    citaId: string;
    cuentaId: string;
    conversacionId: string | null;
    conversacionUrl: string | null;
    estado: string;
    entroEn: Date | null;
    transcripcion: string | null;
    mensajeId: string | null;
};

export async function laVideollamada(citaId: string): Promise<VideollamadaDeLaCita | null> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<VideollamadaDeLaCita[]>`
            SELECT "citaId", "cuentaId", "conversacionId", "conversacionUrl", "estado", "entroEn", "transcripcion", "mensajeId"
            FROM "videollamadas_ia" WHERE "citaId" = ${citaId} LIMIT 1
        `;
        return filas[0] ?? null;
    });
}

/**
 * Reclama la creación de la conversación. Devuelve `true` solo a UNA de dos
 * pestañas que abren a la vez: la otra espera y reutiliza. Un reclamo que se
 * quedó en `creando` más de un minuto (el proceso murió) se puede volver a
 * reclamar.
 */
export async function reclamarLaCreacion(citaId: string, cuentaId: string): Promise<boolean> {
    return conLasTablas(async () => {
        const tocadas = await db.$executeRaw`
            INSERT INTO "videollamadas_ia" ("citaId", "cuentaId", "estado", "creadaEn")
            VALUES (${citaId}, ${cuentaId}, 'creando', CURRENT_TIMESTAMP)
            ON CONFLICT ("citaId") DO UPDATE SET "estado" = 'creando', "creadaEn" = CURRENT_TIMESTAMP
            WHERE "videollamadas_ia"."conversacionUrl" IS NULL
              AND ("videollamadas_ia"."estado" <> 'creando'
                   OR "videollamadas_ia"."creadaEn" < CURRENT_TIMESTAMP - INTERVAL '1 minute')
               OR "videollamadas_ia"."estado" = 'finalizada'
        `;
        return Number(tocadas) > 0;
    });
}

export async function apuntarLaConversacion(citaId: string, conversacionId: string, url: string): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        UPDATE "videollamadas_ia"
        SET "conversacionId" = ${conversacionId}, "conversacionUrl" = ${url}, "estado" = 'activa'
        WHERE "citaId" = ${citaId}
    `);
}

export async function soltarElReclamo(citaId: string): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        UPDATE "videollamadas_ia" SET "estado" = 'fallida'
        WHERE "citaId" = ${citaId} AND "conversacionUrl" IS NULL
    `);
}

/** «Entró» es abrir el enlace: el reloj de ausencia deja de contar. */
export async function marcarQueEntro(citaId: string): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        UPDATE "videollamadas_ia" SET "entroEn" = COALESCE("entroEn", CURRENT_TIMESTAMP)
        WHERE "citaId" = ${citaId}
    `);
}

/** Guarda la transcripción UNA vez. Devuelve `true` solo a quien la escribió. */
export async function guardarLaTranscripcion(citaId: string, transcripcion: string, resumen: string | null): Promise<boolean> {
    return conLasTablas(async () => {
        const tocadas = await db.$executeRaw`
            UPDATE "videollamadas_ia"
            SET "transcripcion" = ${transcripcion}, "resumen" = ${resumen},
                "estado" = 'finalizada', "finalizadaEn" = COALESCE("finalizadaEn", CURRENT_TIMESTAMP)
            WHERE "citaId" = ${citaId} AND "transcripcion" IS NULL
        `;
        return Number(tocadas) > 0;
    });
}

export async function apuntarElMensaje(citaId: string, mensajeId: string): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        UPDATE "videollamadas_ia" SET "mensajeId" = ${mensajeId} WHERE "citaId" = ${citaId}
    `);
}

export async function apuntarLaGrabacion(citaId: string, url: string): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        UPDATE "videollamadas_ia" SET "grabacionUrl" = ${url} WHERE "citaId" = ${citaId}
    `);
}

export async function marcarFinalizada(citaId: string): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        UPDATE "videollamadas_ia" SET "estado" = 'finalizada', "finalizadaEn" = COALESCE("finalizadaEn", CURRENT_TIMESTAMP)
        WHERE "citaId" = ${citaId}
    `);
}
