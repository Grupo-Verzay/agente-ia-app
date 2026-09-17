import "server-only";

import { db } from "@/lib/db";
import { TOPE_DE_MENSAJES, type MensajeDeEquipo } from "@/lib/chat-de-equipo";

/**
 * La tabla del chat interno del equipo.
 *
 * **De la App, creada por la App** con `CREATE TABLE IF NOT EXISTS`, igual que
 * `task_comments`, `task_attachments`, `flows` y `tickets_de_soporte`. Las
 * migraciones son del BACKEND (`docs/db-migrations-ownership.md`) y meterle
 * una columna a una tabla suya desde aquí es lo que reventó el #360.
 *
 * Sin clave foránea contra `User`: una `FOREIGN KEY` desde aquí ataría las dos
 * migraciones, y además el nombre del autor se **copia dentro** para que el
 * hilo siga diciendo quién escribió aunque esa persona salga del equipo.
 *
 * `cuentaId` es la cuenta —`ownerId ?? id`, el mismo valor con el que agrupan
 * Carpetas, Proyectos y Diagramas—, y es lo que hace que el hilo sea **uno por
 * cuenta**: no hay canales que elegir, la cuenta ES el hilo.
 */

let tablaLista: Promise<void> | null = null;

function asegurarLaTabla(): Promise<void> {
    tablaLista ??= (async () => {
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "team_chat_messages" (
                "id" TEXT PRIMARY KEY,
                "cuentaId" TEXT NOT NULL,
                "autorId" TEXT NOT NULL,
                "autorNombre" TEXT,
                "texto" TEXT NOT NULL,
                "mencionados" TEXT[] NOT NULL DEFAULT '{}',
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        // El unico indice que hace falta: el hilo de una cuenta, por fecha. Es
        // la consulta del reloj, que corre cada pocos segundos por pestaña
        // abierta, asi que tiene que ser la mas barata de todas.
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "team_chat_messages_cuenta_idx"
            ON "team_chat_messages" ("cuentaId", "creadoEn")
        `;
        // Desde que cuenta se escribio, cuando NO es la de quien firma.
        //
        // `autorId` y `autorNombre` son la PERSONA, siempre; esto es el rastro
        // de haber escrito desde dentro de una cuenta ajena con «Ingresar».
        // Entra con `ALTER TABLE … ADD COLUMN IF NOT EXISTS` y no reescribiendo
        // el `CREATE`: la tabla ya existe en produccion y un
        // `CREATE TABLE IF NOT EXISTS` no toca una que ya esta — es el fallo
        // que se comete solo al añadirle una columna a una tabla de la App ya
        // desplegada.
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "escritoDesde" TEXT
        `;
    })().catch((error) => {
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

/**
 * `42P01` de Postgres: «relation does not exist».
 *
 * **Prisma no lo deja arriba.** En una consulta en crudo el `code` de primer
 * nivel es el suyo —`P2010`— y el de Postgres viaja dentro, en `meta.code`.
 * Mirar solo `error.code` no encuentra nunca el `42P01`. Es el mismo despiste
 * que ya costó una vuelta en `avisos-de-tarea` y en `tickets-db`.
 */
function esTablaQueFalta(error: unknown): boolean {
    const meta = (error as { meta?: { code?: string } } | null)?.meta;
    if (meta?.code === "42P01") return true;
    const texto = error instanceof Error ? error.message : String(error);
    return texto.includes("42P01");
}

/**
 * Hace algo contra la tabla, creándola si no está.
 *
 * El recuerdo de «ya la creé» es **del proceso, no de la base**: si la tabla
 * desaparece por debajo —una restauración, un entorno recién levantado— el
 * recuerdo seguiría diciendo que existe y todas las consultas fallarían con
 * `42P01` hasta que alguien reiniciara el contenedor. Ante ese código se
 * olvida, se crea y se reintenta **una vez**: si tampoco va la segunda, el
 * problema no era que faltara la tabla.
 */
async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLaTabla();
    try {
        return await hacer();
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        console.warn("[chat-equipo] la tabla del hilo no estaba; se crea y se reintenta");
        tablaLista = null;
        await asegurarLaTabla();
        return hacer();
    }
}

type Fila = {
    id: string;
    autorId: string;
    autorNombre: string | null;
    escritoDesde: string | null;
    texto: string;
    mencionados: string[] | null;
    creadoEn: Date;
};

const aMensaje = (f: Fila): MensajeDeEquipo => ({
    id: f.id,
    autorId: f.autorId,
    autorNombre: f.autorNombre,
    escritoDesde: f.escritoDesde,
    texto: f.texto,
    mencionados: f.mencionados ?? [],
    creadoEn: f.creadoEn.toISOString(),
});

/**
 * El hilo de una cuenta, del más antiguo al más nuevo.
 *
 * Se piden los ÚLTIMOS `TOPE_DE_MENSAJES` —`DESC` con `LIMIT`, que es lo que
 * entra por el índice— y se le dan la vuelta para pintarlos. Pidiéndolos `ASC`
 * el tope devolvería los PRIMEROS, o sea la conversación de hace un año.
 */
export async function leerElHilo(cuentaId: string): Promise<MensajeDeEquipo[]> {
    return conLaTabla(async () => {
        const filas = await db.$queryRaw<Fila[]>`
            SELECT "id", "autorId", "autorNombre", "escritoDesde",
                   "texto", "mencionados", "creadoEn"
            FROM "team_chat_messages"
            WHERE "cuentaId" = ${cuentaId}
            ORDER BY "creadoEn" DESC
            LIMIT ${TOPE_DE_MENSAJES}
        `;
        return filas.map(aMensaje).reverse();
    });
}

export async function guardarUnMensaje(input: {
    id: string;
    cuentaId: string;
    autorId: string;
    autorNombre: string | null;
    /** La cuenta desde la que se escribió, si no es la de quien firma. */
    escritoDesde: string | null;
    texto: string;
    mencionados: string[];
}): Promise<void> {
    await conLaTabla(() => db.$executeRaw`
        INSERT INTO "team_chat_messages"
            ("id", "cuentaId", "autorId", "autorNombre", "escritoDesde",
             "texto", "mencionados")
        VALUES (
            ${input.id}, ${input.cuentaId}, ${input.autorId},
            ${input.autorNombre}, ${input.escritoDesde},
            ${input.texto}, ${input.mencionados}
        )
    `);
}
