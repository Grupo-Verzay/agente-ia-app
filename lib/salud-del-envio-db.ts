import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import {
    comoMotivo,
    comoProveedor,
    comoTipoDeEnvio,
    type EnvioAutomatico,
    type Proveedor,
    type TipoDeEnvio,
} from "@/lib/salud-del-envio";

/**
 * `envios_automaticos`: la constancia de cada envío que sale solo.
 *
 * ## Por qué una tabla nuestra
 *
 * Las migraciones son del BACKEND (`docs/db-migrations-ownership.md`), así que
 * va como `flows`, `task_comments`, `cobros` y `tickets_de_soporte`: **tabla de
 * la App**, con `CREATE TABLE IF NOT EXISTS` y **sin clave foránea**. La cuenta
 * a la que se le atribuye un envío puede eliminarse —una cuenta morosa se borra
 * al mes— y el registro de que se le escribió tiene que sobrevivir a eso; es la
 * misma razón por la que `renovaciones_mensuales` copia el nombre dentro en vez
 * de apuntar a la fila.
 *
 * ## Lo que NO se guarda
 *
 * **El texto del mensaje no.** Lleva dentro datos del cliente —su deuda, su
 * número, su nombre— y esta pantalla la abre quien administra la plataforma,
 * no su dueño. Para saber si el envío funciona basta con saber si salió y por
 * qué no; leer lo que se le escribió a un cliente es otra cosa y no hace falta
 * para esto.
 *
 * ## Y no crece sin freno
 *
 * Se borra lo de más de `DIAS_QUE_SE_GUARDAN` en la misma vuelta que escribe,
 * y muy de vez en cuando (ver `podarSiTocaFuera`). Sin poda, una plataforma con
 * cincuenta cuentas y sus recordatorios diarios mete decenas de miles de filas
 * al año en una tabla que solo se mira en ventanas de días.
 */

/** Cuánto se conserva. Lo que se mira son días, no meses. */
export const DIAS_QUE_SE_GUARDAN = 30;

/** El tope de filas que devuelve la pantalla de una vez. */
export const TOPE_DE_LA_LISTA = 500;

let tablaLista: Promise<void> | null = null;

