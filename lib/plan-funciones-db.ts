import "server-only";

import { db } from "@/lib/db";
import { comoFunciones, type FuncionDelPlan } from "@/lib/pagina-de-plan";

/**
 * Dónde viven la categoría, la descripción, el tutorial y el interruptor de
 * cada función de un plan: `plan_funciones`, tabla de la App con
 * `CREATE TABLE IF NOT EXISTS` y **sin clave foránea**. Ni una columna en
 * `subscription_plans`: esa tabla es del BACKEND (él lleva sus migraciones) y
 * añadirle columnas desde aquí es lo que reventó el #360.
 *
 * Una fila por plan, con la lista entera en JSONB: se lee y se escribe siempre
 * junta, y nunca se consulta función por función.
 *
 * Lo que sale de aquí NO decide qué funciones están encendidas: eso lo dice
 * `SubscriptionPlan.features` (ver `lasFuncionesDelPlan`). Esto es lo que va al
 * lado de cada una.
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
            CREATE TABLE IF NOT EXISTS "plan_funciones" (
                "subscriptionPlanId" TEXT PRIMARY KEY,
                "funciones" JSONB NOT NULL DEFAULT '[]'::jsonb,
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

/** Lo guardado de cada plan, por su id. Un plan sin fila no sale en el mapa. */
export async function lasFuncionesGuardadas(ids: readonly string[]): Promise<Map<string, unknown>> {
    const unicos = [...new Set(ids.filter((id) => typeof id === "string" && id))];
    if (unicos.length === 0) return new Map();
    const filas = await conLaTabla(
        () => db.$queryRaw<{ subscriptionPlanId: string; funciones: unknown }[]>`
            SELECT "subscriptionPlanId", "funciones"
            FROM "plan_funciones"
            WHERE "subscriptionPlanId" = ANY(${unicos}::text[])
        `,
    );
    return new Map(filas.map((f) => [f.subscriptionPlanId, f.funciones]));
}

/** Escribe la lista entera de un plan, ya saneada. */
export async function guardarLasFunciones(subscriptionPlanId: string, funciones: readonly FuncionDelPlan[]): Promise<void> {
    const limpias = comoFunciones(funciones);
    const json = JSON.stringify(limpias);
    await conLaTabla(
        () => db.$executeRaw`
            INSERT INTO "plan_funciones" ("subscriptionPlanId", "funciones", "actualizadoEn")
            VALUES (${subscriptionPlanId}, ${json}::jsonb, CURRENT_TIMESTAMP)
            ON CONFLICT ("subscriptionPlanId")
            DO UPDATE SET "funciones" = EXCLUDED."funciones", "actualizadoEn" = CURRENT_TIMESTAMP
        `,
    );
}
