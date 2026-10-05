import "server-only";

import { db } from "@/lib/db";
import { abrir, sellar } from "@/lib/correo-cifrado.server";
import { comoModoDeReunion, elFinalDeLaClave, type AjustesParaGuardar, type ModoDeReunion } from "@/lib/videollamada-ia";

/**
 * Dónde vive la videollamada con IA. Dos tablas de la App, con
 * `CREATE TABLE IF NOT EXISTS` y **sin clave foránea** (ni una columna en
 * `User` ni en `Appointment`: son del backend, #360):
 *
 * | tabla | una fila por |
 * | --- | --- |
 * | `videollamada_ajustes` | CUENTA: modo, `persona_id` y la clave SELLADA |
 * | `videollamadas_ia` | CITA: la conversación de Tavus, cuándo entró, la transcripción |
 *
 * La clave de Tavus es de CADA cuenta: no hay una fija en el sistema. Se guarda
 * con `sellar` (AES-256-GCM, la misma llave que las credenciales de correo) y
 * lo único que sale de aquí hacia una pantalla es su final (`claveFinal`).
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
    personaId: string | null;
    /** Últimos 4 de la clave guardada, o `null` si no hay. Nunca la clave. */
    claveFinal: string | null;
};

const SIN_AJUSTES: AjustesDeLaVideollamada = { modo: "enlace", personaId: null, claveFinal: null };

export async function leerLosAjustes(cuentaId: string): Promise<AjustesDeLaVideollamada> {
    if (!cuentaId) return SIN_AJUSTES;
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<{ modo: string; personaId: string | null; claveFinal: string | null }[]>`
            SELECT "modo", "personaId", "claveFinal" FROM "videollamada_ajustes"
            WHERE "cuentaId" = ${cuentaId} LIMIT 1
        `;
        const f = filas[0];
        if (!f) return SIN_AJUSTES;
        return { modo: comoModoDeReunion(f.modo), personaId: f.personaId, claveFinal: f.claveFinal };
    });
}

/** Solo para el servidor que llama a Tavus. Nunca se devuelve a una pantalla. */
export async function laClaveDeTavus(cuentaId: string): Promise<{ clave: string; personaId: string } | null> {
    if (!cuentaId) return null;
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<{ modo: string; personaId: string | null; claveSellada: string | null }[]>`
            SELECT "modo", "personaId", "claveSellada" FROM "videollamada_ajustes"
            WHERE "cuentaId" = ${cuentaId} LIMIT 1
        `;
        const f = filas[0];
        if (!f || comoModoDeReunion(f.modo) !== "tavus" || !f.personaId) return null;
        const abierta = abrir<{ clave: string }>(f.claveSellada);
        return abierta?.clave ? { clave: abierta.clave, personaId: f.personaId } : null;
    });
}

export async function guardarLosAjustes(cuentaId: string, ajustes: AjustesParaGuardar): Promise<AjustesDeLaVideollamada> {
    const sellada = ajustes.clave ? sellar({ clave: ajustes.clave }) : null;
    const final = ajustes.clave ? elFinalDeLaClave(ajustes.clave) : null;
    await conLasTablas(async () => {
        // Una clave vacía CONSERVA la guardada (COALESCE).
        await db.$executeRaw`
            INSERT INTO "videollamada_ajustes" ("cuentaId", "modo", "personaId", "claveSellada", "claveFinal", "actualizadoEn")
            VALUES (${cuentaId}, ${ajustes.modo}, ${ajustes.personaId}, ${sellada}, ${final}, CURRENT_TIMESTAMP)
            ON CONFLICT ("cuentaId") DO UPDATE SET
                "modo" = EXCLUDED."modo",
                "personaId" = EXCLUDED."personaId",
                "claveSellada" = COALESCE(EXCLUDED."claveSellada", "videollamada_ajustes"."claveSellada"),
                "claveFinal" = COALESCE(EXCLUDED."claveFinal", "videollamada_ajustes"."claveFinal"),
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
