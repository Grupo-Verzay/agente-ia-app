import { db } from "@/lib/db";
import {
    comoDiasDeGracia,
    comoDiasDeLicencia,
    comoEstadoDeCobro,
    configPorDefecto,
    HITOS,
    MENSAJES_POR_DEFECTO,
    RECORDATORIOS_POR_DEFECTO,
    siguienteVencimiento,
    type CicloDeCobro,
    type Cobro,
    type CobroConAdjuntos,
    type ConfigDeCobros,
    type EstadoDeCobro,
    type Hito,
} from "@/lib/cobros";
import { TIPOS_DE_ADJUNTO, type TipoDeAdjunto } from "@/lib/adjuntos-de-tarea-tipos";

/**
 * Las cuatro tablas de Cobros, y cómo se leen.
 *
 * ## Por qué tablas nuestras
 *
 * Las migraciones son del BACKEND (`docs/db-migrations-ownership.md`), así que
 * van como `flows`, `task_attachments` y `tickets_de_soporte`: **tablas de la
 * App, creadas por la App** con `CREATE TABLE IF NOT EXISTS` y sin ninguna
 * clave foránea.
 *
 * Y **`UserBilling` no se toca**, ni para leer ni para escribir. Esa fila es el
 * cobro de la PLATAFORMA —la licencia que Verzay le cobra a la cuenta— y esto
 * es la cartera de esa cuenta con SUS clientes. Meter las dos en la misma tabla
 * sería que confirmarle un pago a un cliente de internet moviera el vencimiento
 * de la licencia de la App.
 *
 * ## El id es TEXTO
 *
 * `uuid` y no autoincremento: un entero correlativo le diría a cada cuenta
 * cuántas deudas lleva registradas la plataforma entera.
 */

export { TOPE_DE_ADJUNTOS_POR_TAREA as TOPE_DE_ADJUNTOS_POR_COBRO } from "@/lib/adjuntos-de-tarea-tipos";

let tablasListas: Promise<void> | null = null;

