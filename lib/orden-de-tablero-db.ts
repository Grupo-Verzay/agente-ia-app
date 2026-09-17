import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
    posicionesDeLaColumna,
    type PosicionesDelTablero,
    type TipoDeTablero,
} from "@/lib/orden-del-tablero";

/**
 * Dónde vive la posición de cada tarjeta en un tablero.
 *
 * **Tabla de la App, con `CREATE TABLE IF NOT EXISTS` y sin clave foránea**, y
 * no una columna en las tablas de las tarjetas. En Proyectos no hay elección:
 * `tasks` es del BACKEND y añadirle columnas desde aquí es lo que reventó el
 * #360. En Tickets sí la habría —`tickets_de_soporte` es nuestra— y aun así va
 * aquí: con una columna en cada sitio serían dos mecanismos para lo mismo, y el
 * día que se afine uno el otro se queda atrás.
 *
 * Sin clave foránea, así que al borrar una tarjeta la limpieza es explícita
 * (`olvidarLaTarjeta`) y no puede reventar el borrado.
 *
 * La llave es `(tipo, tableroId, tarjetaId)`:
 *
 * - `tipo` — `proyecto` o `tickets`.
 * - `tableroId` — el id del proyecto, o la cuenta que RECIBE los tickets. En
 *   los dos casos es **el tablero**, no quien mira: un proyecto compartido lo
 *   abren dos cuentas y es el mismo tablero con las mismas tarjetas.
 * - `tarjetaId` — TEXT, porque una tarea es un entero y un ticket es un uuid.
 */

let tablaLista: Promise<void> | null = null;

