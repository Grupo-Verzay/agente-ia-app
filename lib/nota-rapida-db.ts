import "server-only";

import { db } from "@/lib/db";
import { comoTextoDeLaNota } from "@/lib/nota-rapida";

/**
 * Dónde vive la nota rápida: `nota_rapida`, **una fila por PERSONA**.
 *
 * Tabla de la App, con `CREATE TABLE IF NOT EXISTS` y **sin clave foránea**,
 * como el resto. Ni una columna en `User`: esa es del BACKEND y añadirle
 * columnas desde aquí es lo que reventó el #360. Sin clave foránea, al borrar
 * una persona queda una fila huérfana con un texto dentro, que no molesta a
 * nadie.
 *
 * # Por la PERSONA, no por la cuenta
 *
 * Es el mismo reparto que `preferencias_de_persona` y que `quienFirma`: dentro
 * de una cuenta ajena con «Ingresar», la nota que se abre sigue siendo la de
 * quien está sentado delante y no la del cliente. Un papel de al lado del
 * teclado no cambia porque se entre a mirar otra cuenta.
 *
 * Y la clave primaria **es** el `personaId`: una nota por persona no es una
 * decisión de la pantalla que alguien pueda saltarse mandando dos, es la forma
 * de la tabla.
 */

let tablaLista: Promise<void> | null = null;

/**
 * Un `CREATE … IF NOT EXISTS` no basta con dos réplicas: dos procesos que lo
 * ejecuten a la vez pasan los dos la comprobación del catálogo y el segundo
 * revienta al escribir en `pg_class`. Solo se traga «ya existe»; cualquier
 * otro error sube. Es la misma función que `lib/embudos-db.ts`.
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
    tablaLista ??= (async () => {
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "nota_rapida" (
                "personaId" TEXT PRIMARY KEY,
                "contenido" TEXT NOT NULL DEFAULT '',
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
    })().catch((error) => {
        // Que el siguiente lo vuelva a intentar en vez de quedarse con una
        // promesa rota para siempre.
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

/** En una consulta en crudo el `42P01` de Postgres viaja en `meta.code`. */
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

/** Lo que esta persona tiene apuntado. Sin fila, la nota está en blanco. */
export async function leerLaNotaRapida(personaId: string): Promise<string> {
    if (!personaId) return "";
    return conLaTabla(async () => {
        const filas = await db.$queryRaw<{ contenido: string }[]>`
            SELECT "contenido" FROM "nota_rapida"
            WHERE "personaId" = ${personaId}
            LIMIT 1
        `;
        return filas[0]?.contenido ?? "";
    });
}

/**
 * Guarda lo apuntado. Un `INSERT … ON CONFLICT`, que es lo que hace que «una
 * por persona» no dependa de que nadie mande dos a la vez.
 *
 * El texto pasa por `comoTextoDeLaNota` **aquí y no solo en la acción**: con el
 * saneado únicamente arriba, el día que otro camino llame a esta función la
 * columna admitiría lo que le echen. Es la misma razón por la que `cobros`
 * sanea su nota de pago al escribir.
 */
export async function guardarLaNotaRapida(personaId: string, texto: string): Promise<void> {
    if (!personaId) return;
    const contenido = comoTextoDeLaNota(texto);
    await conLaTabla(async () => {
        await db.$executeRaw`
            INSERT INTO "nota_rapida" ("personaId", "contenido", "actualizadoEn")
            VALUES (${personaId}, ${contenido}, CURRENT_TIMESTAMP)
            ON CONFLICT ("personaId") DO UPDATE
               SET "contenido" = EXCLUDED."contenido",
                   "actualizadoEn" = CURRENT_TIMESTAMP
        `;
    });
}
