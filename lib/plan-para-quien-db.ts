import "server-only";

import { db } from "@/lib/db";
import { comoParaQuien, type ParaQuienDelPlan } from "@/lib/pagina-de-plan";

/**
 * «Para quién es este plan» de cada plan: `plan_para_quien`, tabla de la App
 * con `CREATE TABLE IF NOT EXISTS` y **sin clave foránea**. Ni una columna en
 * `plan_details` ni en `subscription_plans`: son del BACKEND (él lleva sus
 * migraciones) y añadirles columnas desde aquí es lo que reventó el #360.
 *
 * Un plan sin fila enseña el texto de fábrica de su nivel
 * (`PARA_QUIEN_DE_FABRICA`): la sección nunca sale vacía.
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
            CREATE TABLE IF NOT EXISTS "plan_para_quien" (
                "subscriptionPlanId" TEXT PRIMARY KEY,
                "paraQuien" TEXT NOT NULL DEFAULT '',
                "caso" TEXT NOT NULL DEFAULT '',
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
export async function elParaQuienGuardado(subscriptionPlanId: string): Promise<ParaQuienDelPlan | null> {
    if (typeof subscriptionPlanId !== "string" || !subscriptionPlanId) return null;
    const filas = await conLaTabla(
        () => db.$queryRaw<{ paraQuien: string; caso: string }[]>`
            SELECT "paraQuien", "caso"
            FROM "plan_para_quien"
            WHERE "subscriptionPlanId" = ${subscriptionPlanId}
        `,
    );
    return filas[0] ? comoParaQuien(filas[0]) : null;
}

/**
 * Escribe SOLO los campos que llegan (`undefined` deja el que había). Los dos
 * vacíos borran la fila: así «sin fila» es lo único que significa «lo de fábrica».
 */
export async function guardarElParaQuien(
    subscriptionPlanId: string,
    cambios: { paraQuien?: string; caso?: string },
): Promise<void> {
    const previo = (await elParaQuienGuardado(subscriptionPlanId)) ?? { paraQuien: "", caso: "" };
    const limpio = comoParaQuien({
        paraQuien: cambios.paraQuien ?? previo.paraQuien,
        caso: cambios.caso ?? previo.caso,
    });
    if (!limpio.paraQuien && !limpio.caso) {
        await conLaTabla(
            () => db.$executeRaw`DELETE FROM "plan_para_quien" WHERE "subscriptionPlanId" = ${subscriptionPlanId}`,
        );
        return;
    }
    await conLaTabla(
        () => db.$executeRaw`
            INSERT INTO "plan_para_quien" ("subscriptionPlanId", "paraQuien", "caso", "actualizadoEn")
            VALUES (${subscriptionPlanId}, ${limpio.paraQuien}, ${limpio.caso}, CURRENT_TIMESTAMP)
            ON CONFLICT ("subscriptionPlanId")
            DO UPDATE SET "paraQuien" = EXCLUDED."paraQuien", "caso" = EXCLUDED."caso", "actualizadoEn" = CURRENT_TIMESTAMP
        `,
    );
}
