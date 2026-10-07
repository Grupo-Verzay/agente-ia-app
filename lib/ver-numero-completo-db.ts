import "server-only";

import { db } from "@/lib/db";

/**
 * El interruptor «Ver número» de cada asesor (Usuarios › tabla del equipo).
 *
 * Un agente ve los números de los clientes con los cuatro últimos dígitos
 * tapados (`lib/telefono-visible.ts`). Encendido aquí, ESE agente los ve
 * completos. Sin fila = apagado, así que nada cambia para nadie hasta que
 * alguien lo encienda.
 *
 * Tabla de la App, con `CREATE TABLE IF NOT EXISTS` y sin clave foránea. **Ni
 * una columna en `User`**: es del backend (#360). Una fila por cuenta y asesor,
 * como `asesor_ia_ajustes`: una cuenta vinculada atiende en varias cuentas y
 * cada una decide lo suyo.
 */

let tablaLista: Promise<void> | null = null;

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
            CREATE TABLE IF NOT EXISTS "asesor_ver_numero" (
                "cuentaId"          TEXT NOT NULL,
                "asesorId"          TEXT NOT NULL,
                "verNumeroCompleto" BOOLEAN NOT NULL DEFAULT false,
                "actualizadoEn"     TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY ("cuentaId", "asesorId")
            )
        `,
    ).catch((error) => {
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

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
        console.warn("[ver-numero] la tabla no estaba; se crea y se reintenta");
        tablaLista = null;
        await asegurarLaTabla();
        return hacer();
    }
}

export function laLlaveDelPermiso(cuentaId: string, asesorId: string): string {
    return `${cuentaId}::${asesorId}`;
}

/** Los asesores de estas cuentas que tienen «Ver número» encendido (`cuenta::asesor`). */
export async function losQueVenElNumero(cuentaIds: string[]): Promise<Set<string>> {
    const ids = Array.from(new Set(cuentaIds.filter((id) => typeof id === "string" && id)));
    const llaves = new Set<string>();
    if (ids.length === 0) return llaves;
    const filas = await conLaTabla(() =>
        db.$queryRaw<Array<{ cuentaId: string; asesorId: string }>>`
            SELECT "cuentaId", "asesorId"
              FROM "asesor_ver_numero"
             WHERE "cuentaId" = ANY(${ids}::text[]) AND "verNumeroCompleto" = true
        `,
    );
    for (const f of filas) llaves.add(laLlaveDelPermiso(f.cuentaId, f.asesorId));
    return llaves;
}

/**
 * Si esta persona ve el número completo en esta cuenta. Nunca lanza: si no se
 * puede leer, se ve TAPADO (el lado seguro) y se dice.
 */
export async function veElNumeroCompleto(cuentaId: string, asesorId: string): Promise<boolean> {
    if (!cuentaId || !asesorId) return false;
    try {
        const filas = await conLaTabla(() =>
            db.$queryRaw<Array<{ ver: boolean }>>`
                SELECT "verNumeroCompleto" AS ver
                  FROM "asesor_ver_numero"
                 WHERE "cuentaId" = ${cuentaId} AND "asesorId" = ${asesorId}
            `,
        );
        return filas[0]?.ver === true;
    } catch (error) {
        console.warn("[ver-numero] no se pudo leer el permiso; el número va tapado", {
            cuentaId,
            asesorId,
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}

export async function guardarVerNumero(cuentaId: string, asesorId: string, encendido: boolean): Promise<void> {
    await conLaTabla(() =>
        db.$executeRaw`
            INSERT INTO "asesor_ver_numero" ("cuentaId", "asesorId", "verNumeroCompleto", "actualizadoEn")
            VALUES (${cuentaId}, ${asesorId}, ${encendido}, now())
            ON CONFLICT ("cuentaId", "asesorId") DO UPDATE
               SET "verNumeroCompleto" = EXCLUDED."verNumeroCompleto",
                   "actualizadoEn" = now()
        `,
    );
}
