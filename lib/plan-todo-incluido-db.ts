import "server-only";

import { db } from "@/lib/db";
import { comoTodoIncluido, type TodoIncluidoDelPlan } from "@/lib/pagina-de-plan";

/**
 * «Todo incluido, sin sorpresas» de cada plan: `plan_todo_incluido`, tabla de
 * la App con `CREATE TABLE IF NOT EXISTS` y **sin clave foránea**, como
 * `plan_para_quien`. Ni una columna en `plan_details` ni en
 * `subscription_plans`: son del BACKEND (él lleva sus migraciones) y añadirles
 * columnas desde aquí es lo que reventó el #360.
 *
 * Un plan sin fila no enseña el bloque: sin texto no hay nada que decir.
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
        const yaEstaba = ["23505", "42P07", "42710"].some((c) => codigo === c || texto.includes(c));
        if (!yaEstaba) throw error;
    }
}

function asegurarLaTabla(): Promise<void> {
    tablaLista ??= ddl(
        () => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "plan_todo_incluido" (
                "subscriptionPlanId" TEXT PRIMARY KEY,
                "titulo" TEXT NOT NULL DEFAULT '',
                "texto" TEXT NOT NULL DEFAULT '',
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `,
    ).catch((error) => {
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

/** Lo escrito para un plan, o `null` si nunca se escribió nada. */
export async function elTodoIncluidoGuardado(subscriptionPlanId: string): Promise<TodoIncluidoDelPlan | null> {
    if (typeof subscriptionPlanId !== "string" || !subscriptionPlanId) return null;
    const filas = await conLaTabla(
        () => db.$queryRaw<{ titulo: string; texto: string }[]>`
            SELECT "titulo", "texto"
            FROM "plan_todo_incluido"
            WHERE "subscriptionPlanId" = ${subscriptionPlanId}
        `,
    );
    return filas[0] ? comoTodoIncluido(filas[0]) : null;
}

/** Lo escrito para varios planes a la vez (una propuesta lleva varios). Sin fila, no está en el mapa. */
export async function losTodoIncluidoGuardados(ids: readonly string[]): Promise<Map<string, TodoIncluidoDelPlan>> {
    const limpios = [...new Set(ids.filter((id) => typeof id === "string" && id))];
    const fuera = new Map<string, TodoIncluidoDelPlan>();
    if (limpios.length === 0) return fuera;
    const filas = await conLaTabla(
        () => db.$queryRaw<{ subscriptionPlanId: string; titulo: string; texto: string }[]>`
            SELECT "subscriptionPlanId", "titulo", "texto"
            FROM "plan_todo_incluido"
            WHERE "subscriptionPlanId" = ANY(${limpios}::text[])
        `,
    );
    for (const f of filas) fuera.set(f.subscriptionPlanId, comoTodoIncluido(f));
    return fuera;
}

/**
 * Escribe SOLO los campos que llegan (`undefined` deja el que había). Los dos
 * vacíos borran la fila: así «sin fila» es lo único que significa «no sale».
 */
export async function guardarElTodoIncluido(
    subscriptionPlanId: string,
    cambios: { titulo?: string; texto?: string },
): Promise<void> {
    const previo = (await elTodoIncluidoGuardado(subscriptionPlanId)) ?? { titulo: "", texto: "" };
    const limpio = comoTodoIncluido({
        titulo: cambios.titulo ?? previo.titulo,
        texto: cambios.texto ?? previo.texto,
    });
    if (!limpio.titulo && !limpio.texto) {
        await conLaTabla(
            () => db.$executeRaw`DELETE FROM "plan_todo_incluido" WHERE "subscriptionPlanId" = ${subscriptionPlanId}`,
        );
        return;
    }
    await conLaTabla(
        () => db.$executeRaw`
            INSERT INTO "plan_todo_incluido" ("subscriptionPlanId", "titulo", "texto", "actualizadoEn")
            VALUES (${subscriptionPlanId}, ${limpio.titulo}, ${limpio.texto}, CURRENT_TIMESTAMP)
            ON CONFLICT ("subscriptionPlanId")
            DO UPDATE SET "titulo" = EXCLUDED."titulo", "texto" = EXCLUDED."texto", "actualizadoEn" = CURRENT_TIMESTAMP
        `,
    );
}
