import "server-only";

import { randomUUID } from "crypto";

import { db } from "@/lib/db";
import {
    MARGEN_DE_PRESENCIA_MS,
    TIMBRE_MAXIMO_MS,
    type EstadoDeLlamada,
    type FinDeLlamada,
} from "@/lib/llamada-de-voz";

/**
 * Las dos tablas de las llamadas de voz, y el latido que dice quién está.
 *
 * **De la App y creadas por la App**, con `CREATE TABLE IF NOT EXISTS` y sin
 * clave foránea, como `team_chat_messages`, `task_comments` y `flows`.
 *
 * `llamadas_de_voz` es a la vez el registro y **el canal de señalización**: la
 * oferta y la respuesta SDP viven en dos columnas de la fila. No hace falta más
 * porque el WebRTC de esta App es non-trickle —una oferta, una respuesta— y no
 * un goteo de candidatos.
 *
 * Y una cosa que conviene saber antes de tocarla: **las dos columnas SDP se
 * vacían al terminar**. Son un par de kilobytes cada una, no sirven para nada
 * una vez conectada la llamada, y dejarlas guardaría para siempre las
 * direcciones IP de las dos puntas — que es un dato de la red de alguien.
 */

let listas: Promise<void> | null = null;

function asegurarLasTablas(): Promise<void> {
    listas ??= (async () => {
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "llamadas_de_voz" (
                "id" TEXT PRIMARY KEY,
                "canalId" TEXT NOT NULL,
                "cuentaId" TEXT NOT NULL,
                "dellamaId" TEXT NOT NULL,
                "aQuienId" TEXT NOT NULL,
                "estado" TEXT NOT NULL DEFAULT 'sonando',
                "oferta" TEXT,
                "respuesta" TEXT,
                "fin" TEXT,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "contestadaEn" TIMESTAMP(3),
                "terminadaEn" TIMESTAMP(3)
            )
        `;
        // Lo que pregunta el reloj: «¿me está sonando algo?». Por destinatario
        // y estado, que es exactamente el `WHERE`.
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "llamadas_de_voz_a_quien_idx"
            ON "llamadas_de_voz" ("aQuienId", "estado")
        `;
        // Y la otra mitad: quien llama espera su respuesta.
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "llamadas_de_voz_de_llama_idx"
            ON "llamadas_de_voz" ("dellamaId", "estado")
        `;
        // El latido. Una fila por persona, que se pisa: no es un histórico de
        // presencia —eso crecería sin fin— sino «cuándo se le vio por última
        // vez». Es lo único que hace falta para no dejar sonando a nadie.
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "presencia_del_equipo" (
                "personaId" TEXT PRIMARY KEY,
                "vistoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
    })().catch((e) => {
        listas = null;
        throw e;
    });
    return listas;
}

/**
 * El `42P01` de Prisma **no está donde parece**: en una consulta en crudo el
 * `code` de primer nivel es el de Prisma (`P2010`) y el de Postgres viaja
 * dentro, en `meta.code`. Se miran los dos sitios y el texto.
 */
function faltaLaTabla(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
    if (e.code === "42P01" || e.meta?.code === "42P01") return true;
    return typeof e.message === "string" && e.message.includes("42P01");
}

/**
 * El recuerdo de «ya las creé» es **del proceso, no de la base**: si las tablas
 * desaparecen por debajo, todas las consultas fallarían hasta reiniciar. Ante
 * un `42P01` se olvida, se crean y se reintenta **una** vez.
 */
async function conLasTablas<T>(consulta: () => Promise<T>): Promise<T> {
    await asegurarLasTablas();
    try {
        return await consulta();
    } catch (error) {
        if (!faltaLaTabla(error)) throw error;
        listas = null;
        await asegurarLasTablas();
        return consulta();
    }
}

export type FilaDeLlamada = {
    id: string;
    canalId: string;
    cuentaId: string;
    dellamaId: string;
    aQuienId: string;
    estado: EstadoDeLlamada;
    oferta: string | null;
    respuesta: string | null;
    fin: FinDeLlamada | null;
    creadoEn: Date;
    contestadaEn: Date | null;
    terminadaEn: Date | null;
};

/**
 * Dejar el latido, y de paso saber si el otro está.
 *
 * Se escribe en **cada vuelta del reloj**, que pasa por el servidor de todas
 * formas: la presencia sale gratis y no hay un sistema aparte que mantener.
 */
export async function dejarElLatido(personaId: string): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        INSERT INTO "presencia_del_equipo" ("personaId", "vistoEn")
        VALUES (${personaId}, NOW())
        ON CONFLICT ("personaId") DO UPDATE SET "vistoEn" = NOW()
    `);
}

/** Cuándo se vio por última vez a alguien, o `null` si nunca. */
export async function cuandoSeLeVio(personaId: string): Promise<Date | null> {
    const filas = await conLasTablas(() => db.$queryRaw<Array<{ vistoEn: Date }>>`
        SELECT "vistoEn" FROM "presencia_del_equipo" WHERE "personaId" = ${personaId}
    `);
    return filas[0]?.vistoEn ?? null;
}

/** Crear la llamada, con la oferta ya dentro. */
export async function crearLaLlamada(input: {
    canalId: string;
    cuentaId: string;
    dellamaId: string;
    aQuienId: string;
    oferta: string;
}): Promise<string> {
    const id = randomUUID();
    await conLasTablas(() => db.$executeRaw`
        INSERT INTO "llamadas_de_voz"
            ("id", "canalId", "cuentaId", "dellamaId", "aQuienId", "estado", "oferta")
        VALUES (${id}, ${input.canalId}, ${input.cuentaId}, ${input.dellamaId},
                ${input.aQuienId}, 'sonando', ${input.oferta})
    `);
    return id;
}

const COLUMNAS = `"id", "canalId", "cuentaId", "dellamaId", "aQuienId", "estado",
                  "oferta", "respuesta", "fin", "creadoEn", "contestadaEn", "terminadaEn"`;

/**
 * Lo que el reloj de una persona necesita saber, **en una sola consulta**.
 *
 * Las dos mitades a la vez: la que me está sonando y la que yo lancé. Con dos
 * consultas serían el doble de viajes en un reloj que corre en todas las
 * pantallas de la plataforma — «muchas peticiones pequeñas son turno».
 */
export async function loQueMeIncumbe(personaId: string): Promise<FilaDeLlamada[]> {
    return conLasTablas(() => db.$queryRawUnsafe<FilaDeLlamada[]>(
        `SELECT ${COLUMNAS} FROM "llamadas_de_voz"
         WHERE "estado" <> 'terminada'
           AND ("aQuienId" = $1 OR "dellamaId" = $1)
         ORDER BY "creadoEn" DESC
         LIMIT 5`,
        personaId,
    ));
}

export async function laLlamada(id: string): Promise<FilaDeLlamada | null> {
    const filas = await conLasTablas(() => db.$queryRawUnsafe<FilaDeLlamada[]>(
        `SELECT ${COLUMNAS} FROM "llamadas_de_voz" WHERE "id" = $1`,
        id,
    ));
    return filas[0] ?? null;
}

/**
 * Contestar: guarda la respuesta SDP y pasa a `en_curso`.
 *
 * **Condicionado a que siguiera sonando** (`AND "estado" = 'sonando'`), y
 * devuelve si tocó fila. Sin eso, contestar una llamada que la otra punta
 * acababa de cortar la dejaría «en curso» contra nadie — y quien contestó se
 * quedaría escuchando un silencio sin saber por qué.
 */
export async function contestarLaLlamada(id: string, respuesta: string): Promise<boolean> {
    const tocadas = await conLasTablas(() => db.$executeRaw`
        UPDATE "llamadas_de_voz"
        SET "estado" = 'en_curso', "respuesta" = ${respuesta}, "contestadaEn" = NOW()
        WHERE "id" = ${id} AND "estado" = 'sonando'
    `);
    return tocadas > 0;
}

/**
 * Terminar, con su motivo. Devuelve la fila **como quedó**, o `null` si ya
 * estaba terminada — así quien llama no escribe dos veces en el directo.
 *
 * Las dos columnas SDP se vacían aquí: ya no sirven, y dentro llevan las
 * direcciones IP de las dos puntas.
 */
export async function terminarLaLlamada(
    id: string,
    fin: FinDeLlamada,
): Promise<FilaDeLlamada | null> {
    const filas = await conLasTablas(() => db.$queryRawUnsafe<FilaDeLlamada[]>(
        `UPDATE "llamadas_de_voz"
         SET "estado" = 'terminada', "fin" = $2, "terminadaEn" = NOW(),
             "oferta" = NULL, "respuesta" = NULL
         WHERE "id" = $1 AND "estado" <> 'terminada'
         RETURNING ${COLUMNAS}`,
        id,
        fin,
    ));
    return filas[0] ?? null;
}

/**
 * Las que se quedaron sonando y se pasaron de tiempo.
 *
 * Se cierran **en el servidor y por la hora de la fila**, no con un contador en
 * la pantalla de quien llama: si esa pestaña se cierra a mitad, la llamada se
 * quedaría sonando para siempre en la otra punta. Corre dentro del mismo reloj
 * que ya pasa por aquí, así que no añade ni una vuelta.
 */
export async function cerrarLasQueSePasaron(personaId: string): Promise<FilaDeLlamada[]> {
    const limite = new Date(Date.now() - TIMBRE_MAXIMO_MS);
    return conLasTablas(() => db.$queryRawUnsafe<FilaDeLlamada[]>(
        `UPDATE "llamadas_de_voz"
         SET "estado" = 'terminada', "fin" = 'sin_respuesta', "terminadaEn" = NOW(),
             "oferta" = NULL, "respuesta" = NULL
         WHERE "estado" = 'sonando' AND "creadoEn" < $2
           AND ("dellamaId" = $1 OR "aQuienId" = $1)
         RETURNING ${COLUMNAS}`,
        personaId,
        limite,
    ));
}

/** Para el banco: el margen con el que se decide la presencia. */
export const MARGEN = MARGEN_DE_PRESENCIA_MS;