function asegurarLaTabla(): Promise<void> {
    tablaLista ??= (async () => {
        await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "envios_automaticos" (
        "id" TEXT PRIMARY KEY,
        -- De los de la lista cerrada de lib/salud-del-envio.ts. Lo que llegue
        -- fuera de ella se descarta al leer y sale como una fila rara, no rompe
        -- la pantalla.
        "tipo" TEXT NOT NULL,
        -- evolution | waha | meta | ninguno. El ultimo es el envio que no llego
        -- ni al despachador porque la cuenta no tiene linea conectada.
        "proveedor" TEXT NOT NULL,
        -- La CUENTA a la que se le atribuye, no la persona: estos envios no los
        -- firma nadie, salen solos. Puede ser nula (la vigilancia es de la
        -- plataforma, no de una cuenta).
        "cuentaId" TEXT,
        "linea" TEXT,
        "destinatario" TEXT,
        "salio" BOOLEAN NOT NULL,
        -- Por que fallo. En un envio bueno es NULL, nunca "ok": "no se sabe" y
        -- "no hubo motivo" tienen que poder distinguirse.
        "motivo" TEXT,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT NOW()
      )
    `;

        // La pantalla siempre acota por fecha y ordena por fecha: ese es el
        // indice que hace falta. Los filtros de proveedor y cuenta se aplican
        // encima, sobre una ventana ya corta.
        await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "envios_automaticos_creado_idx"
      ON "envios_automaticos" ("creadoEn" DESC)
    `;
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
    // por el de arriba es lo que dejó el reintento de `task_comments` sin
    // dispararse nunca. Se miran los dos sitios, y el texto.
    const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
    if (e?.code === "42P01" || e?.meta?.code === "42P01") return true;
    return String(e?.message ?? "").includes("42P01");
}

/**
 * Corre algo contra la tabla, creándola si hiciera falta. Una sola vez.
 *
 * El recuerdo de «ya la creé» es **del proceso, no de la base**: si la tabla
 * desaparece por debajo —una restauración, un entorno recién levantado— el
 * recuerdo seguiría diciendo que existe y todas las consultas fallarían hasta
 * que alguien reiniciara el contenedor.
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

/* ── Escribir ─────────────────────────────────────────────────────────────── */

export type ElEnvioQueSeAnota = {
    tipo: TipoDeEnvio;
    proveedor: Proveedor;
    cuentaId?: string | null;
    linea?: string | null;
    destinatario?: string | null;
    salio: boolean;
    motivo?: string | null;
};

/**
 * Anotar un envío. **Nunca lanza, y nunca cambia lo que pasó.**
 *
 * Es la regla entera de esta parte: el mensaje o salió o no salió **antes** de
 * llegar aquí, y eso no se puede deshacer. Si la base no contesta, lo que se
 * pierde es una fila de un registro; devolver un fallo desde aquí haría que un
 * cobro que SÍ salió se contara como fallido y el cliente recibiera el mismo
 * recordatorio mañana. Es la misma decisión que ya tomaron `crearLosAvisos` y
 * `mandarLosAdjuntos`.
 *
 * Y **tampoco es mudo**: un registro que deja de escribirse en silencio se lee
 * como «la plataforma no manda nada», que es exactamente el fallo que esta
 * pantalla existe para no volver a tener.
 */
export async function anotarElEnvio(entrada: ElEnvioQueSeAnota): Promise<void> {
    try {
        await conLaTabla(async () => {
            await db.$executeRaw`
        INSERT INTO "envios_automaticos"
          ("id", "tipo", "proveedor", "cuentaId", "linea", "destinatario", "salio", "motivo")
        VALUES (
          ${randomUUID()},
          ${entrada.tipo},
          ${entrada.proveedor},
          ${entrada.cuentaId?.trim() || null},
          ${entrada.linea?.trim() || null},
          ${entrada.destinatario?.trim() || null},
          ${entrada.salio},
          ${entrada.salio ? null : comoMotivo(entrada.motivo)}
        )
      `;
        });
        await podarSiTocaFuera();
    } catch (error) {
        console.warn("[salud-envio] no se pudo anotar un envio", {
            tipo: entrada.tipo,
            proveedor: entrada.proveedor,
            salio: entrada.salio,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/**
 * La poda, y por qué no corre en cada envío.
 *
 * Un `DELETE` con su `WHERE` por fecha en **cada** mensaje de la plataforma es
 * una consulta de más por envío para borrar, casi siempre, cero filas. Se tira
 * el dado: una de cada cien vueltas. Con el volumen que tiene esto —decenas de
 * envíos al día— eso es varias podas a la semana, de sobra para una ventana de
 * treinta días, y sin pagar nada las otras noventa y nueve veces.
 *
 * Va dentro de su propio `try`: la poda nunca puede tumbar lo que se acaba de
 * anotar, que es el dato que importa.
 */
async function podarSiTocaFuera(): Promise<void> {
    if (Math.random() >= 0.01) return;
    try {
        await db.$executeRaw`
      DELETE FROM "envios_automaticos"
      WHERE "creadoEn" < NOW() - make_interval(days => ${DIAS_QUE_SE_GUARDAN}::int)
    `;
    } catch (error) {
        console.warn("[salud-envio] no se pudo podar el registro", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/* ── Leer ─────────────────────────────────────────────────────────────────── */

type FilaDeEnvio = {
    id: string;
    tipo: string;
    proveedor: string;
    cuentaId: string | null;
    cuentaNombre: string | null;
    linea: string | null;
    destinatario: string | null;
    salio: boolean;
    motivo: string | null;
    creadoEn: Date;
};

export type FiltrosDeEnvios = {
    dias: number;
    proveedor?: Proveedor | null;
    cuentaId?: string | null;
    /** `todos` no filtra nada; los otros dos sí. */
    estado?: "todos" | "salio" | "fallo";
};

/**
 * Los envíos de la ventana, ya emparejados con el nombre de su cuenta.
 *
 * El nombre se resuelve con un `LEFT JOIN`, **no con un `IN` aparte**: la
 * cuenta puede haberse eliminado —no hay clave foránea, a propósito— y un
 * `JOIN` normal la borraría de la lista justo cuando más interesa saber que se
 * le estuvo escribiendo. Sin fila, `cuentaNombre` sale `null` y la pantalla
 * enseña el id.
 */
export async function losEnviosRecientes(
    filtros: FiltrosDeEnvios,
): Promise<EnvioAutomatico[]> {
    const dias = Math.max(1, Math.min(Math.trunc(filtros.dias) || 7, DIAS_QUE_SE_GUARDAN));

    const condiciones: Prisma.Sql[] = [
        Prisma.sql`e."creadoEn" >= NOW() - make_interval(days => ${dias}::int)`,
    ];
    if (filtros.proveedor) {
        condiciones.push(Prisma.sql`e."proveedor" = ${filtros.proveedor}`);
    }
    if (filtros.cuentaId?.trim()) {
        condiciones.push(Prisma.sql`e."cuentaId" = ${filtros.cuentaId.trim()}`);
    }
    if (filtros.estado === "salio") condiciones.push(Prisma.sql`e."salio" = TRUE`);
    if (filtros.estado === "fallo") condiciones.push(Prisma.sql`e."salio" = FALSE`);

    const filas = await conLaTabla(() =>
        db.$queryRaw<FilaDeEnvio[]>`
      SELECT
        e."id",
        e."tipo",
        e."proveedor",
        e."cuentaId",
        COALESCE(NULLIF(TRIM(u."name"), ''), u."email") AS "cuentaNombre",
        e."linea",
        e."destinatario",
        e."salio",
        e."motivo",
        e."creadoEn"
      FROM "envios_automaticos" e
      LEFT JOIN "User" u ON u."id" = e."cuentaId"
      WHERE ${Prisma.join(condiciones, " AND ")}
      ORDER BY e."creadoEn" DESC
      LIMIT ${TOPE_DE_LA_LISTA}
    `,
    );

    return filas.flatMap((f) => {
        // Se vuelve a filtrar al LEER, no solo al escribir: una fila con un tipo
        // o un proveedor que no está en la lista —a mano, o de antes de que la
        // lista existiera— saldría como una columna que nadie sabe de dónde
        // salió. Se descarta y se dice, en vez de romper la pantalla.
        const tipo = comoTipoDeEnvio(f.tipo);
        const proveedor = comoProveedor(f.proveedor);
        if (!tipo || !proveedor) {
            console.warn("[salud-envio] una fila con tipo o proveedor desconocido", {
                id: f.id,
                tipo: f.tipo,
                proveedor: f.proveedor,
            });
            return [];
        }
        return [
            {
                id: f.id,
                tipo,
                proveedor,
                cuentaId: f.cuentaId,
                cuentaNombre: f.cuentaNombre,
                linea: f.linea,
                destinatario: f.destinatario,
                salio: f.salio,
                motivo: f.motivo,
                creadoEn: f.creadoEn,
            },
        ];
    });
}

/**
 * Las cuentas que aparecen en la ventana, para llenar el desplegable.
 *
 * Sale del propio registro y **no de `User`**: el filtro tiene que ofrecer las
 * cuentas a las que de verdad se les escribió, no las 3.900 de la plataforma.
 * Es la misma regla que el filtro de canales de Chats — *un filtro que ofrece
 * algo tiene que poder enseñarlo*.
 */
export async function lasCuentasConEnvios(
    dias: number,
): Promise<Array<{ id: string; nombre: string | null }>> {
    const ventana = Math.max(1, Math.min(Math.trunc(dias) || 7, DIAS_QUE_SE_GUARDAN));
    const filas = await conLaTabla(() =>
        db.$queryRaw<Array<{ id: string; nombre: string | null }>>`
      SELECT DISTINCT
        e."cuentaId" AS "id",
        COALESCE(NULLIF(TRIM(u."name"), ''), u."email") AS "nombre"
      FROM "envios_automaticos" e
      LEFT JOIN "User" u ON u."id" = e."cuentaId"
      WHERE e."cuentaId" IS NOT NULL
        AND e."creadoEn" >= NOW() - make_interval(days => ${ventana}::int)
      ORDER BY "nombre" NULLS LAST
      LIMIT 300
    `,
    );
    return filas;
}
