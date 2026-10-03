import "server-only";

import { db } from "@/lib/db";
import {
    comoOrdenDeBloques,
    comoRecuadros,
    esElOrdenDeFabrica,
    esElRecuadroSinTocar,
    type BloqueDeLaPagina,
    type RecuadrosDelPlan,
} from "@/lib/pagina-de-plan";

/**
 * Cómo se arma la página pública de cada plan: el ORDEN de sus bloques y los
 * recuadros de catálogo y asistencia escritos en el panel. `plan_pagina`,
 * tabla de la App con `CREATE TABLE IF NOT EXISTS` y **sin clave foránea**. Ni
 * una columna en `plan_details` ni en `subscription_plans`: son del BACKEND (él
 * lleva sus migraciones) y añadirles columnas desde aquí es lo que reventó el
 * #360.
 *
 * Un plan sin fila se pinta en el orden de fábrica y con los recuadros de
 * fábrica: «sin fila» es lo único que significa «lo de siempre».
 */

export type PaginaGuardada = { orden: BloqueDeLaPagina[]; recuadros: RecuadrosDelPlan };

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
            CREATE TABLE IF NOT EXISTS "plan_pagina" (
                "subscriptionPlanId" TEXT PRIMARY KEY,
                "orden" JSONB,
                "recuadros" JSONB,
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

/** Lo guardado para un plan, saneado, o `null` si nunca se guardó nada. */
export async function laPaginaGuardada(subscriptionPlanId: string): Promise<PaginaGuardada | null> {
    if (typeof subscriptionPlanId !== "string" || !subscriptionPlanId) return null;
    const filas = await conLaTabla(
        () => db.$queryRaw<{ orden: unknown; recuadros: unknown }[]>`
            SELECT "orden", "recuadros"
            FROM "plan_pagina"
            WHERE "subscriptionPlanId" = ${subscriptionPlanId}
        `,
    );
    const fila = filas[0];
    return fila ? { orden: comoOrdenDeBloques(fila.orden), recuadros: comoRecuadros(fila.recuadros) } : null;
}

/**
 * Escribe SOLO lo que llega (`undefined` deja lo que había). Si lo que queda es
 * el orden de fábrica y los dos recuadros sin tocar, la fila se borra.
 */
export async function guardarLaPagina(
    subscriptionPlanId: string,
    cambios: { orden?: unknown; recuadros?: unknown },
): Promise<PaginaGuardada> {
    const previo = await laPaginaGuardada(subscriptionPlanId);
    const orden = cambios.orden !== undefined ? comoOrdenDeBloques(cambios.orden) : comoOrdenDeBloques(previo?.orden);
    const recuadros = cambios.recuadros !== undefined ? comoRecuadros(cambios.recuadros) : comoRecuadros(previo?.recuadros);

    if (esElOrdenDeFabrica(orden) && esElRecuadroSinTocar(recuadros.catalogo) && esElRecuadroSinTocar(recuadros.asistencia)) {
        await conLaTabla(
            () => db.$executeRaw`DELETE FROM "plan_pagina" WHERE "subscriptionPlanId" = ${subscriptionPlanId}`,
        );
        return { orden, recuadros };
    }
    const ordenJson = JSON.stringify(orden);
    const recuadrosJson = JSON.stringify(recuadros);
    await conLaTabla(
        () => db.$executeRaw`
            INSERT INTO "plan_pagina" ("subscriptionPlanId", "orden", "recuadros", "actualizadoEn")
            VALUES (${subscriptionPlanId}, ${ordenJson}::jsonb, ${recuadrosJson}::jsonb, CURRENT_TIMESTAMP)
            ON CONFLICT ("subscriptionPlanId")
            DO UPDATE SET "orden" = EXCLUDED."orden", "recuadros" = EXCLUDED."recuadros", "actualizadoEn" = CURRENT_TIMESTAMP
        `,
    );
    return { orden, recuadros };
}