function asegurarLasTablas(): Promise<void> {
    tablasListas ??= (async () => {
        await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "cobros" (
        "id" TEXT PRIMARY KEY,
        -- La CUENTA dueña de la cartera, no la persona: la deuda es de la
        -- cuenta y la ven todos los suyos.
        "ownerId" TEXT NOT NULL,
        "creadoPorId" TEXT NOT NULL,
        "contactoNombre" TEXT NOT NULL,
        -- Solo digitos. El jid se arma al enviar, con la misma funcion que usa
        -- el resto de la App.
        "contactoTelefono" TEXT NOT NULL,
        -- El jid de un lead que ya escribio, cuando la deuda se creo eligiendo
        -- de la lista en vez de tecleando el numero.
        "contactoJid" TEXT,
        "concepto" TEXT NOT NULL DEFAULT '',
        "monto" NUMERIC(18,2),
        "moneda" TEXT NOT NULL DEFAULT 'COP',
        "vence" TIMESTAMP(3),
        "estado" TEXT NOT NULL DEFAULT 'pendiente',
        -- El ciclo, por FILA y no por cuenta: en la misma cartera conviven un
        -- plan mensual y uno anual, y el de gracia lo negocia cada uno.
        "diasDeLicencia" INTEGER NOT NULL DEFAULT 30,
        "diasDeGracia" INTEGER NOT NULL DEFAULT 3,
        -- El anti-spam. Llevan la fecha de vencimiento con la que se escribio,
        -- para que un pago que mueve el vencimiento abra la puerta otra vez sin
        -- esperar a manana.
        "ultimoRecordatorioEn" TIMESTAMP(3),
        "ultimoRecordatorioVence" TIMESTAMP(3),
        "ultimoHito" TEXT,
        -- La ULTIMA confirmacion. El historial entero esta en cobro_ciclos;
        -- esto es solo para la fila.
        "confirmadaEn" TIMESTAMP(3),
        "confirmadaPorId" TEXT,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
        // La pantalla entra por cuenta y ordena por vencimiento: lo que primero
        // hay que mirar es lo que esta a punto de vencer o ya vencio. Va dentro
        // del indice y no como un ordenamiento aparte.
        await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "cobros_owner_vence_idx"
      ON "cobros" ("ownerId", "vence")
    `;
        // La vuelta diaria pregunta por TODAS las cuentas a la vez: solo las
        // pendientes y solo las que tienen fecha. Sin este indice, barre.
        await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "cobros_pendientes_vence_idx"
      ON "cobros" ("vence") WHERE "estado" = 'pendiente'
    `;

        await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "cobro_adjuntos" (
        "id" TEXT PRIMARY KEY,
        "cobroId" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "nombre" TEXT NOT NULL,
        "tipo" TEXT NOT NULL,
        "mimeType" TEXT,
        "tamanoBytes" BIGINT,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
        await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "cobro_adjuntos_cobro_idx"
      ON "cobro_adjuntos" ("cobroId")
    `;

        // El historial de ciclos pagados. Es lo unico que recuerda que este
        // cliente lleva ocho meses pagando: la fila de `cobros` solo guarda el
        // ciclo EN CURSO, y su `vence` se pisa en cada salto.
        //
        // Se copian dentro el monto y la moneda **a proposito**: si manana se
        // le sube el precio al cliente, los ciclos ya cobrados tienen que
        // seguir diciendo lo que se cobro entonces. Leerlo de la fila daria un
        // historial que cambia solo.
        await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "cobro_ciclos" (
        "id" TEXT PRIMARY KEY,
        "cobroId" TEXT NOT NULL,
        "ownerId" TEXT NOT NULL,
        -- Que vencimiento cerro este ciclo, y a cual salto.
        "vencia" TIMESTAMP(3),
        "siguienteVence" TIMESTAMP(3) NOT NULL,
        "monto" NUMERIC(18,2),
        "moneda" TEXT NOT NULL DEFAULT 'COP',
        "diasDeLicencia" INTEGER NOT NULL,
        "confirmadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "confirmadaPorId" TEXT NOT NULL
      )
    `;
        await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "cobro_ciclos_cobro_idx"
      ON "cobro_ciclos" ("cobroId", "confirmadaEn" DESC)
    `;

        // Una fila por CUENTA: sus datos de pago, sus tres mensajes y sus dias
        // de recordatorio. Aparte de `cobros` porque es de la cartera entera,
        // no de una deuda.
        await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "cobros_config" (
        "ownerId" TEXT PRIMARY KEY,
        -- Texto libre: numero de cuenta, enlace, lo que use cada uno. El
        -- sistema no verifica nada ni habla con ninguna pasarela.
        "datosDePago" TEXT NOT NULL DEFAULT '',
        "mensajeAntes" TEXT,
        "mensajeElDia" TEXT,
        "mensajeDespues" TEXT,
        -- NULL = ese aviso no sale. No es lo mismo que 0, que seria el propio
        -- dia del vencimiento.
        "diasAntes" INTEGER DEFAULT 3,
        "avisarElDia" BOOLEAN NOT NULL DEFAULT TRUE,
        "diasDespues" INTEGER DEFAULT 3,
        "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    })().catch((error) => {
        tablasListas = null;
        throw error;
    });
    return tablasListas;
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
 * Corre algo contra las tablas, creándolas si hicieran falta. Una sola vez.
 *
 * El recuerdo de «ya las creé» es **del proceso, no de la base**: si las tablas
 * desaparecen por debajo —una restauración, un entorno recién levantado— el
 * recuerdo seguiría diciendo que existen y todas las consultas fallarían hasta
 * que alguien reiniciara el contenedor.
 */
async function conLasTablas<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLasTablas();
    try {
        return await hacer();
    } catch (error) {
        if (!faltaLaTabla(error)) throw error;
        tablasListas = null;
        await asegurarLasTablas();
        return hacer();
    }
}

/* ── De la base a la pantalla ─────────────────────────────────────────────── */

type FilaDeCobro = {
    id: string;
    ownerId: string;
    contactoNombre: string;
    contactoTelefono: string;
    contactoJid: string | null;
    concepto: string;
    monto: unknown;
    moneda: string;
    vence: Date | null;
    estado: string;
    diasDeLicencia: number;
    diasDeGracia: number;
    ultimoRecordatorioEn: Date | null;
    ultimoHito: string | null;
    confirmadaEn: Date | null;
    creadoEn: Date;
    ciclosPagados: bigint | number | null;
};

/**
 * El `monto` es un `NUMERIC` y llega como `Decimal`.
 *
 * **No viaja a un componente de cliente tal cual**: un `Decimal` de Prisma no
 * es serializable y revienta el paso de props del servidor al navegador. Se
 * pasa a número aquí, que es lo mismo que hace `getEnrichedClients` con el
 * `price`.
 */
function comoNumero(valor: unknown): number | null {
    if (valor === null || valor === undefined) return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
}

function comoHito(valor: unknown): Hito | null {
    const texto = String(valor ?? "").trim();
    return (HITOS as readonly string[]).includes(texto) ? (texto as Hito) : null;
}

function aCobro(fila: FilaDeCobro): Cobro {
    return {
        id: fila.id,
        ownerId: fila.ownerId,
        contactoNombre: fila.contactoNombre,
        contactoTelefono: fila.contactoTelefono,
        contactoJid: fila.contactoJid,
        concepto: fila.concepto,
        monto: comoNumero(fila.monto),
        moneda: fila.moneda,
        vence: fila.vence ? fila.vence.toISOString() : null,
        estado: comoEstadoDeCobro(fila.estado),
        diasDeLicencia: comoDiasDeLicencia(fila.diasDeLicencia),
        diasDeGracia: comoDiasDeGracia(fila.diasDeGracia),
        ciclosPagados: Number(fila.ciclosPagados ?? 0),
        ultimoRecordatorioEn: fila.ultimoRecordatorioEn?.toISOString() ?? null,
        ultimoHito: comoHito(fila.ultimoHito),
        confirmadaEn: fila.confirmadaEn?.toISOString() ?? null,
        creadoEn: fila.creadoEn.toISOString(),
    };
}

/* ── Leer ─────────────────────────────────────────────────────────────────── */

/**
 * La cartera de una cuenta, con sus adjuntos.
 *
 * El número de ciclos pagados sale de un `COUNT` sobre `cobro_ciclos` y **no**
 * de una columna en la fila: guardado, se desincroniza en cuanto se borre o se
 * corrija un ciclo, y entonces el historial y el contador dirían cosas
 * distintas. Es la misma regla de los contadores de Chats — *un contador es un
 * `COUNT`, no un `length`*.
 */
export async function laCarteraDe(ownerId: string): Promise<CobroConAdjuntos[]> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<FilaDeCobro[]>`
      SELECT c."id", c."ownerId", c."contactoNombre", c."contactoTelefono", c."contactoJid",
             c."concepto", c."monto", c."moneda", c."vence", c."estado",
             c."diasDeLicencia", c."diasDeGracia", c."ultimoRecordatorioEn", c."ultimoHito",
             c."confirmadaEn", c."creadoEn",
             (SELECT COUNT(*) FROM "cobro_ciclos" k WHERE k."cobroId" = c."id") AS "ciclosPagados"
      FROM "cobros" c
      WHERE c."ownerId" = ${ownerId}
      ORDER BY c."vence" ASC NULLS LAST, c."creadoEn" DESC
    `;
        if (filas.length === 0) return [];

        const adjuntos = await db.$queryRaw<
            Array<{
                id: string;
                cobroId: string;
                url: string;
                nombre: string;
                tipo: string;
                mimeType: string | null;
                tamanoBytes: bigint | null;
            }>
        >`
      SELECT a."id", a."cobroId", a."url", a."nombre", a."tipo", a."mimeType", a."tamanoBytes"
      FROM "cobro_adjuntos" a
      JOIN "cobros" c ON c."id" = a."cobroId"
      WHERE c."ownerId" = ${ownerId}
      ORDER BY a."creadoEn" ASC
    `;

        const porCobro = new Map<string, CobroConAdjuntos["adjuntos"]>();
        for (const a of adjuntos) {
            const lista = porCobro.get(a.cobroId) ?? [];
            lista.push({
                id: a.id,
                cobroId: a.cobroId,
                url: a.url,
                nombre: a.nombre,
                tipo: (TIPOS_DE_ADJUNTO as readonly string[]).includes(a.tipo) ? a.tipo : "document",
                mimeType: a.mimeType,
                tamanoBytes: a.tamanoBytes === null ? null : Number(a.tamanoBytes),
            });
            porCobro.set(a.cobroId, lista);
        }

        return filas.map((f) => ({ ...aCobro(f), adjuntos: porCobro.get(f.id) ?? [] }));
    });
}

/** El historial de ciclos de una deuda, del más reciente al más viejo. */
export async function losCiclosDe(cobroId: string, ownerId: string): Promise<CicloDeCobro[]> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<
            Array<{
                id: string;
                cobroId: string;
                vencia: Date | null;
                siguienteVence: Date;
                monto: unknown;
                moneda: string;
                confirmadaEn: Date;
                confirmadaPorId: string;
            }>
        >`
      SELECT "id", "cobroId", "vencia", "siguienteVence", "monto", "moneda",
             "confirmadaEn", "confirmadaPorId"
      FROM "cobro_ciclos"
      WHERE "cobroId" = ${cobroId} AND "ownerId" = ${ownerId}
      ORDER BY "confirmadaEn" DESC
    `;
        return filas.map((f) => ({
            id: f.id,
            cobroId: f.cobroId,
            vencia: f.vencia?.toISOString() ?? null,
            siguienteVence: f.siguienteVence.toISOString(),
            monto: comoNumero(f.monto),
            moneda: f.moneda,
            confirmadaEn: f.confirmadaEn.toISOString(),
            confirmadaPorId: f.confirmadaPorId,
        }));
    });
}

/* ── La configuración de la cuenta ────────────────────────────────────────── */

export async function laConfigDe(ownerId: string): Promise<ConfigDeCobros> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<
            Array<{
                datosDePago: string;
                mensajeAntes: string | null;
                mensajeElDia: string | null;
                mensajeDespues: string | null;
                diasAntes: number | null;
                avisarElDia: boolean;
                diasDespues: number | null;
            }>
        >`
      SELECT "datosDePago", "mensajeAntes", "mensajeElDia", "mensajeDespues",
             "diasAntes", "avisarElDia", "diasDespues"
      FROM "cobros_config" WHERE "ownerId" = ${ownerId}
    `;
        const fila = filas[0];
        if (!fila) return configPorDefecto(ownerId);

        // Un mensaje vacío cae al de siempre: una cuenta que borró el texto sin
        // querer mandaría un WhatsApp EN BLANCO, y eso no se recoge.
        return {
            ownerId,
            datosDePago: fila.datosDePago ?? "",
            mensajes: {
                antes: fila.mensajeAntes?.trim() || MENSAJES_POR_DEFECTO.antes,
                elDia: fila.mensajeElDia?.trim() || MENSAJES_POR_DEFECTO.elDia,
                despues: fila.mensajeDespues?.trim() || MENSAJES_POR_DEFECTO.despues,
            },
            recordatorios: {
                diasAntes: fila.diasAntes === null ? null : Math.max(1, Math.trunc(fila.diasAntes)),
                elDia: fila.avisarElDia !== false,
                diasDespues:
                    fila.diasDespues === null ? null : Math.max(1, Math.trunc(fila.diasDespues)),
            },
        };
    });
}

export async function guardarLaConfig(config: ConfigDeCobros): Promise<void> {
    await conLasTablas(async () => {
        await db.$executeRaw`
      INSERT INTO "cobros_config"
        ("ownerId", "datosDePago", "mensajeAntes", "mensajeElDia", "mensajeDespues",
         "diasAntes", "avisarElDia", "diasDespues", "actualizadoEn")
      VALUES (
        ${config.ownerId}, ${config.datosDePago},
        ${config.mensajes.antes}, ${config.mensajes.elDia}, ${config.mensajes.despues},
        ${config.recordatorios.diasAntes}, ${config.recordatorios.elDia},
        ${config.recordatorios.diasDespues}, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("ownerId") DO UPDATE SET
        "datosDePago" = EXCLUDED."datosDePago",
        "mensajeAntes" = EXCLUDED."mensajeAntes",
        "mensajeElDia" = EXCLUDED."mensajeElDia",
        "mensajeDespues" = EXCLUDED."mensajeDespues",
        "diasAntes" = EXCLUDED."diasAntes",
        "avisarElDia" = EXCLUDED."avisarElDia",
        "diasDespues" = EXCLUDED."diasDespues",
        "actualizadoEn" = CURRENT_TIMESTAMP
    `;
    });
}

/* ── Escribir ─────────────────────────────────────────────────────────────── */

export type NuevoCobro = {
    id: string;
    ownerId: string;
    creadoPorId: string;
    contactoNombre: string;
    contactoTelefono: string;
    contactoJid: string | null;
    concepto: string;
    monto: number | null;
    moneda: string;
    vence: Date | null;
    diasDeLicencia: number;
    diasDeGracia: number;
    adjuntos: Array<{
        id: string;
        url: string;
        nombre: string;
        tipo: TipoDeAdjunto;
        mimeType: string | null;
        tamanoBytes: number | null;
    }>;
};

export async function crearElCobro(nuevo: NuevoCobro): Promise<void> {
    await conLasTablas(async () => {
        // La deuda y su cuenta de cobro, **en la misma transacción**. Si el
        // adjunto se quedara fuera, la fila diría «mira la factura» sin
        // factura, y quien la subió no tiene forma de volver a engancharla.
        await db.$transaction(async (tx) => {
            await tx.$executeRaw`
        INSERT INTO "cobros"
          ("id", "ownerId", "creadoPorId", "contactoNombre", "contactoTelefono", "contactoJid",
           "concepto", "monto", "moneda", "vence", "estado", "diasDeLicencia", "diasDeGracia")
        VALUES (
          ${nuevo.id}, ${nuevo.ownerId}, ${nuevo.creadoPorId}, ${nuevo.contactoNombre},
          ${nuevo.contactoTelefono}, ${nuevo.contactoJid}, ${nuevo.concepto},
          ${nuevo.monto}, ${nuevo.moneda}, ${nuevo.vence}, 'pendiente',
          ${comoDiasDeLicencia(nuevo.diasDeLicencia)}, ${comoDiasDeGracia(nuevo.diasDeGracia)}
        )
      `;
            for (const a of nuevo.adjuntos) {
                await tx.$executeRaw`
          INSERT INTO "cobro_adjuntos"
            ("id", "cobroId", "url", "nombre", "tipo", "mimeType", "tamanoBytes")
          VALUES (${a.id}, ${nuevo.id}, ${a.url}, ${a.nombre}, ${a.tipo}, ${a.mimeType},
                  ${a.tamanoBytes})
        `;
            }
        });
    });
}

export async function editarElCobro(input: {
    id: string;
    ownerId: string;
    contactoNombre: string;
    contactoTelefono: string;
    concepto: string;
    monto: number | null;
    moneda: string;
    vence: Date | null;
    diasDeLicencia: number;
    diasDeGracia: number;
}): Promise<boolean> {
    return conLasTablas(async () => {
        const tocadas = await db.$executeRaw`
      UPDATE "cobros" SET
        "contactoNombre" = ${input.contactoNombre},
        "contactoTelefono" = ${input.contactoTelefono},
        "concepto" = ${input.concepto},
        "monto" = ${input.monto},
        "moneda" = ${input.moneda},
        "vence" = ${input.vence},
        "diasDeLicencia" = ${comoDiasDeLicencia(input.diasDeLicencia)},
        "diasDeGracia" = ${comoDiasDeGracia(input.diasDeGracia)},
        "actualizadoEn" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.id} AND "ownerId" = ${input.ownerId}
    `;
        return tocadas > 0;
    });
}

/**
 * Cambia el estado, **solo si sigue en el que se creía**.
 *
 * El `AND "estado" = ${antes}` no es de adorno: dos personas de la misma cuenta
 * mirando la misma lista pueden marcar la misma deuda a la vez. Devuelve si se
 * tocó fila de verdad, y quien llama solo actúa cuando fue que sí — la misma
 * garantía que hace que un ticket resuelto mande un WhatsApp y no dos.
 */
export async function moverElEstado(input: {
    id: string;
    ownerId: string;
    antes: EstadoDeCobro;
    despues: EstadoDeCobro;
}): Promise<boolean> {
    return conLasTablas(async () => {
        const tocadas = await db.$executeRaw`
      UPDATE "cobros"
      SET "estado" = ${input.despues}, "actualizadoEn" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.id} AND "ownerId" = ${input.ownerId} AND "estado" = ${input.antes}
    `;
        return tocadas > 0;
    });
}

/** Lo que devuelve una confirmación que sí tocó fila. */
export type CicloCerrado = {
    vencia: Date | null;
    siguienteVence: Date;
};

/**
 * Confirmar un pago: cierra el ciclo y abre el siguiente, **en una transacción**.
 *
 * Son tres escrituras y las tres tienen que ir juntas, porque a medias cada
 * pareja miente:
 *
 * 1. Se anota el ciclo en `cobro_ciclos` —el historial, que no se pisa nunca—.
 * 2. El vencimiento **salta** los días de licencia de ESA fila.
 * 3. La fila vuelve a `pendiente` y **se le borran las marcas de recordatorio**,
 *    o el anti-spam del ciclo viejo se comería el primer aviso del nuevo.
 *
 * Sin la 1, se pierde que este cliente lleva ocho meses pagando. Sin la 3, el
 * ciclo nuevo arranca mudo.
 *
 * ## Por qué la guarda es el VENCIMIENTO y no el estado
 *
 * Es la trampa de que el cobro sea recurrente, y costó una vuelta del banco:
 * confirmar **devuelve la fila a `pendiente`**, así que el estado no distingue
 * un ciclo del siguiente. Con `AND "estado" = 'pendiente'` a secas, dos
 * confirmaciones a la vez pasaban **las dos** —la segunda se quedaba esperando
 * en el `FOR UPDATE`, y al despertar encontraba la fila otra vez en
 * `pendiente`—, y el vencimiento saltaba 60 días en vez de 30. Medido: le
 * regalaba un mes al cliente por un doble clic.
 *
 * Lo que sí identifica un ciclo es **la fecha que se está cerrando**. Quien
 * confirma dice qué vencimiento vio; si la fila ya no lo tiene, es que alguien
 * se le adelantó y esta no toca nada. Vale también para una deuda sin fecha:
 * después de la primera confirmación ya tiene una, así que la segunda —que
 * esperaba `null`— no encaja.
 *
 * Esa fecha **solo se usa para comparar**, nunca se escribe: una lista que
 * llega de fuera no puede decidir a qué día salta el ciclo.
 *
 * Devuelve `null` cuando no tocó fila, que es lo que dice «alguien se te
 * adelantó».
 */
export async function confirmarElPago(input: {
    id: string;
    ownerId: string;
    antes: EstadoDeCobro;
    /** El vencimiento que tenía la fila cuando se pulsó. Es la llave del ciclo. */
    venceQueSeVio: Date | null;
    confirmadaPorId: string;
    cicloId: string;
    ahora: Date;
}): Promise<CicloCerrado | null> {
    return conLasTablas(async () => {
        return db.$transaction(async (tx) => {
            const filas = await tx.$queryRaw<
                Array<{
                    vence: Date | null;
                    monto: unknown;
                    moneda: string;
                    diasDeLicencia: number;
                }>
            >`
        SELECT "vence", "monto", "moneda", "diasDeLicencia"
        FROM "cobros"
        WHERE "id" = ${input.id}
          AND "ownerId" = ${input.ownerId}
          AND "estado" = ${input.antes}
          AND "vence" IS NOT DISTINCT FROM ${input.venceQueSeVio}
        FOR UPDATE
      `;
            const fila = filas[0];
            if (!fila) return null;

            const vencia = fila.vence;
            const dias = comoDiasDeLicencia(fila.diasDeLicencia);
            const siguiente = siguienteVencimiento(vencia, dias, input.ahora);

            await tx.$executeRaw`
        INSERT INTO "cobro_ciclos"
          ("id", "cobroId", "ownerId", "vencia", "siguienteVence", "monto", "moneda",
           "diasDeLicencia", "confirmadaEn", "confirmadaPorId")
        VALUES (
          ${input.cicloId}, ${input.id}, ${input.ownerId}, ${vencia}, ${siguiente},
          ${fila.monto === null ? null : Number(fila.monto)}, ${fila.moneda}, ${dias},
          ${input.ahora}, ${input.confirmadaPorId}
        )
      `;

            await tx.$executeRaw`
        UPDATE "cobros" SET
          "vence" = ${siguiente},
          "estado" = 'pendiente',
          "confirmadaEn" = ${input.ahora},
          "confirmadaPorId" = ${input.confirmadaPorId},
          "ultimoRecordatorioEn" = NULL,
          "ultimoRecordatorioVence" = NULL,
          "ultimoHito" = NULL,
          "actualizadoEn" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.id}
          AND "ownerId" = ${input.ownerId}
          AND "vence" IS NOT DISTINCT FROM ${input.venceQueSeVio}
      `;

            return { vencia, siguienteVence: siguiente };
        });
    });
}

/**
 * Borrar una deuda se lleva sus adjuntos y su historial.
 *
 * Sin clave foránea la limpieza es **explícita**: si no, quedan ciclos
 * huérfanos que nadie va a mirar y que engordan la tabla para siempre. Es lo
 * mismo que hace `olvidarElHiloDe` al borrar una tarea.
 */
export async function borrarElCobro(id: string, ownerId: string): Promise<boolean> {
    return conLasTablas(async () => {
        return db.$transaction(async (tx) => {
            const tocadas = await tx.$executeRaw`
        DELETE FROM "cobros" WHERE "id" = ${id} AND "ownerId" = ${ownerId}
      `;
            if (tocadas === 0) return false;
            await tx.$executeRaw`DELETE FROM "cobro_adjuntos" WHERE "cobroId" = ${id}`;
            await tx.$executeRaw`DELETE FROM "cobro_ciclos" WHERE "cobroId" = ${id}`;
            return true;
        });
    });
}

/* ── Adjuntos ─────────────────────────────────────────────────────────────── */

export async function adjuntarAlCobro(input: {
    id: string;
    cobroId: string;
    ownerId: string;
    url: string;
    nombre: string;
    tipo: TipoDeAdjunto;
    mimeType: string | null;
    tamanoBytes: number | null;
}): Promise<boolean> {
    return conLasTablas(async () => {
        // Se comprueba que la deuda sea de esa cuenta DENTRO del `INSERT`: con
        // dos consultas, entre la comprobación y la escritura cabe otra cosa.
        const escritas = await db.$executeRaw`
      INSERT INTO "cobro_adjuntos" ("id", "cobroId", "url", "nombre", "tipo", "mimeType", "tamanoBytes")
      SELECT ${input.id}, ${input.cobroId}, ${input.url}, ${input.nombre}, ${input.tipo},
             ${input.mimeType}, ${input.tamanoBytes}
      WHERE EXISTS (
        SELECT 1 FROM "cobros" WHERE "id" = ${input.cobroId} AND "ownerId" = ${input.ownerId}
      )
    `;
        return escritas > 0;
    });
}

export async function quitarAdjuntoDelCobro(id: string, ownerId: string): Promise<boolean> {
    return conLasTablas(async () => {
        const tocadas = await db.$executeRaw`
      DELETE FROM "cobro_adjuntos" a
      USING "cobros" c
      WHERE a."id" = ${id} AND c."id" = a."cobroId" AND c."ownerId" = ${ownerId}
    `;
        return tocadas > 0;
    });
}

/* ── Lo que necesita la vuelta diaria ─────────────────────────────────────── */

export type CobroDelRunner = {
    id: string;
    ownerId: string;
    contactoNombre: string;
    contactoTelefono: string;
    contactoJid: string | null;
    concepto: string;
    monto: number | null;
    moneda: string;
    vence: Date | null;
    estado: EstadoDeCobro;
    ultimoRecordatorioEn: Date | null;
    ultimoRecordatorioVence: Date | null;
};

/**
 * Las deudas que HOY podrían tocar, de todas las cuentas.
 *
 * Se acota en la consulta y no al recorrer: la ventana es «entre el aviso más
 * lejano que se pueda configurar y el más tardío», así que una cartera de miles
 * de filas al día no se trae entera. `RANGO_DE_DIAS` cubre de sobra los tres
 * hitos configurables; quien decide de verdad es `tocaRecordatorio`, que es
 * puro y está probado.
 */
const RANGO_DE_DIAS = 400;

export async function losCobrosQuePodrianTocarHoy(): Promise<CobroDelRunner[]> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<
            Array<Omit<CobroDelRunner, "estado" | "monto"> & { estado: string; monto: unknown }>
        >`
      SELECT "id", "ownerId", "contactoNombre", "contactoTelefono", "contactoJid",
             "concepto", "monto", "moneda", "vence", "estado",
             "ultimoRecordatorioEn", "ultimoRecordatorioVence"
      FROM "cobros"
      WHERE "estado" = 'pendiente'
        AND "vence" IS NOT NULL
        AND "vence" BETWEEN NOW() - make_interval(days => ${RANGO_DE_DIAS}::int)
                        AND NOW() + make_interval(days => ${RANGO_DE_DIAS}::int)
    `;
        return filas.map((f) => ({
            ...f,
            estado: comoEstadoDeCobro(f.estado),
            monto: comoNumero(f.monto),
        }));
    });
}

/** Deja constancia de que hoy ya se le escribió a esta deuda, por este ciclo. */
export async function anotarElRecordatorio(input: {
    id: string;
    hito: Hito;
    vence: Date;
    ahora: Date;
}): Promise<void> {
    await conLasTablas(async () => {
        await db.$executeRaw`
      UPDATE "cobros" SET
        "ultimoRecordatorioEn" = ${input.ahora},
        "ultimoRecordatorioVence" = ${input.vence},
        "ultimoHito" = ${input.hito}
      WHERE "id" = ${input.id}
    `;
    });
}

/** Las configuraciones de un puñado de cuentas, para no pedirlas una a una. */
export async function lasConfigsDe(ownerIds: string[]): Promise<Map<string, ConfigDeCobros>> {
    const mapa = new Map<string, ConfigDeCobros>();
    if (ownerIds.length === 0) return mapa;

    return conLasTablas(async () => {
        const filas = await db.$queryRaw<
            Array<{
                ownerId: string;
                datosDePago: string;
                mensajeAntes: string | null;
                mensajeElDia: string | null;
                mensajeDespues: string | null;
                diasAntes: number | null;
                avisarElDia: boolean;
                diasDespues: number | null;
            }>
        >`
      SELECT "ownerId", "datosDePago", "mensajeAntes", "mensajeElDia", "mensajeDespues",
             "diasAntes", "avisarElDia", "diasDespues"
      FROM "cobros_config"
      WHERE "ownerId" = ANY(${ownerIds}::text[])
    `;
        for (const id of ownerIds) mapa.set(id, configPorDefecto(id));
        for (const f of filas) {
            mapa.set(f.ownerId, {
                ownerId: f.ownerId,
                datosDePago: f.datosDePago ?? "",
                mensajes: {
                    antes: f.mensajeAntes?.trim() || MENSAJES_POR_DEFECTO.antes,
                    elDia: f.mensajeElDia?.trim() || MENSAJES_POR_DEFECTO.elDia,
                    despues: f.mensajeDespues?.trim() || MENSAJES_POR_DEFECTO.despues,
                },
                recordatorios: {
                    diasAntes: f.diasAntes === null ? null : Math.max(1, Math.trunc(f.diasAntes)),
                    elDia: f.avisarElDia !== false,
                    diasDespues:
                        f.diasDespues === null ? null : Math.max(1, Math.trunc(f.diasDespues)),
                },
            });
        }
        return mapa;
    });
}

export { RECORDATORIOS_POR_DEFECTO };
