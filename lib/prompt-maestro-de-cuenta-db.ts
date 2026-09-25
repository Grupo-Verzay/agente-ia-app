import "server-only";

import { db } from "@/lib/db";
import { comoPromptMaestroPropio } from "@/lib/prompt-maestro-de-cuenta";

/**
 * La tabla del prompt maestro propio de cada cuenta.
 *
 * Es de la App, con `CREATE TABLE IF NOT EXISTS` y sin clave foránea. **Ni una
 * columna en `User`**: esa tabla es del backend, dueño de sus migraciones, y
 * añadirle columnas desde aquí es lo que reventó el #360. El backend la lee en
 * cada respuesta del agente y, si todavía no existe, cae en el global.
 *
 * Una cuenta SIN fila usa el global, así que no hace falta backfill: todas las
 * cuentas se comportan exactamente igual hasta que el dueño de la plataforma
 * le escriba un prompt a una. Y vaciar el campo BORRA la fila, para que «sin
 * fila» siga significando una sola cosa.
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
            CREATE TABLE IF NOT EXISTS "prompt_maestro_de_cuenta" (
                "cuentaId"         TEXT PRIMARY KEY,
                "texto"            TEXT NOT NULL,
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
        console.warn("[prompt-maestro] la tabla no estaba; se crea y se reintenta");
        tablaLista = null;
        await asegurarLaTabla();
        return hacer();
    }
}

export type PromptMaestroGuardado = {
    texto: string | null;
    actualizadoEn: Date | null;
};

export async function leerPromptMaestroDeCuenta(cuentaId: string): Promise<PromptMaestroGuardado> {
    const filas = await conLaTabla(() =>
        db.$queryRaw<Array<{ texto: string; actualizadoEn: Date }>>`
            SELECT "texto", "actualizadoEn" FROM "prompt_maestro_de_cuenta" WHERE "cuentaId" = ${cuentaId}
        `,
    );
    const fila = filas[0];
    return { texto: comoPromptMaestroPropio(fila?.texto), actualizadoEn: fila ? fila.actualizadoEn : null };
}

/** Guarda. Vacío BORRA la fila: la cuenta vuelve al global. */
export async function guardarPromptMaestroDeCuenta(
    cuentaId: string,
    texto: unknown,
    actualizadoPorId: string,
): Promise<string | null> {
    const limpio = comoPromptMaestroPropio(texto);
    await conLaTabla(async () => {
        if (limpio === null) {
            await db.$executeRaw`DELETE FROM "prompt_maestro_de_cuenta" WHERE "cuentaId" = ${cuentaId}`;
            return;
        }
        await db.$executeRaw`
            INSERT INTO "prompt_maestro_de_cuenta" ("cuentaId", "texto", "actualizadoEn", "actualizadoPorId")
            VALUES (${cuentaId}, ${limpio}, now(), ${actualizadoPorId})
            ON CONFLICT ("cuentaId") DO UPDATE
            SET "texto" = EXCLUDED."texto",
                "actualizadoEn" = now(),
                "actualizadoPorId" = EXCLUDED."actualizadoPorId"
        `;
    });
    return limpio;
}
