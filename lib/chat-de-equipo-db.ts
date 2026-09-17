import "server-only";

import { db } from "@/lib/db";
import { TOPE_DE_MENSAJES, type MensajeDeEquipo } from "@/lib/chat-de-equipo";
import {
    CANAL_GENERAL,
    type TipoDeCanal,
} from "@/lib/canales-de-equipo";

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
 * Carpetas, Proyectos y Diagramas—. Dentro de ella, `canalId` dice en qué
 * canal cae cada mensaje; `NULL` es el **general**, que es donde estaban los
 * mensajes de cuando el hilo era uno solo.
 *
 * Aquí viven también las dos tablas de los canales, `team_channels` y
 * `team_channel_members`, por lo mismo: son de la App y las crea la App.
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
        // En que canal cae el mensaje. Entra por el mismo camino y por el
        // mismo motivo: la tabla ya esta en produccion. Y entra NULLABLE a
        // proposito — `NULL` es el general, asi que los mensajes de cuando el
        // hilo era uno solo se quedan donde estaban, sin backfill y sin dos
        // clases de mensaje.
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "canalId" TEXT
        `;
        // El indice del reloj, ahora por canal: es la consulta que corre cada
        // pocos segundos por panel abierto.
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "team_chat_messages_canal_idx"
            ON "team_chat_messages" ("cuentaId", "canalId", "creadoEn")
        `;
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "team_channels" (
                "id" TEXT PRIMARY KEY,
                "cuentaId" TEXT NOT NULL,
                "tipo" TEXT NOT NULL,
                "nombre" TEXT NOT NULL,
                "llave" TEXT,
                "creadoPorId" TEXT,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "team_channels_cuenta_idx"
            ON "team_channels" ("cuentaId")
        `;
        // La pareja de un directo, ordenada, es su identidad. UNICO porque el
        // directo lo puede abrir cualquiera de los dos y a la vez: sin esto
        // saldrian dos canales con los mismos dos miembros y la mitad de los
        // mensajes en cada uno.
        await db.$executeRaw`
            CREATE UNIQUE INDEX IF NOT EXISTS "team_channels_llave_key"
            ON "team_channels" ("cuentaId", "llave")
            WHERE "llave" IS NOT NULL
        `;
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "team_channel_members" (
                "canalId" TEXT NOT NULL,
                "personaId" TEXT NOT NULL,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY ("canalId", "personaId")
            )
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "team_channel_members_persona_idx"
            ON "team_channel_members" ("personaId")
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
export async function leerElHilo(
    cuentaId: string,
    canalId: string,
): Promise<MensajeDeEquipo[]> {
    return conLaTabla(async () => {
        const filas =
            canalId === CANAL_GENERAL
                // El general se lee con el `NULL` dentro: ahi estan los
                // mensajes de cuando el hilo era uno solo. Sin esa condicion
                // el general saldria vacio el dia del despliegue y parecerian
                // borrados.
                ? await db.$queryRaw<Fila[]>`
                    SELECT "id", "autorId", "autorNombre", "escritoDesde",
                           "texto", "mencionados", "creadoEn"
                    FROM "team_chat_messages"
                    WHERE "cuentaId" = ${cuentaId}
                      AND ("canalId" IS NULL OR "canalId" = ${CANAL_GENERAL})
                    ORDER BY "creadoEn" DESC
                    LIMIT ${TOPE_DE_MENSAJES}
                `
                : await db.$queryRaw<Fila[]>`
                    SELECT "id", "autorId", "autorNombre", "escritoDesde",
                           "texto", "mencionados", "creadoEn"
                    FROM "team_chat_messages"
                    WHERE "cuentaId" = ${cuentaId} AND "canalId" = ${canalId}
                    ORDER BY "creadoEn" DESC
                    LIMIT ${TOPE_DE_MENSAJES}
                `;
        return filas.map(aMensaje).reverse();
    });
}

export async function guardarUnMensaje(input: {
    id: string;
    cuentaId: string;
    canalId: string;
    autorId: string;
    autorNombre: string | null;
    /** La cuenta desde la que se escribió, si no es la de quien firma. */
    escritoDesde: string | null;
    texto: string;
    mencionados: string[];
}): Promise<void> {
    await conLaTabla(() => db.$executeRaw`
        INSERT INTO "team_chat_messages"
            ("id", "cuentaId", "canalId", "autorId", "autorNombre",
             "escritoDesde", "texto", "mencionados")
        VALUES (
            ${input.id}, ${input.cuentaId}, ${input.canalId}, ${input.autorId},
            ${input.autorNombre}, ${input.escritoDesde},
            ${input.texto}, ${input.mencionados}
        )
    `);
}

// ── Los canales ─────────────────────────────────────────────────────────────

export type FilaDeCanal = {
    id: string;
    tipo: TipoDeCanal;
    nombre: string;
    llave: string | null;
    miembros: string[];
};

/**
 * Los canales guardados de una cuenta, con sus miembros.
 *
 * **El general NO sale de aquí**: no es una fila, es una constante, y quien
 * llama lo pone delante. Guardarlo obligaría a crearlo en cada cuenta y a
 * acordarse de hacerlo en las que ya existen — o sea un backfill para algo que
 * no necesita ninguno.
 *
 * Los miembros se traen en la MISMA consulta, agregados. Pidiéndolos aparte
 * serían una consulta por canal, y esto lo lee la pantalla en cada apertura.
 */
export async function canalesDeLaCuenta(cuentaId: string): Promise<FilaDeCanal[]> {
    return conLaTabla(() => db.$queryRaw<FilaDeCanal[]>`
        SELECT c."id", c."tipo", c."nombre", c."llave",
               COALESCE(
                   ARRAY_AGG(m."personaId") FILTER (WHERE m."personaId" IS NOT NULL),
                   '{}'
               ) AS "miembros"
        FROM "team_channels" c
        LEFT JOIN "team_channel_members" m ON m."canalId" = c."id"
        WHERE c."cuentaId" = ${cuentaId}
        GROUP BY c."id", c."tipo", c."nombre", c."llave", c."creadoEn"
        ORDER BY c."creadoEn" ASC
    `);
}

/** Un canal concreto, para comprobar de quién es antes de tocarlo. */
export async function elCanal(
    cuentaId: string,
    canalId: string,
): Promise<FilaDeCanal | null> {
    const filas = await conLaTabla(() => db.$queryRaw<FilaDeCanal[]>`
        SELECT c."id", c."tipo", c."nombre", c."llave",
               COALESCE(
                   ARRAY_AGG(m."personaId") FILTER (WHERE m."personaId" IS NOT NULL),
                   '{}'
               ) AS "miembros"
        FROM "team_channels" c
        LEFT JOIN "team_channel_members" m ON m."canalId" = c."id"
        WHERE c."cuentaId" = ${cuentaId} AND c."id" = ${canalId}
        GROUP BY c."id", c."tipo", c."nombre", c."llave"
    `);
    return filas[0] ?? null;
}

export async function crearUnCanal(input: {
    id: string;
    cuentaId: string;
    nombre: string;
    creadoPorId: string;
    miembros: string[];
}): Promise<void> {
    await conLaTabla(async () => {
        await db.$executeRaw`
            INSERT INTO "team_channels"
                ("id", "cuentaId", "tipo", "nombre", "llave", "creadoPorId")
            VALUES (${input.id}, ${input.cuentaId}, 'area', ${input.nombre}, NULL, ${input.creadoPorId})
        `;
        await ponerLosMiembros(input.id, input.miembros);
    });
}

export async function renombrarUnCanal(
    cuentaId: string,
    canalId: string,
    nombre: string,
): Promise<number> {
    return conLaTabla(() => db.$executeRaw`
        UPDATE "team_channels"
        SET "nombre" = ${nombre}
        WHERE "cuentaId" = ${cuentaId} AND "id" = ${canalId} AND "tipo" = 'area'
    `);
}

/**
 * La lista de miembros de un canal, **entera**.
 *
 * Se borra y se vuelve a escribir dentro de una transacción: con dos consultas
 * sueltas, un fallo entre medias dejaría el canal sin nadie dentro, que es
 * peor que no haber cambiado nada.
 */
export async function ponerLosMiembros(canalId: string, personas: string[]): Promise<void> {
    const limpias = Array.from(new Set(personas.map((p) => p.trim()).filter(Boolean)));
    await conLaTabla(() =>
        db.$transaction(async (tx) => {
            await tx.$executeRaw`DELETE FROM "team_channel_members" WHERE "canalId" = ${canalId}`;
            for (const personaId of limpias) {
                await tx.$executeRaw`
                    INSERT INTO "team_channel_members" ("canalId", "personaId")
                    VALUES (${canalId}, ${personaId})
                    ON CONFLICT DO NOTHING
                `;
            }
        }),
    );
}

/**
 * El directo de dos personas, creándolo si todavía no existe.
 *
 * El `ON CONFLICT DO NOTHING` sobre la llave es lo que hace que abrirlo los dos
 * a la vez —cada uno desde su lado— no cree dos canales. Y después se LEE, en
 * vez de fiarse de lo que devolvió el `INSERT`: si el conflicto saltó, el id
 * bueno es el que ya estaba, no el que se acaba de generar.
 */
export async function abrirElDirecto(input: {
    id: string;
    cuentaId: string;
    llave: string;
    miembros: [string, string];
}): Promise<string> {
    return conLaTabla(async () => {
        await db.$executeRaw`
            INSERT INTO "team_channels"
                ("id", "cuentaId", "tipo", "nombre", "llave", "creadoPorId")
            VALUES (${input.id}, ${input.cuentaId}, 'directo', '', ${input.llave}, ${input.miembros[0]})
            ON CONFLICT ("cuentaId", "llave") WHERE "llave" IS NOT NULL DO NOTHING
        `;
        const filas = await db.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "team_channels"
            WHERE "cuentaId" = ${input.cuentaId} AND "llave" = ${input.llave}
        `;
        const id = filas[0]?.id ?? input.id;
        // Los dos miembros se AÑADEN, no se reescribe la lista: abrirlo es
        // algo que pasa cada vez que se pulsa el nombre, y un borrar-y-poner
        // ahí dejaría el directo un instante sin nadie dentro en cada clic.
        for (const personaId of input.miembros) {
            await db.$executeRaw`
                INSERT INTO "team_channel_members" ("canalId", "personaId")
                VALUES (${id}, ${personaId})
                ON CONFLICT DO NOTHING
            `;
        }
        return id;
    });
}
