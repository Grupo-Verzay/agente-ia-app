import { db } from "@/lib/db";
import {
    comoDesenlace,
    comoTipoDeAccion,
    diaDeLaJornada,
    seccionesEnCero,
    accionesEnCero,
    type Desenlace,
    type EnvioDeJornada,
    type MedidasDeLaJornada,
    type Seccion,
    type TipoDeAccion,
} from "@/lib/actividad-del-equipo";

/**
 * Dónde vive la actividad del equipo. **Tres tablas de la App**, creadas por la
 * App con `CREATE TABLE IF NOT EXISTS` y **sin ninguna clave foránea**, como
 * `task_comments`, `cobros` y `tickets_de_soporte`. Ni una columna nueva en
 * `User` ni en `Session`: son del backend, y añadirles columnas desde aquí es
 * lo que reventó el #360.
 *
 * Son tres y no una porque **crecen de tres maneras distintas**, y esa es la
 * respuesta entera a «¿cómo lo guardas para que consultar un mes no tarde?»:
 *
 * | tabla | una fila por | crece con |
 * | --- | --- | --- |
 * | `actividad_jornada` | persona · día · sección · pestaña | el calendario |
 * | `actividad_acciones` | persona · día · tipo | el calendario |
 * | `actividad_resultados` | acción de verdad | lo que hace la gente |
 *
 * Las dos primeras **ya vienen sumadas por día**: la forma de escribirlas ES el
 * resumen, así que no hace falta ningún trabajo nocturno que agregue nada, ni
 * hay ventana en la que el resumen esté a medias. Un mes de un equipo de diez
 * son unos pocos miles de filas y un `SUM` por su índice.
 *
 * La tercera es un registro de hechos —una fila por ticket, por cobro, por
 * seguimiento—, así que crece con el trabajo real y no con el reloj. Esa es la
 * diferencia que importa: **lo que crece con el reloj no puede tener una fila
 * por evento.**
 *
 * Y ninguna consulta de la pantalla toca `chat_messages`, `tasks` ni `cobros`.
 * Contar «mensajes del mes pasado» barriendo la tabla grande es exactamente el
 * problema que la regla del BRIN describe; aquí el contador se escribe cuando
 * pasa la cosa y leerlo no cuesta nada.
 */

/* ─────────────────────────── Crear y reintentar ─────────────────────────── */

let tablasListas: Promise<void> | null = null;

