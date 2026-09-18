import "server-only";

import { db } from "@/lib/db";

/**
 * Lo que cada PERSONA elige para sí misma, no para su cuenta.
 *
 * Hoy solo el sonido del chat del equipo. Vive aquí y no en `User` porque esa
 * tabla es del BACKEND —lo dice `docs/db-migrations-ownership.md`— y añadirle
 * columnas desde la App es lo que reventó el #360.
 *
 * **Por la persona, no por la cuenta**, y la diferencia se nota: dentro de una
 * cuenta ajena con «Ingresar» el sonido sigue siendo el que eligió quien está
 * sentado delante, no el del cliente. Es el mismo reparto de `quienFirma` y de
 * las notas.
 *
 * Sin clave foránea, como el resto de las tablas de la App: al borrar una
 * persona queda una fila huérfana de dos booleanos, que no molesta a nadie.
 */

let tablaLista: Promise<void> | null = null;

function asegurarLaTabla(): Promise<void> {
    tablaLista ??= (async () => {
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "preferencias_de_persona" (
                "personaId" TEXT PRIMARY KEY,
                "sonidoDelEquipo" BOOLEAN NOT NULL DEFAULT TRUE,
                "tocadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
    })().catch((error) => {
        // Que el siguiente lo vuelva a intentar en vez de quedarse con una
        // promesa rota para siempre.
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

/** Igual que en el resto de tablas de la App: el `42P01` va en `meta.code`. */
function esTablaQueFalta(error: unknown): boolean {
    const e = error as { code?: string; meta?: { code?: string }; message?: string };
    return (
        e?.meta?.code === "42P01" ||
        e?.code === "42P01" ||
        Boolean(e?.message?.includes("42P01"))
    );
}

async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLaTabla();
    try {
        return await hacer();
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        // El recuerdo de «ya la creé» es del PROCESO, no de la base: si la
        // tabla desapareció por debajo hay que olvidarlo y volver a crearla.
        // Una vez, no en bucle: si tampoco va la segunda, el problema era otro.
        tablaLista = null;
        await asegurarLaTabla();
        return hacer();
    }
}

/**
 * Si esta persona quiere que el chat del equipo suene.
 *
 * **Encendido por defecto**, y por eso la ausencia de fila vale `true`: nadie
 * tiene que ir a encenderlo para enterarse de que le han escrito, que es el
 * fallo del que venimos. Apagarlo es una decisión; no haberlo tocado, no.
 */
export async function quiereSonido(personaId: string): Promise<boolean> {
    if (!personaId) return true;
    return conLaTabla(async () => {
        const filas = await db.$queryRaw<{ sonidoDelEquipo: boolean }[]>`
            SELECT "sonidoDelEquipo" FROM "preferencias_de_persona"
            WHERE "personaId" = ${personaId}
            LIMIT 1
        `;
        return filas[0]?.sonidoDelEquipo ?? true;
    });
}

export async function ponerElSonido(personaId: string, quiere: boolean): Promise<void> {
    if (!personaId) return;
    await conLaTabla(async () => {
        await db.$executeRaw`
            INSERT INTO "preferencias_de_persona" ("personaId", "sonidoDelEquipo", "tocadoEn")
            VALUES (${personaId}, ${quiere}, CURRENT_TIMESTAMP)
            ON CONFLICT ("personaId") DO UPDATE
               SET "sonidoDelEquipo" = EXCLUDED."sonidoDelEquipo",
                   "tocadoEn" = CURRENT_TIMESTAMP
        `;
    });
}
