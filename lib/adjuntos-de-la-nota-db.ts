import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { asegurarIndice, asegurarTabla } from "@/lib/ddl-sin-bloquear";
import { llaveDelArchivoSubido } from "@/lib/llave-del-bucket";
import type { AdjuntoDeLaNota, TipoDeAdjuntoDeLaNota } from "@/lib/adjuntos-de-la-nota";

/**
 * Dónde viven los adjuntos de las notas internas: `adjuntos_de_notas`, una fila
 * por archivo, con el `noteId` de `internal_notes`.
 *
 * Tabla de la App con `CREATE TABLE IF NOT EXISTS` y **sin clave foránea**, como
 * `acceso_por_mencion`: `internal_notes` es del BACKEND y atarle una clave desde
 * aquí es acoplarse a un esquema que no es nuestro. Por eso borrar la nota
 * borra sus adjuntos a mano (`quitarLosAdjuntosDeLaNota`), y una fila huérfana
 * —nota borrada por cascada al borrar el chat— no se ve nunca: la lectura
 * entra siempre por el id de una nota que existe.
 *
 * Se CREA al guardar el primero y se LEE sin crearla: una cuenta que nunca
 * adjuntó nada no hace DDL al abrir una conversación.
 */

const TABLA = "adjuntos_de_notas";
const INDICE = "adjuntos_de_notas_nota_idx";

let tablaLista: Promise<void> | null = null;

function asegurarLaTabla(): Promise<void> {
    tablaLista ??= (async () => {
        await asegurarTabla(
            TABLA,
            `CREATE TABLE IF NOT EXISTS "${TABLA}" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "noteId" INTEGER NOT NULL,
                "orden" INTEGER NOT NULL DEFAULT 0,
                "url" TEXT NOT NULL,
                "nombre" TEXT NOT NULL,
                "mime" TEXT,
                "tipo" TEXT NOT NULL,
                "tamano" INTEGER NOT NULL DEFAULT 0,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`,
        );
        await asegurarIndice(INDICE, `CREATE INDEX IF NOT EXISTS "${INDICE}" ON "${TABLA}" ("noteId")`);
    })().catch((error) => {
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

/** Lo que hay que llamar ANTES de abrir la transacción que guarda la nota. */
export const prepararLosAdjuntosDeLasNotas = asegurarLaTabla;

/** En una consulta en crudo el código de Postgres viaja en `meta.code`. */
function faltaLaTabla(error: unknown): boolean {
    const e = error as { code?: string; meta?: { code?: string }; message?: string };
    return (e?.meta?.code ?? e?.code) === "42P01" || String(e?.message ?? "").includes("42P01");
}

const TIPOS = new Set<TipoDeAdjuntoDeLaNota>(["image", "video", "audio", "document"]);

type Ejecutor = Prisma.TransactionClient | typeof db;

/** Guarda los adjuntos de una nota. Va dentro de la MISMA transacción que la nota. */
export async function guardarLosAdjuntosDeLaNota(
    tx: Ejecutor,
    noteId: number,
    adjuntos: readonly AdjuntoDeLaNota[],
): Promise<void> {
    if (adjuntos.length === 0) return;
    await tx.$executeRaw`
        INSERT INTO "adjuntos_de_notas" ("id", "noteId", "orden", "url", "nombre", "mime", "tipo", "tamano")
        VALUES ${Prisma.join(
            adjuntos.map(
                (a, i) =>
                    Prisma.sql`(${randomUUID()}, ${noteId}, ${i}, ${a.url}, ${a.nombre}, ${a.mime}, ${a.tipo}, ${a.tamano})`,
            ),
        )}`;
}

type Fila = {
    noteId: number;
    url: string;
    nombre: string;
    mime: string | null;
    tipo: string;
    tamano: number;
};

function comoAdjunto(f: Fila): AdjuntoDeLaNota {
    return {
        url: f.url,
        nombre: f.nombre,
        mime: f.mime,
        tamano: Number(f.tamano) || 0,
        tipo: TIPOS.has(f.tipo as TipoDeAdjuntoDeLaNota) ? (f.tipo as TipoDeAdjuntoDeLaNota) : "document",
    };
}

/** Los adjuntos de varias notas, por id de nota, en el orden en que se subieron. */
export async function losAdjuntosDeLasNotas(
    noteIds: readonly number[],
): Promise<Map<number, AdjuntoDeLaNota[]>> {
    const porNota = new Map<number, AdjuntoDeLaNota[]>();
    if (noteIds.length === 0) return porNota;
    try {
        const filas = await db.$queryRaw<Fila[]>`
            SELECT "noteId", "url", "nombre", "mime", "tipo", "tamano"
              FROM "adjuntos_de_notas"
             WHERE "noteId" = ANY(${[...noteIds]}::int[])
             ORDER BY "noteId", "orden"`;
        for (const f of filas) {
            const id = Number(f.noteId);
            const lista = porNota.get(id) ?? [];
            lista.push(comoAdjunto(f));
            porNota.set(id, lista);
        }
    } catch (error) {
        // Sin la tabla no hay ninguna nota con archivo: es el caso de una cuenta
        // que nunca adjuntó. Cualquier otro fallo SÍ se dice.
        if (!faltaLaTabla(error)) throw error;
    }
    return porNota;
}

/**
 * Quita los adjuntos de una nota y devuelve cuáles eran, para soltarlos del
 * bucket. Va dentro de la transacción que borra la nota, y por eso NO se traga
 * un fallo: en Postgres una sentencia fallida aborta la transacción entera.
 * Quien llama solo la usa cuando `losAdjuntosDeLasNotas` ya encontró filas, o
 * sea, cuando la tabla existe.
 */
export async function quitarLosAdjuntosDeLaNota(tx: Ejecutor, noteId: number): Promise<AdjuntoDeLaNota[]> {
    const filas = await tx.$queryRaw<Fila[]>`
        DELETE FROM "adjuntos_de_notas" WHERE "noteId" = ${noteId}
        RETURNING "noteId", "url", "nombre", "mime", "tipo", "tamano"`;
    return filas.map(comoAdjunto);
}

/**
 * Suelta del bucket los archivos de una nota borrada. Nunca lanza: la nota ya
 * se borró y eso no puede fallar por un archivo; pero NO es mudo, porque un
 * archivo que se queda en el bucket sin decirlo es espacio que nadie sabe de
 * dónde salió. Solo toca llaves con la forma que escribe `/api/upload`.
 */
export async function soltarLosArchivosDelBucket(adjuntos: readonly AdjuntoDeLaNota[]): Promise<void> {
    const bucket = process.env.S3_BUCKET_NAME || "verzay-media";
    // El cliente del bucket se carga AQUÍ y no arriba: casi todas las notas no
    // llevan archivo, y todo lo que importa estas acciones —las pantallas y los
    // bancos que las empaquetan— no tiene por qué arrastrar el cliente de S3.
    const { minioClient } = await import("@/lib/minio");
    await Promise.all(
        adjuntos.map(async (a) => {
            const destino = llaveDelArchivoSubido(a.url, process.env.S3_PUBLIC_URL, bucket);
            if (!destino) {
                console.warn("[notas internas] un adjunto no apunta a nuestro bucket: no se borra", { url: a.url });
                return;
            }
            try {
                await minioClient.removeObject(bucket, destino.llave);
            } catch (error) {
                console.warn("[notas internas] no se pudo borrar el archivo del bucket", {
                    llave: destino.llave,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }),
    );
}
