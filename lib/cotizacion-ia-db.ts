import "server-only";

import { db } from "@/lib/db";
import { AJUSTES_POR_DEFECTO, comoAjustes, type AjustesDeCotizacion } from "@/lib/cotizacion-ia";

/**
 * Los ajustes de Entrenamiento › Cotizaciones: el interruptor y el cuadro de
 * texto, uno por CUENTA.
 *
 * Tabla de la App, con `CREATE TABLE IF NOT EXISTS` y sin clave foránea. **Ni
 * una columna en `User`**: esa tabla es del backend, dueño de sus migraciones,
 * y añadirle columnas desde aquí es lo que reventó el #360. El backend la lee
 * en cada respuesta del agente (`maybeBuildEnviarCotizacionTool`) y, si todavía
 * no existe, la función está apagada — que es como nace toda cuenta.
 *
 * Es de la cuenta y no de un canal: la cotización sale por la línea de la
 * conversación, sea cual sea, así que una sola casilla vale para todas.
 */

let tablaLista: Promise<void> | null = null;

/** `IF NOT EXISTS` no basta con dos réplicas: solo se traga «ya existe». */
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
            CREATE TABLE IF NOT EXISTS "cotizacion_ia_ajustes" (
                "cuentaId"         TEXT PRIMARY KEY,
                "activa"           BOOLEAN NOT NULL DEFAULT false,
                "instrucciones"    TEXT NOT NULL DEFAULT '',
                "actualizadoEn"    TIMESTAMPTZ NOT NULL DEFAULT now(),
                "actualizadoPorId" TEXT
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
        console.warn("[cotizacion-ia] la tabla no estaba; se crea y se reintenta");
        tablaLista = null;
        await asegurarLaTabla();
        return hacer();
    }
}

export async function leerAjustesDeCotizacion(cuentaId: string): Promise<AjustesDeCotizacion> {
    if (!cuentaId) return AJUSTES_POR_DEFECTO;
    const filas = await conLaTabla(() =>
        db.$queryRaw<Array<{ activa: boolean; instrucciones: string }>>`
            SELECT "activa", "instrucciones" FROM "cotizacion_ia_ajustes" WHERE "cuentaId" = ${cuentaId} LIMIT 1
        `,
    );
    return filas[0] ? comoAjustes(filas[0]) : AJUSTES_POR_DEFECTO;
}

export async function guardarAjustesDeCotizacion(
    cuentaId: string,
    ajustes: AjustesDeCotizacion,
    personaId: string | null,
): Promise<AjustesDeCotizacion> {
    const limpio = comoAjustes(ajustes);
    await conLaTabla(() =>
        db.$executeRaw`
            INSERT INTO "cotizacion_ia_ajustes" ("cuentaId", "activa", "instrucciones", "actualizadoEn", "actualizadoPorId")
            VALUES (${cuentaId}, ${limpio.activa}, ${limpio.instrucciones}, now(), ${personaId})
            ON CONFLICT ("cuentaId") DO UPDATE SET
                "activa" = EXCLUDED."activa",
                "instrucciones" = EXCLUDED."instrucciones",
                "actualizadoEn" = now(),
                "actualizadoPorId" = EXCLUDED."actualizadoPorId"
        `,
    );
    return limpio;
}
