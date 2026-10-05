import "server-only";

import { db } from "@/lib/db";
import { comoGuion, esElDeFabrica, type GuionDeVideollamada } from "@/lib/guion-videollamada";

/**
 * El guion de la videollamada con IA de cada CUENTA (Entrenamiento › Agente IA
 * › Videollamadas). Tabla de la App con `CREATE TABLE IF NOT EXISTS` y sin
 * clave foránea: ni una columna en `User` (#360). Sin fila —o sin tabla— la
 * cuenta usa el guion de fábrica, y guardar lo de fábrica BORRA la fila.
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
            CREATE TABLE IF NOT EXISTS "guion_videollamada" (
                "cuentaId"         TEXT PRIMARY KEY,
                "guion"            JSONB NOT NULL,
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

async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLaTabla();
    try {
        return await hacer();
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        console.warn("[guion-videollamada] la tabla no estaba; se crea y se reintenta");
        tablaLista = null;
        await asegurarLaTabla();
        return hacer();
    }
}

/** Lo guardado de la cuenta, o `null` si usa el de fábrica. */
export async function leerElGuionDeVideollamada(cuentaId: string): Promise<GuionDeVideollamada | null> {
    if (!cuentaId) return null;
    const filas = await conLaTabla(() =>
        db.$queryRaw<Array<{ guion: unknown }>>`
            SELECT "guion" FROM "guion_videollamada" WHERE "cuentaId" = ${cuentaId} LIMIT 1
        `,
    );
    return filas[0] ? comoGuion(filas[0].guion) : null;
}

export async function guardarElGuionDeVideollamada(
    cuentaId: string,
    guion: unknown,
    personaId: string | null,
): Promise<GuionDeVideollamada | null> {
    const limpio = comoGuion(guion);
    if (esElDeFabrica(limpio)) {
        await conLaTabla(() => db.$executeRaw`DELETE FROM "guion_videollamada" WHERE "cuentaId" = ${cuentaId}`);
        return null;
    }
    const json = JSON.stringify(limpio);
    await conLaTabla(() =>
        db.$executeRaw`
            INSERT INTO "guion_videollamada" ("cuentaId", "guion", "actualizadoEn", "actualizadoPorId")
            VALUES (${cuentaId}, ${json}::jsonb, now(), ${personaId})
            ON CONFLICT ("cuentaId") DO UPDATE SET
                "guion" = EXCLUDED."guion",
                "actualizadoEn" = now(),
                "actualizadoPorId" = EXCLUDED."actualizadoPorId"
        `,
    );
    return limpio;
}
