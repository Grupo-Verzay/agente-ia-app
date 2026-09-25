import "server-only";

import { db } from "@/lib/db";
import { comoRepeticiones, REPETICIONES_POR_DEFECTO, type RepeticionesDeFlujo } from "@/lib/repeticiones-de-flujo";

/**
 * La tabla de las repeticiones de un flujo.
 *
 * Es de la App, con `CREATE TABLE IF NOT EXISTS` y sin clave foránea. **Ni una
 * columna en `Workflow`**: esa tabla es del backend, que es el dueño de sus
 * migraciones, y añadirle columnas desde aquí es lo que reventó el #360.
 *
 * Un flujo SIN fila es lo de siempre (1 vez, sin espera), así que no hace falta
 * ningún backfill: los flujos que ya existen se comportan exactamente igual
 * hasta que el dueño guarde otra cosa. El backend la lee con la misma regla y,
 * si todavía no existe, cae en lo de siempre.
 */

let tablaLista: Promise<void> | null = null;

/**
 * `IF NOT EXISTS` no basta con dos réplicas: dos procesos pasan la
 * comprobación a la vez y el segundo revienta con «ya existe». Solo se traga
 * eso (23505 / 42P07 / 42710); cualquier otro error sube.
 */
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
    if (tablaLista) return tablaLista;
    tablaLista = ddl(() =>
        db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "flujo_repeticiones" (
                "workflowId"     TEXT PRIMARY KEY,
                "maxEjecuciones" INTEGER NOT NULL DEFAULT 1,
                "esperaMinutos"  INTEGER,
                "actualizadoEn"  TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `,
    ).catch((error) => {
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

/** `42P01` viaja en `meta.code` en una consulta en crudo, no en `code`. */
function esTablaQueFalta(error: unknown): boolean {
    const meta = (error as { meta?: { code?: string } } | null)?.meta;
    if (meta?.code === "42P01") return true;
    const texto = error instanceof Error ? error.message : String(error);
    return texto.includes("42P01");
}

/** El recuerdo de «ya la creé» es del proceso: ante un 42P01 se olvida y se reintenta UNA vez. */
async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLaTabla();
    try {
        return await hacer();
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        console.warn("[flujos] la tabla de repeticiones no estaba; se crea y se reintenta");
        tablaLista = null;
        await asegurarLaTabla();
        return hacer();
    }
}

export async function leerRepeticiones(workflowIds: string[]): Promise<Record<string, RepeticionesDeFlujo>> {
    const ids = Array.from(new Set(workflowIds.filter((id) => typeof id === "string" && id)));
    if (ids.length === 0) return {};
    const filas = await conLaTabla(() =>
        db.$queryRaw<Array<{ workflowId: string; maxEjecuciones: number; esperaMinutos: number | null }>>`
            SELECT "workflowId", "maxEjecuciones", "esperaMinutos"
            FROM "flujo_repeticiones"
            WHERE "workflowId" = ANY(${ids})
        `,
    );
    const mapa: Record<string, RepeticionesDeFlujo> = {};
    for (const id of ids) mapa[id] = { ...REPETICIONES_POR_DEFECTO };
    for (const f of filas) mapa[f.workflowId] = comoRepeticiones(f);
    return mapa;
}

/**
 * Guarda. Volver a lo de siempre BORRA la fila en vez de dejar un «1, sin
 * espera» escrito: así «sin fila» sigue significando una sola cosa.
 */
export async function guardarRepeticiones(workflowId: string, r: RepeticionesDeFlujo): Promise<void> {
    const limpio = comoRepeticiones(r);
    await conLaTabla(async () => {
        if (limpio.maxEjecuciones === 1 && limpio.esperaMinutos === null) {
            await db.$executeRaw`DELETE FROM "flujo_repeticiones" WHERE "workflowId" = ${workflowId}`;
            return;
        }
        await db.$executeRaw`
            INSERT INTO "flujo_repeticiones" ("workflowId", "maxEjecuciones", "esperaMinutos", "actualizadoEn")
            VALUES (${workflowId}, ${limpio.maxEjecuciones}, ${limpio.esperaMinutos}, now())
            ON CONFLICT ("workflowId") DO UPDATE
            SET "maxEjecuciones" = EXCLUDED."maxEjecuciones",
                "esperaMinutos"  = EXCLUDED."esperaMinutos",
                "actualizadoEn"  = now()
        `;
    });
}

/** Al borrar un flujo, su ajuste se va con él (sin clave foránea, a mano). */
export async function olvidarRepeticiones(workflowId: string): Promise<void> {
    await conLaTabla(() => db.$executeRaw`DELETE FROM "flujo_repeticiones" WHERE "workflowId" = ${workflowId}`);
}
