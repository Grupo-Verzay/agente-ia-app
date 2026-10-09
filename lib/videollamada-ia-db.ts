import "server-only";

import { randomUUID } from "crypto";

import { db } from "@/lib/db";
import { elMensajeDeLaVideollamada, laGrabacionParaElCrm } from "@/lib/grabacion-de-videollamada";
import { abrir, sellar } from "@/lib/correo-cifrado.server";
import { comoCapacidad, laCapacidadQueVale } from "@/lib/capacidad-de-multiagenda";
import { elEnlaceConSufijo, comoModoDeReunion, comoLimiteDeMinutos, LIMITE_DE_FABRICA_MIN, elAvatarDelEntorno, elAvatarQueUsa, type Avatar, type AjustesParaGuardar, type ModoDeReunion } from "@/lib/videollamada-ia";

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
 * El avatar de la casa (el Pal «Verzy») sale del entorno (`elAvatarDeVerzay`).
 * Una cuenta puede tener el SUYO en `propioPersonaId` + `propioClaveSellada`
 * (sellada con la llave del correo; `elAvatarDeLaCuenta`). Son columnas
 * NUEVAS a propósito: `personaId`, `claveSellada` y `claveFinal` quedan de la
 * primera versión con datos de prueba y no se leen.
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
        await ddl(() => db.$executeRaw`ALTER TABLE "videollamada_ajustes" ADD COLUMN IF NOT EXISTS "propioPersonaId" TEXT`);
        await ddl(() => db.$executeRaw`ALTER TABLE "videollamada_ajustes" ADD COLUMN IF NOT EXISTS "propioClaveSellada" TEXT`);
        await ddl(() => db.$executeRaw`ALTER TABLE "videollamada_ajustes" ADD COLUMN IF NOT EXISTS "limiteMinutos" INTEGER`);
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
            CREATE TABLE IF NOT EXISTS "multiagenda_capacidad" (
                "teamId" TEXT PRIMARY KEY,
                "capacidad" INTEGER NOT NULL DEFAULT 1,
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "videollamada_enlaces" (
                "enlace" TEXT PRIMARY KEY,
                "citaId" TEXT NOT NULL UNIQUE,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "videollamada_envios" (
                "citaId" TEXT NOT NULL,
                "llave" TEXT NOT NULL,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY ("citaId", "llave")
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "videollamada_personas_derivadas" (
                "origenPersonaId" TEXT PRIMARY KEY,
                "derivadaPersonaId" TEXT NOT NULL,
                "huella" TEXT NOT NULL,
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "videollamadas_ia_conversacion_idx"
            ON "videollamadas_ia" ("conversacionId")
        `);
        // La grabación de la SALA (la graba el navegador del cliente; Tavus
        // no puede escribir en MinIO). Una fila por cada vez que se abre la
        // sala: una reconexión sigue en la misma, una recarga abre otra.
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "videollamada_grabaciones" (
                "id" TEXT PRIMARY KEY,
                "citaId" TEXT NOT NULL,
                "cuentaId" TEXT NOT NULL,
                "estado" TEXT NOT NULL DEFAULT 'grabando',
                "formato" TEXT NOT NULL DEFAULT 'webm',
                "trozosAudio" INTEGER NOT NULL DEFAULT 0,
                "trozosVideo" INTEGER NOT NULL DEFAULT 0,
                "bytes" BIGINT NOT NULL DEFAULT 0,
                "segundos" INTEGER,
                "audioUrl" TEXT,
                "videoUrl" TEXT,
                "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "vistaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "cerradaEn" TIMESTAMP(3)
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "videollamada_grabaciones_cita_idx"
            ON "videollamada_grabaciones" ("citaId")
        `);
        // Cada VOZ de la grabación (la de Verzy, el micrófono, cada persona)
        // va en su propio fichero y dice cuándo empezó respecto al video: el
        // servidor las mezcla al cerrar (`lasOrdenesDeLaMezcla`).
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "videollamada_grabacion_voces" (
                "grabacionId" TEXT NOT NULL,
                "pista" INTEGER NOT NULL,
                "desdeMs" INTEGER NOT NULL,
                "trozos" INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY ("grabacionId", "pista")
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

/* ── Ajustes de la cuenta ──────────────────────────────────────────────── */

export type AjustesDeLaVideollamada = {
    modo: ModoDeReunion;
    /** Cuánto dura como mucho cada videollamada, en minutos (30 si no se cambia). */
    limiteMinutos: number;
    /** Si la plataforma tiene su avatar configurado (sin él no hay modo Tavus). */
    disponible: boolean;
};

/** El avatar fijo de la plataforma. Solo para el servidor que llama a Tavus. */
export function elAvatarDeVerzay(): { clave: string; personaId: string } | null {
    return elAvatarDelEntorno({ TAVUS_API_KEY: process.env.TAVUS_API_KEY, TAVUS_PERSONA_ID: process.env.TAVUS_PERSONA_ID });
}

/**
 * El avatar con el que se crea la videollamada de una cuenta: el suyo si lo
 * tiene, y si no el de la casa. Si el suyo no se puede leer (tabla o llave),
 * se usa el de la casa y se dice: una cita no se queda sin videollamada por eso.
 */
export async function elAvatarDeLaCuenta(cuentaId: string): Promise<Avatar | null> {
    const casa = elAvatarDeVerzay();
    if (!cuentaId) return casa;
    try {
        const filas = await conLasTablas(() => db.$queryRaw<{ personaId: string | null; sellada: string | null }[]>`
            SELECT "propioPersonaId" AS "personaId", "propioClaveSellada" AS "sellada"
            FROM "videollamada_ajustes" WHERE "cuentaId" = ${cuentaId} LIMIT 1
        `);
        const f = filas[0];
        if (!f?.personaId || !f.sellada) return casa;
        const abierta = abrir<{ clave: string }>(f.sellada);
        if (!abierta) console.warn("[videollamada] la clave propia de Tavus no se pudo abrir; se usa la de la casa", { cuenta: cuentaId });
        return elAvatarQueUsa({ clave: abierta?.clave, personaId: f.personaId }, casa);
    } catch (error) {
        console.warn("[videollamada] no se pudo leer el avatar propio; se usa el de la casa", { cuenta: cuentaId, error: String(error) });
        return casa;
    }
}

/**
 * Pone (o quita, con `null`) el avatar PROPIO de una cuenta. Solo servidor:
 * no hay pantalla todavía, y la clave nunca vuelve al navegador. Lo que no
 * tiene forma de clave o de persona se rechaza en vez de guardarse a medias.
 */
export async function guardarElAvatarPropio(cuentaId: string, avatar: { clave: string; personaId: string } | null): Promise<{ ok: boolean; motivo?: string }> {
    if (!cuentaId) return { ok: false, motivo: "Falta la cuenta." };
    let personaId: string | null = null;
    let sellada: string | null = null;
    if (avatar) {
        const valido = elAvatarQueUsa(avatar, null);
        if (!valido) return { ok: false, motivo: "La clave o el persona_id de Tavus no tienen forma válida." };
        personaId = valido.personaId;
        sellada = sellar({ clave: valido.clave });
    }
    await conLasTablas(() => db.$executeRaw`
        INSERT INTO "videollamada_ajustes" ("cuentaId", "propioPersonaId", "propioClaveSellada", "actualizadoEn")
        VALUES (${cuentaId}, ${personaId}, ${sellada}, CURRENT_TIMESTAMP)
        ON CONFLICT ("cuentaId") DO UPDATE SET
            "propioPersonaId" = EXCLUDED."propioPersonaId",
            "propioClaveSellada" = EXCLUDED."propioClaveSellada",
            "actualizadoEn" = CURRENT_TIMESTAMP
    `);
    return { ok: true };
}

export async function leerLosAjustes(cuentaId: string): Promise<AjustesDeLaVideollamada> {
    const disponible = Boolean(await elAvatarDeLaCuenta(cuentaId));
    if (!cuentaId) return { modo: "enlace", limiteMinutos: LIMITE_DE_FABRICA_MIN, disponible };
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<{ modo: string; limiteMinutos: number | null }[]>`
            SELECT "modo", "limiteMinutos" FROM "videollamada_ajustes"
            WHERE "cuentaId" = ${cuentaId} LIMIT 1
        `;
        return { modo: comoModoDeReunion(filas[0]?.modo), limiteMinutos: comoLimiteDeMinutos(filas[0]?.limiteMinutos), disponible };
    });
}

export async function guardarLosAjustes(cuentaId: string, ajustes: AjustesParaGuardar): Promise<AjustesDeLaVideollamada> {
    await conLasTablas(async () => {
        await db.$executeRaw`
            INSERT INTO "videollamada_ajustes" ("cuentaId", "modo", "limiteMinutos", "actualizadoEn")
            VALUES (${cuentaId}, ${ajustes.modo}, ${comoLimiteDeMinutos(ajustes.limiteMinutos)}, CURRENT_TIMESTAMP)
            ON CONFLICT ("cuentaId") DO UPDATE SET
                "modo" = EXCLUDED."modo",
                "limiteMinutos" = EXCLUDED."limiteMinutos",
                "actualizadoEn" = CURRENT_TIMESTAMP
        `;
    });
    return leerLosAjustes(cuentaId);
}

/* ── Multiagenda: videollamadas a la vez por turno ─────────────────────── */

/**
 * Cuántas citas a la vez admite un especialista del equipo (`multiagenda_capacidad`,
 * una fila por EQUIPO, tabla de la App). La guardada, sin mirar el modo: la que
 * cuenta de verdad la decide `laCapacidadQueVale` (con el enlace fijo, 1).
 */
export async function laCapacidadGuardada(teamId: string): Promise<number> {
    if (!teamId) return 1;
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<{ capacidad: number }[]>`
            SELECT "capacidad" FROM "multiagenda_capacidad" WHERE "teamId" = ${teamId} LIMIT 1
        `;
        return comoCapacidad(filas[0]?.capacidad);
    });
}