function asegurarLaTabla(): Promise<void> {
    tablaLista ??= (async () => {
        await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "orden_en_tablero" (
        "tipo" TEXT NOT NULL,
        "tableroId" TEXT NOT NULL,
        "tarjetaId" TEXT NOT NULL,
        "orden" INTEGER NOT NULL,
        "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("tipo", "tableroId", "tarjetaId")
      )
    `;
        // El tablero entero se lee de una vez al abrirlo, y la clave primaria ya
        // empieza por (tipo, tableroId): esa consulta entra por ella y no hace
        // falta ningun indice mas.
    })().catch((error) => {
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

/** ¿Es el `42P01` de Postgres —«no existe la tabla»—? */
function faltaLaTabla(error: unknown): boolean {
    // En una consulta en crudo el `code` de primer nivel es el de Prisma
    // (`P2010`) y el de Postgres viaja dentro, en `meta.code`. Preguntar solo
    // por el de arriba es lo que hacía que el reintento no se disparara nunca.
    const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
    if (e?.meta?.code === "42P01" || e?.code === "42P01") return true;
    return typeof e?.message === "string" && e.message.includes("42P01");
}

/**
 * El recuerdo de «ya la creé» es **del proceso, no de la base**: si la tabla
 * desaparece por debajo —una restauración, un entorno recién levantado—, el
 * recuerdo seguiría diciendo que existe y todas las consultas fallarían hasta
 * que alguien reiniciara el contenedor. Ante un `42P01` se olvida, se crea y se
 * reintenta **una** vez: si tampoco va la segunda, el problema no era ese.
 */
async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLaTabla();
    try {
        return await hacer();
    } catch (error) {
        if (!faltaLaTabla(error)) throw error;
        tablaLista = null;
        await asegurarLaTabla();
        return hacer();
    }
}

/** Las posiciones de un tablero entero, de una sola consulta. */
export async function posicionesDelTablero(
    tipo: TipoDeTablero,
    tableroId: string,
): Promise<PosicionesDelTablero> {
    if (!tableroId.trim()) return {};
    return conLaTabla(async () => {
        const filas = await db.$queryRaw<Array<{ tarjetaId: string; orden: number }>>`
      SELECT "tarjetaId", "orden"
      FROM "orden_en_tablero"
      WHERE "tipo" = ${tipo} AND "tableroId" = ${tableroId}
    `;
        const mapa: PosicionesDelTablero = {};
        for (const f of filas) mapa[f.tarjetaId] = Number(f.orden);
        return mapa;
    });
}

/**
 * Guardar una columna entera, de una sola consulta.
 *
 * Una por tarjeta serían treinta peticiones por arrastre, que es «muchas
 * peticiones pequeñas son turno, no trabajo». Va un `INSERT … ON CONFLICT` de
 * varias filas, y `posicionesDeLaColumna` ya descartó los ids repetidos: dos
 * veces la misma fila en un mismo `INSERT` y Postgres rechaza el comando entero.
 */
export async function guardarLaColumna(input: {
    tipo: TipoDeTablero;
    tableroId: string;
    /** Los ids de esa columna, en el orden en que tienen que quedar. */
    ids: string[];
}): Promise<void> {
    const filas = posicionesDeLaColumna(input.ids);
    if (filas.length === 0) return;

    await conLaTabla(async () => {
        const valores = filas.map(
            (f) =>
                Prisma.sql`(${input.tipo}, ${input.tableroId}, ${f.id}, ${f.orden}, NOW())`,
        );
        await db.$executeRaw`
      INSERT INTO "orden_en_tablero" ("tipo", "tableroId", "tarjetaId", "orden", "actualizadoEn")
      VALUES ${Prisma.join(valores)}
      ON CONFLICT ("tipo", "tableroId", "tarjetaId")
      DO UPDATE SET "orden" = EXCLUDED."orden", "actualizadoEn" = NOW()
    `;
    });
}

/**
 * La posición con la que entra una tarjeta: **el máximo del tablero más uno**.
 *
 * Con eso queda la última de su columna sin que haya que saber en qué columna
 * cae ni qué hay dentro: el máximo del tablero es, por definición, mayor o igual
 * que el de cualquiera de sus columnas. Lo llaman crear una tarjeta y moverla de
 * columna, que son las dos formas de llegar a una.
 *
 * Y nunca lanza: una tarea creada es una tarea creada, y quedarse sin posición
 * solo significa salir con las de antes —arriba— hasta que alguien la mueva. Un
 * fallo aquí **no puede tumbar lo que lo dispara**, pero tampoco es mudo.
 */
export async function alFinalDelTablero(
    tipo: TipoDeTablero,
    tableroId: string,
    tarjetaId: string,
): Promise<void> {
    const tablero = tableroId.trim();
    const tarjeta = tarjetaId.trim();
    if (!tablero || !tarjeta) return;

    try {
        await conLaTabla(async () => {
            // El `SELECT` va DENTRO del `INSERT`: dos consultas dejarían un hueco
            // entre leer el máximo y escribir, y dos tarjetas creadas a la vez se
            // llevarían el mismo número. Aquí Postgres lo resuelve en una.
            await db.$executeRaw`
        INSERT INTO "orden_en_tablero" ("tipo", "tableroId", "tarjetaId", "orden", "actualizadoEn")
        SELECT ${tipo}, ${tablero}, ${tarjeta},
               COALESCE(MAX("orden"), -1) + 1, NOW()
        FROM "orden_en_tablero"
        WHERE "tipo" = ${tipo} AND "tableroId" = ${tablero}
        ON CONFLICT ("tipo", "tableroId", "tarjetaId")
        DO UPDATE SET "orden" = EXCLUDED."orden", "actualizadoEn" = NOW()
      `;
        });
    } catch (error) {
        console.warn("[tablero] no se pudo colocar la tarjeta al final", {
            tipo,
            tablero,
            tarjeta,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/** Al borrar una tarjeta se limpia su fila. Nunca lanza: no puede reventar el borrado. */
export async function olvidarLaTarjeta(
    tipo: TipoDeTablero,
    tableroId: string,
    tarjetaId: string,
): Promise<void> {
    try {
        await conLaTabla(async () => {
            await db.$executeRaw`
        DELETE FROM "orden_en_tablero"
        WHERE "tipo" = ${tipo} AND "tableroId" = ${tableroId} AND "tarjetaId" = ${tarjetaId}
      `;
        });
    } catch (error) {
        console.warn("[tablero] no se pudo olvidar la posición de una tarjeta", {
            tipo,
            tarjeta: tarjetaId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
