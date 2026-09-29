import "server-only";

import { db } from "@/lib/db";
import type { Introduccion, ModuloConGuia } from "@/lib/introduccion-de-la-guia";

/**
 * Dónde vive la introducción editada de cada guía pública: `guia_introducciones`,
 * tabla de la App con `CREATE TABLE IF NOT EXISTS` y sin clave foránea. Una
 * fila por módulo (`modulo` es la clave): «una introducción por guía» es la
 * forma de la tabla. Sin fila, la guía enseña el texto de su código.
 */

let tablaLista: Promise<void> | null = null;

/** Solo se traga «ya existe»: dos réplicas pueden crear la tabla a la vez. */
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

function asegurarLaTabla(): Promise<void> {
    tablaLista ??= ddl(() => db.$executeRaw`
        CREATE TABLE IF NOT EXISTS "guia_introducciones" (
            "modulo" TEXT PRIMARY KEY,
            "titulo" TEXT NOT NULL DEFAULT '',
            "subtitulo" TEXT NOT NULL DEFAULT '',
            "descripcion" TEXT NOT NULL DEFAULT '',
            "editadaPorId" TEXT,
            "editadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `).catch((error) => {
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

/** Lo guardado de un módulo, o `null` si nunca se editó. */
export async function laIntroduccionGuardada(modulo: ModuloConGuia): Promise<Introduccion | null> {
    return conLaTabla(async () => {
        const filas = await db.$queryRaw<Introduccion[]>`
            SELECT "titulo", "subtitulo", "descripcion" FROM "guia_introducciones" WHERE "modulo" = ${modulo}
        `;
        return filas[0] ?? null;
    });
}

/** Guardar los tres vacíos BORRA la fila: «sin fila» es «el texto del código». */
export async function guardarLaIntroduccion(modulo: ModuloConGuia, valor: Introduccion, personaId: string): Promise<void> {
    await conLaTabla(async () => {
        if (!valor.titulo && !valor.subtitulo && !valor.descripcion) {
            await db.$executeRaw`DELETE FROM "guia_introducciones" WHERE "modulo" = ${modulo}`;
            return;
        }
        await db.$executeRaw`
            INSERT INTO "guia_introducciones" ("modulo", "titulo", "subtitulo", "descripcion", "editadaPorId", "editadaEn")
            VALUES (${modulo}, ${valor.titulo}, ${valor.subtitulo}, ${valor.descripcion}, ${personaId}, CURRENT_TIMESTAMP)
            ON CONFLICT ("modulo") DO UPDATE SET
                "titulo" = EXCLUDED."titulo",
                "subtitulo" = EXCLUDED."subtitulo",
                "descripcion" = EXCLUDED."descripcion",
                "editadaPorId" = EXCLUDED."editadaPorId",
                "editadaEn" = EXCLUDED."editadaEn"
        `;
    });
}