export async function guardarLaCapacidad(teamId: string, capacidad: number): Promise<number> {
    const valor = comoCapacidad(capacidad);
    await conLasTablas(() => db.$executeRaw`
        INSERT INTO "multiagenda_capacidad" ("teamId", "capacidad", "actualizadoEn")
        VALUES (${teamId}, ${valor}, CURRENT_TIMESTAMP)
        ON CONFLICT ("teamId") DO UPDATE SET
            "capacidad" = EXCLUDED."capacidad",
            "actualizadoEn" = CURRENT_TIMESTAMP
    `);
    return valor;
}

/** La que cuenta para reservar: la guardada si la cuenta está en Tavus, si no 1. Un fallo es 1. */
export async function laCapacidadDelEquipo(teamId: string, cuentaId: string): Promise<number> {
    try {
        const [guardada, ajustes] = await Promise.all([laCapacidadGuardada(teamId), leerLosAjustes(cuentaId)]);
        return laCapacidadQueVale(guardada, ajustes.modo);
    } catch (error) {
        console.warn("[multiagenda] no se pudo leer la capacidad; se usa 1", { equipo: teamId, error });
        return 1;
    }
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

/* ── La grabación de la sala ───────────────────────────────────────── */

export type GrabacionDeLaSala = {
    id: string;
    citaId: string;
    cuentaId: string;
    estado: "grabando" | "juntando" | "lista" | "fallida";
    formato: "webm" | "mp4";
    /** Cuántos trozos subió de cada pista (uno cada ~10 s). */
    trozosAudio: number;
    trozosVideo: number;
    bytes: number;
    segundos: number | null;
    audioUrl: string | null;
    videoUrl: string | null;
};

/**
 * Abre una grabación para la sala de esta cita. `null` si la cita ya llegó a
 * su tope de grabaciones (la ruta se abre sin sesión: es su techo).
 */
export async function empezarLaGrabacionDeLaSala(citaId: string, cuentaId: string, formato: "webm" | "mp4", tope: number): Promise<string | null> {
    return conLasTablas(async () => {
        const id = randomUUID();
        const tocadas = await db.$executeRaw`
            INSERT INTO "videollamada_grabaciones" ("id", "citaId", "cuentaId", "formato")
            SELECT ${id}, ${citaId}, ${cuentaId}, ${formato}
            WHERE (SELECT COUNT(*) FROM "videollamada_grabaciones" WHERE "citaId" = ${citaId}) < ${tope}
        `;
        return Number(tocadas) > 0 ? id : null;
    });
}

export async function laGrabacionDeLaSala(id: string): Promise<GrabacionDeLaSala | null> {
    if (!id) return null;
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<GrabacionDeLaSala[]>`
            SELECT "id", "citaId", "cuentaId", "estado", "formato", "trozosAudio", "trozosVideo",
                   "bytes"::float8 AS "bytes", "segundos", "audioUrl", "videoUrl"
            FROM "videollamada_grabaciones" WHERE "id" = ${id} LIMIT 1
        `;
        return filas[0] ?? null;
    });
}

