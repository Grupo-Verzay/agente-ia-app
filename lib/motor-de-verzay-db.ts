import "server-only";

import { randomUUID } from "crypto";

import { db } from "@/lib/db";
import { asegurarIndice, asegurarTabla } from "@/lib/ddl-sin-bloquear";
import { comoFrasesDelMotor, type FraseDelMotor } from "@/lib/motor-de-verzay";

/**
 * Lo que guarda el MOTOR PROPIO de la videollamada, en tres tablas de la App
 * (sin clave foránea, como las demás de la videollamada; el backend no las lee):
 *
 * | tabla | una fila por |
 * | --- | --- |
 * | `videollamada_motor` | CITA: la transcripción en curso, los tokens cobrados y si ya se entregó al CRM |
 * | `videollamada_sala_presencia` | persona en la sala propia (latido) |
 * | `videollamada_sala_senales` | mensaje de señalización entre dos personas (oferta, respuesta) |
 *
 * La transcripción se va guardando mientras se habla: si el cliente cierra la
 * pestaña sin colgar, el barrido (`recogerLasConversacionesDelMotor`) la
 * entrega igual. Con Tavus eso lo hacía su aviso; aquí no hay nadie fuera.
 */

let listas: Promise<void> | null = null;

function asegurar(): Promise<void> {
    listas ??= (async () => {
        await asegurarTabla("videollamada_motor", `
            CREATE TABLE IF NOT EXISTS "videollamada_motor" (
                "citaId" TEXT PRIMARY KEY,
                "conversacionId" TEXT NOT NULL,
                "frases" TEXT NOT NULL DEFAULT '[]',
                "tokens" BIGINT NOT NULL DEFAULT 0,
                "empezoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "actualizadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "entregadaEn" TIMESTAMP(3)
            )
        `);
        await asegurarTabla("videollamada_sala_presencia", `
            CREATE TABLE IF NOT EXISTS "videollamada_sala_presencia" (
                "citaId" TEXT NOT NULL,
                "participanteId" TEXT NOT NULL,
                "nombre" TEXT,
                "datos" TEXT NOT NULL DEFAULT '{}',
                "vistoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY ("citaId", "participanteId")
            )
        `);
        await asegurarTabla("videollamada_sala_senales", `
            CREATE TABLE IF NOT EXISTS "videollamada_sala_senales" (
                "id" TEXT PRIMARY KEY,
                "citaId" TEXT NOT NULL,
                "de" TEXT NOT NULL,
                "para" TEXT NOT NULL,
                "tipo" TEXT NOT NULL,
                "cuerpo" TEXT NOT NULL,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await asegurarIndice(
            "videollamada_sala_senales_para_idx",
            `CREATE INDEX IF NOT EXISTS "videollamada_sala_senales_para_idx" ON "videollamada_sala_senales" ("citaId", "para")`,
        );
    })().catch((error) => {
        listas = null;
        throw error;
    });
    return listas;
}

/* ── La transcripción en curso ─────────────────────────────────────────── */

export type ConversacionDelMotor = {
    citaId: string;
    conversacionId: string;
    frases: FraseDelMotor[];
    tokens: number;
    empezoEn: Date;
    entregadaEn: Date | null;
};

function comoConversacion(f: { citaId: string; conversacionId: string; frases: string; tokens: bigint | number; empezoEn: Date; entregadaEn: Date | null }): ConversacionDelMotor {
    let frases: FraseDelMotor[] = [];
    try {
        frases = comoFrasesDelMotor(JSON.parse(f.frases));
    } catch {
        console.warn("[motor] la transcripción guardada no se pudo leer", { cita: f.citaId });
    }
    return { citaId: f.citaId, conversacionId: f.conversacionId, frases, tokens: Number(f.tokens), empezoEn: f.empezoEn, entregadaEn: f.entregadaEn };
}

export async function laConversacionDelMotor(citaId: string): Promise<ConversacionDelMotor | null> {
    await asegurar();
    const filas = await db.$queryRaw<{ citaId: string; conversacionId: string; frases: string; tokens: bigint; empezoEn: Date; entregadaEn: Date | null }[]>`
        SELECT "citaId", "conversacionId", "frases", "tokens", "empezoEn", "entregadaEn"
        FROM "videollamada_motor" WHERE "citaId" = ${citaId} LIMIT 1
    `;
    return filas[0] ? comoConversacion(filas[0]) : null;
}

/**
 * Guarda la transcripción de ESA conversación. Una conversación nueva de la
 * misma cita (se colgó y se volvió a abrir) empieza de cero; una ya entregada
 * no se toca.
 */
export async function guardarLasFrases(citaId: string, conversacionId: string, frases: FraseDelMotor[]): Promise<void> {
    await asegurar();
    const texto = JSON.stringify(frases);
    await db.$executeRaw`
        INSERT INTO "videollamada_motor" ("citaId", "conversacionId", "frases", "actualizadaEn")
        VALUES (${citaId}, ${conversacionId}, ${texto}, CURRENT_TIMESTAMP)
        ON CONFLICT ("citaId") DO UPDATE SET
            "frases" = EXCLUDED."frases",
            "tokens" = CASE WHEN "videollamada_motor"."conversacionId" = EXCLUDED."conversacionId" THEN "videollamada_motor"."tokens" ELSE 0 END,
            "empezoEn" = CASE WHEN "videollamada_motor"."conversacionId" = EXCLUDED."conversacionId" THEN "videollamada_motor"."empezoEn" ELSE CURRENT_TIMESTAMP END,
            "entregadaEn" = CASE WHEN "videollamada_motor"."conversacionId" = EXCLUDED."conversacionId" THEN "videollamada_motor"."entregadaEn" ELSE NULL END,
            "conversacionId" = EXCLUDED."conversacionId",
            "actualizadaEn" = CURRENT_TIMESTAMP
        WHERE "videollamada_motor"."entregadaEn" IS NULL
           OR "videollamada_motor"."conversacionId" <> EXCLUDED."conversacionId"
    `;
}

/** Suma tokens ya cobrados a la conversación (el tope por minuto lo decide quien llama). */
export async function sumarLosTokens(citaId: string, tokens: number): Promise<void> {
    if (tokens <= 0) return;
    await asegurar();
    await db.$executeRaw`
        UPDATE "videollamada_motor" SET "tokens" = "tokens" + ${tokens}, "actualizadaEn" = CURRENT_TIMESTAMP
        WHERE "citaId" = ${citaId}
    `;
}

/** Reclama la entrega al CRM: `true` solo a UNO (el colgar y el barrido pueden llegar a la vez). */
export async function reclamarLaEntrega(citaId: string, conversacionId: string): Promise<boolean> {
    await asegurar();
    const tocadas = await db.$executeRaw`
        UPDATE "videollamada_motor" SET "entregadaEn" = CURRENT_TIMESTAMP
        WHERE "citaId" = ${citaId} AND "conversacionId" = ${conversacionId} AND "entregadaEn" IS NULL
    `;
    return Number(tocadas) > 0;
}

/** Las conversaciones sin entregar que llevan `minutos` sin moverse (pestaña cerrada sin colgar). */
export async function lasConversacionesQuietas(minutos: number, tope = 50): Promise<{ citaId: string; conversacionId: string }[]> {
    await asegurar();
    return db.$queryRaw<{ citaId: string; conversacionId: string }[]>`
        SELECT "citaId", "conversacionId" FROM "videollamada_motor"
        WHERE "entregadaEn" IS NULL AND "actualizadaEn" < CURRENT_TIMESTAMP - make_interval(mins => ${minutos})
        ORDER BY "actualizadaEn" ASC
        LIMIT ${tope}
    `;
}

/* ── La sala propia: presencia y señales ───────────────────────────────── */

export type PresenciaEnLaSala = { participanteId: string; nombre: string | null; datos: Record<string, unknown> };

/** Apunta que esta persona sigue en la sala y devuelve a las demás que siguen (latido de hace menos de `vivosS`). */
export async function latirEnLaSala(
    citaId: string,
    yo: { participanteId: string; nombre: string | null; datos: Record<string, unknown> },
    vivosS: number,
): Promise<PresenciaEnLaSala[]> {
    await asegurar();
    const datos = JSON.stringify(yo.datos ?? {});
    await db.$executeRaw`
        INSERT INTO "videollamada_sala_presencia" ("citaId", "participanteId", "nombre", "datos", "vistoEn")
        VALUES (${citaId}, ${yo.participanteId}, ${yo.nombre}, ${datos}, CURRENT_TIMESTAMP)
        ON CONFLICT ("citaId", "participanteId") DO UPDATE SET
            "nombre" = EXCLUDED."nombre", "datos" = EXCLUDED."datos", "vistoEn" = CURRENT_TIMESTAMP
    `;
    const filas = await db.$queryRaw<{ participanteId: string; nombre: string | null; datos: string }[]>`
        SELECT "participanteId", "nombre", "datos" FROM "videollamada_sala_presencia"
        WHERE "citaId" = ${citaId} AND "participanteId" <> ${yo.participanteId}
          AND "vistoEn" > CURRENT_TIMESTAMP - make_interval(secs => ${vivosS})
    `;
    return filas.map((f) => {
        let d: Record<string, unknown> = {};
        try {
            const v = JSON.parse(f.datos);
            if (v && typeof v === "object") d = v as Record<string, unknown>;
        } catch {
            // Datos ilegibles: la persona sigue, sin marcas.
        }
        return { participanteId: f.participanteId, nombre: f.nombre, datos: d };
    });
}

/** Esta persona se fue (colgó): las demás dejan de verla al momento, sin esperar al latido. */
export async function salirDeLaSala(citaId: string, participanteId: string): Promise<void> {
    await asegurar();
    await db.$executeRaw`
        DELETE FROM "videollamada_sala_presencia" WHERE "citaId" = ${citaId} AND "participanteId" = ${participanteId}
    `;
}

export type SenalDeLaSala = { id: string; de: string; tipo: string; cuerpo: string; creadoEn: Date };

export async function dejarUnaSenal(citaId: string, de: string, para: string, tipo: string, cuerpo: string): Promise<void> {
    await asegurar();
    await db.$executeRaw`
        INSERT INTO "videollamada_sala_senales" ("id", "citaId", "de", "para", "tipo", "cuerpo")
        VALUES (${randomUUID()}, ${citaId}, ${de}, ${para}, ${tipo}, ${cuerpo})
    `;
}

/** Recoge (y borra) las señales que esperan a esta persona, en orden de llegada. */
export async function recogerLasSenales(citaId: string, para: string): Promise<SenalDeLaSala[]> {
    await asegurar();
    return db.$queryRaw<SenalDeLaSala[]>`
        DELETE FROM "videollamada_sala_senales"
        WHERE "citaId" = ${citaId} AND "para" = ${para}
        RETURNING "id", "de", "tipo", "cuerpo", "creadoEn"
    `.then((filas) => [...filas].sort((a, b) => new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime()));
}

/** Lo viejo de la sala (señales sin recoger, latidos de gente que se fue) se barre. */
export async function barrerLaSala(): Promise<void> {
    await asegurar();
    await db.$executeRaw`DELETE FROM "videollamada_sala_senales" WHERE "creadoEn" < CURRENT_TIMESTAMP - INTERVAL '10 minutes'`;
    await db.$executeRaw`DELETE FROM "videollamada_sala_presencia" WHERE "vistoEn" < CURRENT_TIMESTAMP - INTERVAL '1 hour'`;
}