function asegurarLasTablas(): Promise<void> {
    tablasListas ??= (async () => {
        // ── Capa 1: el tiempo ──────────────────────────────────────────────
        //
        // La llave lleva `pestanaId` por una razón concreta: el navegador manda
        // su TOTAL acumulado y el servidor guarda `GREATEST`, no una suma. Así
        // **reenviar el mismo envío no cuenta dos veces** —un reintento tras un
        // corte de red es inofensivo— y un envío perdido lo arregla el
        // siguiente, que ya trae el total. Con una suma, cada reintento
        // inflaría la jornada y no habría forma de saberlo después.
        //
        // Sin `pestanaId` en la llave no se puede: dos pestañas con totales
        // distintos se pisarían con `GREATEST` y ganaría la más vieja.
        await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "actividad_jornada" (
        "personaId" TEXT NOT NULL,
        "cuentaId" TEXT NOT NULL,
        "dia" DATE NOT NULL,
        "seccion" TEXT NOT NULL,
        "pestanaId" TEXT NOT NULL,
        "segundos" INTEGER NOT NULL DEFAULT 0,
        "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "hasta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("personaId", "dia", "seccion", "pestanaId")
      )
    `;
        // El asesor lee lo suyo y entra por la clave primaria, que ya empieza
        // por `personaId`. El administrador lee el equipo entero de un mes y
        // para eso hace falta este: sin él, el mes de la cuenta recorre la
        // tabla.
        await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "actividad_jornada_cuenta_dia_idx"
        ON "actividad_jornada" ("cuentaId", "dia")
    `;

        // ── Capa 2: qué hizo ───────────────────────────────────────────────
        //
        // Aquí SÍ se suma (`+ 1`), y es correcto: cada llamada es una cosa que
        // pasó de verdad una vez —un mensaje que salió, un ticket que se
        // cerró—, no un latido que se puede repetir.
        await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "actividad_acciones" (
        "personaId" TEXT NOT NULL,
        "cuentaId" TEXT NOT NULL,
        "dia" DATE NOT NULL,
        "tipo" TEXT NOT NULL,
        "cuantas" INTEGER NOT NULL DEFAULT 0,
        "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("personaId", "dia", "tipo")
      )
    `;
        await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "actividad_acciones_cuenta_dia_idx"
        ON "actividad_acciones" ("cuentaId", "dia")
    `;

        // ── Capa 3: cómo acabó ─────────────────────────────────────────────
        //
        // Una fila por acción, con su desenlace en blanco hasta que se sepa. Se
        // guarda desde el primer día aunque la pantalla no lo enseñe: el día
        // que haya con qué comparar, el dato ya está.
        //
        // `refId` es TEXT porque un ticket es un uuid y una tarea un entero, el
        // mismo motivo por el que lo es en `orden_en_tablero`.
        await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "actividad_resultados" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "personaId" TEXT NOT NULL,
        "cuentaId" TEXT NOT NULL,
        "tipo" TEXT NOT NULL,
        "refId" TEXT,
        "ocurridoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "desenlace" TEXT,
        "desenlaceEn" TIMESTAMP(3),
        "msHastaDesenlace" BIGINT
      )
    `;
        // Por aquí entra el cierre del círculo: «el ticket X ya se resolvió».
        await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "actividad_resultados_ref_idx"
        ON "actividad_resultados" ("tipo", "refId")
    `;
        await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "actividad_resultados_cuenta_idx"
        ON "actividad_resultados" ("cuentaId", "ocurridoEn")
    `;
    })().catch((error) => {
        tablasListas = null;
        throw error;
    });
    return tablasListas;
}

/** ¿Es el `42P01` de Postgres —«no existe la tabla»—? */
function faltanLasTablas(error: unknown): boolean {
    // En una consulta en crudo el `code` de primer nivel es el de Prisma
    // (`P2010`) y el de Postgres viaja dentro, en `meta.code`. Preguntar solo
    // por el de arriba es lo que hacía que el reintento no se disparara nunca.
    const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
    if (e?.meta?.code === "42P01" || e?.code === "42P01") return true;
    return typeof e?.message === "string" && e.message.includes("42P01");
}

/**
 * El recuerdo de «ya las creé» es **del proceso, no de la base**: si las tablas
 * desaparecen por debajo —una restauración, un entorno recién levantado—, el
 * recuerdo seguiría diciendo que existen y todas las consultas fallarían hasta
 * que alguien reiniciara el contenedor. Ante un `42P01` se olvida, se crean y
 * se reintenta **una** vez.
 */
async function conLasTablas<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLasTablas();
    try {
        return await hacer();
    } catch (error) {
        if (!faltanLasTablas(error)) throw error;
        tablasListas = null;
        await asegurarLasTablas();
        return hacer();
    }
}

/* ────────────────────────── Capa 1: guardar el tiempo ───────────────────── */

/**
 * Guarda lo que manda una pestaña.
 *
 * `GREATEST` y no `+`: ver el comentario de la tabla. Es lo que hace que
 * reintentar sea gratis y que un envío perdido se recupere solo con el
 * siguiente.
 *
 * `desde` se conserva —es la primera vez que se vio esa pestaña en esa sección—
 * y `hasta` avanza. De esos dos sale «de qué hora a qué hora» sin guardar ni un
 * evento de entrada ni uno de salida.
 */
export async function guardarLaJornada(args: {
    personaId: string;
    cuentaId: string;
    envio: EnvioDeJornada;
    ahora?: Date;
}): Promise<void> {
    const dia = diaDeLaJornada(args.ahora ?? new Date());
    await conLasTablas(async () => {
        for (const trozo of args.envio.trozos) {
            await db.$executeRaw`
        INSERT INTO "actividad_jornada"
          ("personaId", "cuentaId", "dia", "seccion", "pestanaId", "segundos")
        VALUES (
          ${args.personaId}, ${args.cuentaId}, ${dia}::date,
          ${trozo.seccion}, ${args.envio.pestanaId}, ${trozo.segundos}
        )
        ON CONFLICT ("personaId", "dia", "seccion", "pestanaId") DO UPDATE SET
          "segundos" = GREATEST("actividad_jornada"."segundos", EXCLUDED."segundos"),
          "hasta" = CURRENT_TIMESTAMP
      `;
        }
    });
}

/* ───────────────────────── Capa 2: contar lo que hizo ───────────────────── */

/**
 * Suma una acción al contador del día.
 *
 * **Nunca lanza.** Esto cuelga de acciones que ya hicieron su trabajo —el
 * mensaje ya salió, el ticket ya está cerrado— y medir no puede deshacer lo
 * medido. Es la misma regla que ya rige en los avisos de tarea y en el aviso de
 * un ticket resuelto.
 *
 * **Pero no es mudo.** Un contador que deja de sumar en silencio no se ve como
 * un error: se ve como un equipo que trabaja menos, que es mucho peor.
 */
export async function anotarLaAccion(args: {
    personaId: string;
    cuentaId: string;
    tipo: TipoDeAccion;
    cuantas?: number;
    ahora?: Date;
}): Promise<void> {
    const cuantas = Math.max(1, Math.floor(args.cuantas ?? 1));
    const dia = diaDeLaJornada(args.ahora ?? new Date());
    try {
        if (!args.personaId || !args.cuentaId) return;
        await conLasTablas(async () => {
            await db.$executeRaw`
        INSERT INTO "actividad_acciones"
          ("personaId", "cuentaId", "dia", "tipo", "cuantas")
        VALUES (${args.personaId}, ${args.cuentaId}, ${dia}::date, ${args.tipo}, ${cuantas})
        ON CONFLICT ("personaId", "dia", "tipo") DO UPDATE SET
          "cuantas" = "actividad_acciones"."cuantas" + EXCLUDED."cuantas",
          "actualizadoEn" = CURRENT_TIMESTAMP
      `;
        });
    } catch (error) {
        console.warn("[actividad] no se pudo anotar la accion", {
            tipo: args.tipo,
            personaId: args.personaId,
            error,
        });
    }
}

/**
 * Cuenta **cosas distintas en un día**, no veces.
 *
 * Hay dos columnas así y las dos se estropean igual si se cuentan por evento:
 *
 * - **Chats atendidos.** Sumando uno por mensaje diría lo mismo que «mensajes
 *   enviados», con otro nombre, y entonces sobra una de las dos.
 * - **Clientes tocados.** Abrir la ficha de un cliente tres veces en una tarde
 *   es un cliente, no tres.
 *
 * Se deduplica **sin ninguna tabla nueva**: el id de la fila de resultado se
 * construye a mano —`tipo:persona:día:cosa`— y decide el `ON CONFLICT DO
 * NOTHING`. Solo cuando de verdad se insertó una fila se toca el contador.
 *
 * Quien decide es **la base**, por el número de filas que dice haber tocado, y
 * no un `SELECT` previo nuestro: dos peticiones a la vez verían las dos que no
 * existe y sumarían las dos.
 */
export async function anotarUnaVezAlDia(args: {
    personaId: string;
    cuentaId: string;
    tipo: TipoDeAccion;
    /** Qué cosa: el contacto, el cliente… Es lo que se cuenta una sola vez. */
    refId: string;
    ahora?: Date;
}): Promise<void> {
    try {
        if (!args.personaId || !args.cuentaId || !args.refId) return;
        const ahora = args.ahora ?? new Date();
        const dia = diaDeLaJornada(ahora);
        const id = `${args.tipo}:${args.personaId}:${dia}:${args.refId}`;

        await conLasTablas(async () => {
            const metidas = await db.$executeRaw`
        INSERT INTO "actividad_resultados"
          ("id", "personaId", "cuentaId", "tipo", "refId", "ocurridoEn")
        VALUES (${id}, ${args.personaId}, ${args.cuentaId}, ${args.tipo},
                ${args.refId}, ${ahora})
        ON CONFLICT ("id") DO NOTHING
      `;
            if (metidas > 0) {
                await db.$executeRaw`
          INSERT INTO "actividad_acciones"
            ("personaId", "cuentaId", "dia", "tipo", "cuantas")
          VALUES (${args.personaId}, ${args.cuentaId}, ${dia}::date, ${args.tipo}, 1)
          ON CONFLICT ("personaId", "dia", "tipo") DO UPDATE SET
            "cuantas" = "actividad_acciones"."cuantas" + 1,
            "actualizadoEn" = CURRENT_TIMESTAMP
        `;
            }
        });
    } catch (error) {
        console.warn("[actividad] no se pudo anotar una vez al dia", {
            tipo: args.tipo,
            personaId: args.personaId,
            error,
        });
    }
}

/* ──────────────────── Capa 3: abrir y cerrar un desenlace ───────────────── */

/**
 * Deja constancia de una acción cuyo final se sabrá después.
 *
 * Nunca lanza, por lo mismo que `anotarLaAccion`. Devuelve el id por si quien
 * llama quiere cerrarlo él mismo; lo normal es cerrarlo por `refId`.
 */
export async function abrirElResultado(args: {
    personaId: string;
    cuentaId: string;
    tipo: TipoDeAccion;
    refId?: string | null;
    ahora?: Date;
}): Promise<string | null> {
    const id = `${args.tipo}:${args.refId ?? ""}:${Date.now()}:${Math.random()
        .toString(36)
        .slice(2, 10)}`;
    try {
        if (!args.personaId || !args.cuentaId) return null;
        const ocurridoEn = args.ahora ?? new Date();
        await conLasTablas(async () => {
            await db.$executeRaw`
        INSERT INTO "actividad_resultados"
          ("id", "personaId", "cuentaId", "tipo", "refId", "ocurridoEn")
        VALUES (${id}, ${args.personaId}, ${args.cuentaId}, ${args.tipo},
                ${args.refId ?? null}, ${ocurridoEn})
        ON CONFLICT ("id") DO NOTHING
      `;
        });
        return id;
    } catch (error) {
        console.warn("[actividad] no se pudo abrir el resultado", {
            tipo: args.tipo,
            refId: args.refId,
            error,
        });
        return null;
    }
}

/**
 * Cierra el círculo: esta acción acabó así, y tardó esto.
 *
 * Se cierra **la más reciente que siga abierta** de ese `refId`. Un ticket se
 * puede reabrir y volver a cerrar, y entonces lo que se mide es el último
 * tramo; cerrarlas todas de golpe le pondría a un tramo de horas la antigüedad
 * del primero.
 *
 * `msHastaDesenlace` se calcula **en la base**, con la misma fila que guarda el
 * inicio. Restando dos fechas traídas al servidor se estaría comparando el
 * reloj de la base con el del contenedor, que no son el mismo.
 */
export async function cerrarElResultado(args: {
    tipo: TipoDeAccion;
    refId: string;
    desenlace: Desenlace;
    ahora?: Date;
}): Promise<void> {
    try {
        if (!args.refId) return;
        const cuando = args.ahora ?? new Date();
        await conLasTablas(async () => {
            await db.$executeRaw`
        UPDATE "actividad_resultados" SET
          "desenlace" = ${args.desenlace},
          "desenlaceEn" = ${cuando},
          "msHastaDesenlace" =
            EXTRACT(EPOCH FROM (${cuando}::timestamp - "ocurridoEn")) * 1000
        WHERE "id" = (
          SELECT "id" FROM "actividad_resultados"
          WHERE "tipo" = ${args.tipo}
            AND "refId" = ${args.refId}
            AND "desenlace" IS NULL
          ORDER BY "ocurridoEn" DESC
          LIMIT 1
        )
      `;
        });
    } catch (error) {
        console.warn("[actividad] no se pudo cerrar el resultado", {
            tipo: args.tipo,
            refId: args.refId,
            error,
        });
    }
}

/* ──────────────────────────────── Leer ──────────────────────────────────── */

type FilaJornada = {
    personaId: string;
    seccion: string;
    segundos: number | bigint;
};

type FilaAccion = {
    personaId: string;
    tipo: string;
    cuantas: number | bigint;
};

const comoNumero = (v: number | bigint): number =>
    typeof v === "bigint" ? Number(v) : v;

/**
 * La jornada de unas personas entre dos días.
 *
 * **Quién puede verlo se decide FUERA**, en la acción, con la puerta de
 * siempre. Aquí llega ya la lista de personas: una consulta que resolviera
 * permisos por su cuenta sería una segunda puerta que mantener a la par de la
 * primera, y es lo que dejó a media gente fuera en Clientes y en Equipo.
 *
 * Se suma en la base y no en el navegador: son dos consultas que devuelven una
 * fila por persona y sección, no el mes entero de filas.
 */
export async function laJornadaDe(args: {
    personaIds: string[];
    desde: string;
    hasta: string;
}): Promise<Map<string, MedidasDeLaJornada>> {
    const mapa = new Map<string, MedidasDeLaJornada>();
    if (args.personaIds.length === 0) return mapa;

    const dame = (personaId: string): MedidasDeLaJornada => {
        const ya = mapa.get(personaId);
        if (ya) return ya;
        const nueva: MedidasDeLaJornada = {
            porSeccion: seccionesEnCero(),
            segundos: 0,
            acciones: accionesEnCero(),
        };
        mapa.set(personaId, nueva);
        return nueva;
    };

    await conLasTablas(async () => {
        const jornada = await db.$queryRaw<FilaJornada[]>`
      SELECT "personaId", "seccion", SUM("segundos")::bigint AS "segundos"
      FROM "actividad_jornada"
      WHERE "personaId" = ANY(${args.personaIds}::text[])
        AND "dia" >= ${args.desde}::date
        AND "dia" <= ${args.hasta}::date
      GROUP BY "personaId", "seccion"
    `;
        for (const fila of jornada) {
            // Una sección que ya no esté en la lista —de una versión anterior—
            // se descarta al LEER, para que una fila rara no rompa la pantalla.
            // Es la misma red que el tipo de trabajo de una tarea.
            const seccion = fila.seccion as Seccion;
            const donde = dame(fila.personaId);
            if (!(seccion in donde.porSeccion)) continue;
            const segundos = comoNumero(fila.segundos);
            donde.porSeccion[seccion] += segundos;
            donde.segundos += segundos;
        }

        const acciones = await db.$queryRaw<FilaAccion[]>`
      SELECT "personaId", "tipo", SUM("cuantas")::bigint AS "cuantas"
      FROM "actividad_acciones"
      WHERE "personaId" = ANY(${args.personaIds}::text[])
        AND "dia" >= ${args.desde}::date
        AND "dia" <= ${args.hasta}::date
      GROUP BY "personaId", "tipo"
    `;
        for (const fila of acciones) {
            const tipo = comoTipoDeAccion(fila.tipo);
            if (!tipo) continue;
            dame(fila.personaId).acciones[tipo] += comoNumero(fila.cuantas);
        }
    });

    return mapa;
}

/** Para el banco: qué desenlaces hay guardados de una acción. */
export async function resultadosDe(args: {
    tipo: TipoDeAccion;
    refId: string;
}): Promise<Array<{ desenlace: Desenlace | null; msHastaDesenlace: number | null }>> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<
            Array<{ desenlace: string | null; msHastaDesenlace: bigint | null }>
        >`
      SELECT "desenlace", "msHastaDesenlace"
      FROM "actividad_resultados"
      WHERE "tipo" = ${args.tipo} AND "refId" = ${args.refId}
      ORDER BY "ocurridoEn" ASC
    `;
        return filas.map((f) => ({
            desenlace: comoDesenlace(f.desenlace),
            msHastaDesenlace: f.msHastaDesenlace === null ? null : Number(f.msHastaDesenlace),
        }));
    });
}