/**
 * Apunta un trozo YA guardado en el bucket. El contador es el número más alto
 * (`GREATEST`), no una suma: un trozo repetido no deja el contador por delante
 * de los trozos de verdad.
 */
export async function apuntarElTrozoDeLaSala(input: { id: string; cual: "audio" | "video"; numero: number; bytes: number }): Promise<void> {
    await conLasTablas(() =>
        input.cual === "video"
            ? db.$executeRaw`
                UPDATE "videollamada_grabaciones"
                SET "trozosVideo" = GREATEST("trozosVideo", ${input.numero}), "bytes" = "bytes" + ${input.bytes}, "vistaEn" = CURRENT_TIMESTAMP
                WHERE "id" = ${input.id} AND "estado" = 'grabando'
            `
            : db.$executeRaw`
                UPDATE "videollamada_grabaciones"
                SET "trozosAudio" = GREATEST("trozosAudio", ${input.numero}), "bytes" = "bytes" + ${input.bytes}, "vistaEn" = CURRENT_TIMESTAMP
                WHERE "id" = ${input.id} AND "estado" = 'grabando'
            `,
    );
}

/** Cuántas voces lleva ya una grabación (el techo de la ruta sin sesión). */
export async function cuantasVocesTiene(grabacionId: string): Promise<{ pistas: number[] }> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<{ pista: number }[]>`
            SELECT "pista" FROM "videollamada_grabacion_voces" WHERE "grabacionId" = ${grabacionId}
        `;
        return { pistas: filas.map((f) => Number(f.pista)) };
    });
}

