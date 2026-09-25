import "server-only";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { laVe, type QuienVe } from "@/lib/personales";

/**
 * Quién mira, en lo que a lo personal importa: la PERSONA (con ella se marca y
 * se compara) y si manda en la cuenta (dueño o administrador ven todo).
 */
export async function quienVeLoPersonal(): Promise<QuienVe | null> {
    const user = await currentUser();
    if (!user?.id) return null;
    return { personaId: laPersonaQueActua(user).id, manda: canManageWorkspace(user) };
}

/**
 * Las marcas de «esto es de esta persona», para etiquetas y respuestas rápidas.
 *
 * **Tablas de la App, con `CREATE TABLE IF NOT EXISTS` y sin clave foránea.**
 * Ni una columna en `Tag` ni en `rr`: `Tag` la toca también el backend, y
 * añadirle columnas desde aquí es lo que reventó el #360. La fila de la
 * etiqueta sigue siendo de la cuenta; aquí solo se dice de quién es.
 *
 * La clave es el id de la fila marcada: una etiqueta es de una persona o de
 * nadie. Sin clave foránea, así que al borrar la fila se olvida su marca
 * (`olvidarLaMarca`) y un olvido no puede reventar el borrado.
 */

type Tipo = "etiqueta" | "respuesta";

let tablasListas: Promise<void> | null = null;

async function ddl(ejecutar: () => Promise<unknown>): Promise<void> {
    try {
        await ejecutar();
    } catch (error) {
        const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
        const codigo = String(e?.meta?.code ?? e?.code ?? "");
        const texto = String(e?.message ?? "");
        if (!["23505", "42P07", "42710"].some((c) => codigo === c || texto.includes(c))) throw error;
    }
}

function asegurarLasTablas(): Promise<void> {
    tablasListas ??= (async () => {
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "etiquetas_personales" (
                "tagId" INTEGER PRIMARY KEY,
                "personaId" TEXT NOT NULL,
                "cuentaId" TEXT NOT NULL,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "respuestas_personales" (
                "rrId" INTEGER PRIMARY KEY,
                "personaId" TEXT NOT NULL,
                "cuentaId" TEXT NOT NULL,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
    })().catch((error) => {
        tablasListas = null;
        throw error;
    });
    return tablasListas;
}

function faltaLaTabla(error: unknown): boolean {
    const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
    if (e?.meta?.code === "42P01" || e?.code === "42P01") return true;
    return typeof e?.message === "string" && e.message.includes("42P01");
}

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

/** id de fila → persona dueña, solo de las que tienen marca. */
async function lasDuenas(tipo: Tipo, ids: readonly number[]): Promise<Map<number, string>> {
    const unicos = Array.from(new Set(ids.filter((n) => Number.isInteger(n))));
    if (unicos.length === 0) return new Map();
    return conLasTablas(async () => {
        const filas =
            tipo === "etiqueta"
                ? await db.$queryRaw<Array<{ id: number; personaId: string }>>`
                    SELECT "tagId" AS "id", "personaId" FROM "etiquetas_personales"
                    WHERE "tagId" = ANY(${unicos}::int[])
                  `
                : await db.$queryRaw<Array<{ id: number; personaId: string }>>`
                    SELECT "rrId" AS "id", "personaId" FROM "respuestas_personales"
                    WHERE "rrId" = ANY(${unicos}::int[])
                  `;
        return new Map(filas.map((f) => [Number(f.id), f.personaId]));
    });
}

export const lasDuenasDeEtiquetas = (ids: readonly number[]) => lasDuenas("etiqueta", ids);
export const lasDuenasDeRespuestas = (ids: readonly number[]) => lasDuenas("respuesta", ids);

/** De las etiquetas pedidas, las que quien mira puede ver. */
export async function lasEtiquetasQueVe(quien: QuienVe, ids: readonly number[]): Promise<Set<number>> {
    const duenas = await lasDuenasDeEtiquetas(ids);
    return new Set(ids.filter((id) => laVe(duenas.get(id), quien)));
}

export async function marcarComoPersonal(
    tipo: Tipo,
    id: number,
    personaId: string,
    cuentaId: string,
): Promise<void> {
    await conLasTablas(async () => {
        if (tipo === "etiqueta") {
            await db.$executeRaw`
                INSERT INTO "etiquetas_personales" ("tagId", "personaId", "cuentaId")
                VALUES (${id}, ${personaId}, ${cuentaId})
                ON CONFLICT ("tagId") DO UPDATE SET "personaId" = EXCLUDED."personaId"
            `;
        } else {
            await db.$executeRaw`
                INSERT INTO "respuestas_personales" ("rrId", "personaId", "cuentaId")
                VALUES (${id}, ${personaId}, ${cuentaId})
                ON CONFLICT ("rrId") DO UPDATE SET "personaId" = EXCLUDED."personaId"
            `;
        }
    });
}

/** Al borrar la fila se olvida su marca. Nunca lanza. */
export async function olvidarLaMarca(tipo: Tipo, id: number): Promise<void> {
    try {
        await conLasTablas(async () => {
            if (tipo === "etiqueta") {
                await db.$executeRaw`DELETE FROM "etiquetas_personales" WHERE "tagId" = ${id}`;
            } else {
                await db.$executeRaw`DELETE FROM "respuestas_personales" WHERE "rrId" = ${id}`;
            }
        });
    } catch (error) {
        console.warn("[personales] no se pudo olvidar la marca", {
            tipo,
            id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