/**
 * Apunta un trozo de VOZ ya guardado: crea la voz la primera vez (con su
 * `desdeMs`) y sube su contador al número más alto. Solo con la grabación
 * aún `grabando`, como los demás trozos.
 */
export async function apuntarElTrozoDeLaVoz(input: { id: string; pista: number; desdeMs: number; numero: number; bytes: number }): Promise<void> {
    await conLasTablas(async () => {
        const tocadas = await db.$executeRaw`
            UPDATE "videollamada_grabaciones"
            SET "bytes" = "bytes" + ${input.bytes}, "vistaEn" = CURRENT_TIMESTAMP
            WHERE "id" = ${input.id} AND "estado" = 'grabando'
        `;
        if (Number(tocadas) === 0) return;
        await db.$executeRaw`
            INSERT INTO "videollamada_grabacion_voces" ("grabacionId", "pista", "desdeMs", "trozos")
            VALUES (${input.id}, ${input.pista}::int, ${input.desdeMs}::int, ${input.numero}::int)
            ON CONFLICT ("grabacionId", "pista")
            DO UPDATE SET "trozos" = GREATEST("videollamada_grabacion_voces"."trozos", EXCLUDED."trozos")
        `;
    });
}

/** Las voces de una grabación, en orden. */
export async function lasVocesDeLaGrabacion(grabacionId: string): Promise<{ pista: number; desdeMs: number; trozos: number }[]> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<{ pista: number; desdeMs: number; trozos: number }[]>`
            SELECT "pista", "desdeMs", "trozos" FROM "videollamada_grabacion_voces"
            WHERE "grabacionId" = ${grabacionId} ORDER BY "pista"
        `;
        return filas.map((f) => ({ pista: Number(f.pista), desdeMs: Number(f.desdeMs), trozos: Number(f.trozos) }));
    });
}

/**
 * Reclama el cierre: pasa de `grabando` a `juntando` y devuelve la fila solo a
 * UNO de los que cierran a la vez (el botón de colgar, el aviso de que la
 * pestaña se va y el barrido pueden coincidir).
 */
export async function reclamarElCierreDeLaSala(id: string): Promise<GrabacionDeLaSala | null> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<GrabacionDeLaSala[]>`
            UPDATE "videollamada_grabaciones" SET "estado" = 'juntando'
            WHERE "id" = ${id} AND "estado" = 'grabando'
            RETURNING "id", "citaId", "cuentaId", "estado", "formato", "trozosAudio", "trozosVideo",
                      "bytes"::float8 AS "bytes", "segundos", "audioUrl", "videoUrl"
        `;
        return filas[0] ?? null;
    });
}

export async function cerrarLaGrabacionDeLaSala(input: {
    id: string;
    estado: "lista" | "fallida";
    segundos: number;
    audioUrl: string | null;
    videoUrl: string | null;
}): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        UPDATE "videollamada_grabaciones"
        SET "estado" = ${input.estado}, "segundos" = ${input.segundos},
            "audioUrl" = ${input.audioUrl}, "videoUrl" = ${input.videoUrl}, "cerradaEn" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.id}
    `);
}

/** Las que se quedaron en `grabando` porque la pestaña murió sin avisar. */
export async function lasGrabacionesDeLaSalaSinCerrar(horas: number, limite: number): Promise<{ id: string; segundos: number }[]> {
    return conLasTablas(() => db.$queryRaw<{ id: string; segundos: number }[]>`
        SELECT "id", GREATEST(0, EXTRACT(EPOCH FROM ("vistaEn" - "creadaEn")))::int AS "segundos"
        FROM "videollamada_grabaciones"
        WHERE "estado" = 'grabando' AND "vistaEn" < CURRENT_TIMESTAMP - make_interval(hours => ${horas}::int)
        ORDER BY "vistaEn" ASC
        LIMIT ${limite}::int
    `);
}

/**
 * Lleva la grabación de la sala a la fila del CRM (`chat_messages`,
 * `tavus_<cita>`), mezclando en `raw.call` sin tocar lo demás (la
 * transcripción, el resumen).
 *
 * La llaman los DOS que pueden llegar segundos: el cierre de la grabación y la
 * transcripción de Tavus (que crea la fila). Cada uno escribe lo suyo y LUEGO
 * llama a esto, así que el último de los dos siempre ve lo del otro.
 *
 * De varias grabaciones (una recarga abre otra) gana la más larga. Devuelve
 * `true` si la fila existía y se tocó.
 */
export async function copiarLaGrabacionAlCrm(citaId: string): Promise<boolean> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<{ audioUrl: string | null; videoUrl: string | null }[]>`
            SELECT "audioUrl", "videoUrl" FROM "videollamada_grabaciones"
            WHERE "citaId" = ${citaId} AND "estado" = 'lista'
            ORDER BY COALESCE("segundos", 0) DESC, "creadaEn" DESC
            LIMIT 1
        `;
        const grabacion = filas[0] ? laGrabacionParaElCrm(filas[0]) : null;
        if (!grabacion) return false;
        const tocadas = await db.$executeRaw`
            UPDATE "chat_messages"
            SET "raw" = jsonb_set(
                    COALESCE("raw"::jsonb, '{}'::jsonb),
                    '{call}',
                    (COALESCE("raw"::jsonb -> 'call', '{}'::jsonb) || ${JSON.stringify(grabacion)}::jsonb)
                ),
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "messageId" = ${elMensajeDeLaVideollamada(citaId)} AND "messageType" = 'call'
        `;
        return Number(tocadas) > 0;
    });
}

/* ── Los enlaces mandados por WhatsApp durante la llamada ───────────── */

/**
 * Apunta que en esta cita ya se mandó ESTE enlace. Devuelve `true` solo la
 * primera vez: quien decide es el `ON CONFLICT`, así que dos pestañas que
 * reciben la misma orden del avatar no lo mandan dos veces.
 */
export async function anotarElEnvio(citaId: string, llave: string): Promise<boolean> {
    const n = await conLasTablas(() => db.$executeRaw`
        INSERT INTO "videollamada_envios" ("citaId", "llave") VALUES (${citaId}, ${llave})
        ON CONFLICT DO NOTHING
    `);
    return n > 0;
}

/** Suelta la marca de un envío que no salió, para poder reintentarlo. */
export async function soltarElEnvio(citaId: string, llave: string): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        DELETE FROM "videollamada_envios" WHERE "citaId" = ${citaId} AND "llave" = ${llave}
    `);
}

/* ── El enlace con nombre ──────────────────────────────────────────────── */

/**
 * El enlace con nombre de una cita (`videollamada_enlaces`): se crea UNA vez y
 * no cambia aunque cambie el nombre, para que lo ya enviado siga abriendo.
 * Si el nombre ya lo usa otra cita, se prueba «-2», «-3»… — quien decide es
 * el `ON CONFLICT` de Postgres, no una lectura previa.
 */
export async function elEnlaceDeLaCita(citaId: string, base: string): Promise<string> {
    await asegurarLasTablas();
    const ya = await db.$queryRaw<{ enlace: string }[]>`
        SELECT "enlace" FROM "videollamada_enlaces" WHERE "citaId" = ${citaId} LIMIT 1`;
    if (ya[0]) return ya[0].enlace;
    for (let intento = 1; intento <= 50; intento++) {
        const candidato = elEnlaceConSufijo(base, intento);
        const puestas = await db.$executeRaw`
            INSERT INTO "videollamada_enlaces" ("enlace", "citaId") VALUES (${candidato}, ${citaId})
            ON CONFLICT DO NOTHING`;
        if (puestas > 0) return candidato;
        const otra = await db.$queryRaw<{ enlace: string }[]>`
            SELECT "enlace" FROM "videollamada_enlaces" WHERE "citaId" = ${citaId} LIMIT 1`;
        if (otra[0]) return otra[0].enlace; // otra pestaña la creó a la vez
    }
    throw new Error("no quedó ningún enlace con nombre libre");
}

/** La cita de un enlace con nombre, o `null`. */
export async function laCitaDelEnlace(enlace: string): Promise<string | null> {
    await asegurarLasTablas();
    const filas = await db.$queryRaw<{ citaId: string }[]>`
        SELECT "citaId" FROM "videollamada_enlaces" WHERE "enlace" = ${enlace} LIMIT 1`;
    return filas[0]?.citaId ?? null;
}

/* ── La persona derivada (copia con las herramientas) ──────────────────── */

/**
 * La copia de una persona de Tavus que lleva nuestras herramientas, cuando a
 * la original no se le pueden poner (ver `lib/persona-derivada.ts`). Una fila
 * por persona ORIGINAL; la huella dice de qué versión de la original salió.
 */
export async function laCopiaGuardada(origenPersonaId: string): Promise<{ derivadaPersonaId: string; huella: string } | null> {
    const filas = await conLasTablas(() => db.$queryRaw<{ derivadaPersonaId: string; huella: string }[]>`
        SELECT "derivadaPersonaId", "huella" FROM "videollamada_personas_derivadas"
        WHERE "origenPersonaId" = ${origenPersonaId} LIMIT 1
    `);
    return filas[0] ?? null;
}

export async function guardarLaCopia(origenPersonaId: string, derivadaPersonaId: string, huella: string): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        INSERT INTO "videollamada_personas_derivadas" ("origenPersonaId", "derivadaPersonaId", "huella", "actualizadoEn")
        VALUES (${origenPersonaId}, ${derivadaPersonaId}, ${huella}, CURRENT_TIMESTAMP)
        ON CONFLICT ("origenPersonaId") DO UPDATE SET
            "derivadaPersonaId" = EXCLUDED."derivadaPersonaId",
            "huella" = EXCLUDED."huella",
            "actualizadoEn" = CURRENT_TIMESTAMP
    `);
}
