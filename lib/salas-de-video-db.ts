import "server-only";

import { randomBytes, randomUUID } from "crypto";

import { db } from "@/lib/db";
import {
    MARGEN_EN_LA_SALA_MS,
    TOPE_DE_LA_SALA,
    TOPE_EN_LA_PUERTA,
    type EstadoEnLaSala,
    type TipoDeSenal,
} from "@/lib/sala-de-video";

/**
 * Las tres tablas de las salas de video.
 *
 * **De la App y creadas por la App**, con `CREATE TABLE IF NOT EXISTS` y sin
 * clave foránea, como `llamadas_de_voz`, `team_chat_messages` y `flows`. Ni una
 * columna nueva en `User` ni en ninguna del backend: eso es lo que reventó el
 * #360.
 *
 * Son tres y no una porque son tres cosas con vidas distintas:
 *
 * | tabla | qué guarda | cuánto vive |
 * | --- | --- | --- |
 * | `salas_de_video` | el enlace y su caducidad | días |
 * | `sala_participantes` | quién está, quién espera | la reunión |
 * | `sala_senales` | ofertas y respuestas SDP | **segundos** |
 *
 * # El buzón se vacía al leerlo, y eso no es una optimización
 *
 * `sala_senales` es un buzón: se escribe una oferta para alguien, esa persona
 * la lee **y la fila desaparece** (`DELETE ... RETURNING`, en una sola
 * sentencia). Dos motivos, y el segundo es el que manda:
 *
 * 1. Sin borrar, cada vuelta del reloj volvería a traer la misma oferta y se
 *    volvería a aplicar sobre una conexión ya negociada.
 * 2. **Un SDP lleva dentro las direcciones IP de quien lo mandó.** Es la misma
 *    razón por la que `llamadas_de_voz` vacía sus dos columnas al terminar: eso
 *    es la red de casa de alguien, y no tiene por qué quedarse guardada cuando
 *    ya no sirve para nada.
 *
 * Y el `DELETE ... RETURNING` en una sola sentencia es lo que impide que dos
 * vueltas que se solapen —una pestaña lenta, un reintento— se lleven las dos la
 * misma oferta y la apliquen dos veces.
 */

let listas: Promise<void> | null = null;

function asegurarLasTablas(): Promise<void> {
    listas ??= (async () => {
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "salas_de_video" (
                "id" TEXT PRIMARY KEY,
                "codigo" TEXT NOT NULL UNIQUE,
                "cuentaId" TEXT NOT NULL,
                "canalId" TEXT NOT NULL,
                "anfitrionId" TEXT NOT NULL,
                "anfitrionNombre" TEXT,
                "titulo" TEXT,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "expiraEn" TIMESTAMP(3) NOT NULL,
                "revocadaEn" TIMESTAMP(3)
            )
        `;
        // Por donde entra el enlace público. Es la consulta de la primera
        // pantalla que ve alguien de fuera, así que va por índice y no por
        // barrido: el código es único, pero el índice lo pone la restricción.
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "salas_de_video_canal_idx"
            ON "salas_de_video" ("canalId", "creadoEn")
        `;

        // Quién está y quién espera.
        //
        // `personaId` va nulo para quien entra de fuera, y `invitadoToken` va
        // nulo para quien tiene cuenta: son las dos formas de ser alguien aquí
        // dentro, y separarlas en dos columnas es lo que permite saber cuál es
        // cuál. Metidas en una sola, un id de persona y un token serían el
        // mismo campo y no habría forma de distinguir a un invitado de un
        // miembro del equipo — que es justo lo que decide si pasa por la sala
        // de espera.
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "sala_participantes" (
                "id" TEXT PRIMARY KEY,
                "salaId" TEXT NOT NULL,
                "personaId" TEXT,
                "invitadoToken" TEXT,
                "nombre" TEXT NOT NULL,
                "esInvitado" BOOLEAN NOT NULL DEFAULT false,
                "estado" TEXT NOT NULL DEFAULT 'esperando',
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "entradoEn" TIMESTAMP(3),
                "vistoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "salidoEn" TIMESTAMP(3)
            )
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "sala_participantes_sala_idx"
            ON "sala_participantes" ("salaId", "estado")
        `;
        // Qué está mandando cada uno, para poder pintarlo en su recuadro.
        //
        // Viaja por AQUÍ y no por WebRTC porque **no se puede sacar de la
        // conexión**: callarse es `enabled = false` en la pista, y eso la otra
        // punta no lo ve — sigue recibiendo la pista, con silencio dentro. Lo
        // único que sí se nota es la cámara (la pista se queda en `muted`), y
        // eso la pantalla lo usa aparte, para decidir al instante si pinta el
        // video o las iniciales.
        //
        // Van por `ALTER TABLE … ADD COLUMN IF NOT EXISTS` y no reescribiendo
        // el `CREATE`: un `CREATE TABLE IF NOT EXISTS` no toca una tabla que ya
        // está, que es el fallo que se comete solo al añadirle una columna a
        // una tabla de la App ya desplegada.
        await db.$executeRaw`
            ALTER TABLE "sala_participantes"
            ADD COLUMN IF NOT EXISTS "micEncendido" BOOLEAN NOT NULL DEFAULT true
        `;
        await db.$executeRaw`
            ALTER TABLE "sala_participantes"
            ADD COLUMN IF NOT EXISTS "camaraEncendida" BOOLEAN NOT NULL DEFAULT false
        `;
        await db.$executeRaw`
            ALTER TABLE "sala_participantes"
            ADD COLUMN IF NOT EXISTS "compartiendo" BOOLEAN NOT NULL DEFAULT false
        `;
        // El token es la credencial de quien no tiene cuenta, así que se busca
        // por él en cada vuelta de su reloj. Único, además: es lo que impide
        // que dos filas puedan responder al mismo token.
        await db.$executeRaw`
            CREATE UNIQUE INDEX IF NOT EXISTS "sala_participantes_token_idx"
            ON "sala_participantes" ("invitadoToken")
            WHERE "invitadoToken" IS NOT NULL
        `;
        // Una persona con cuenta es UNA fila por sala, pase lo que pase.
        //
        // Sin esto, recargar la pestaña dejaría una fila nueva por cada
        // recarga: la sala se vería llena de recuadros negros de la misma
        // persona y el tope de cuatro se agotaría sin que hubiera entrado
        // nadie más.
        await db.$executeRaw`
            CREATE UNIQUE INDEX IF NOT EXISTS "sala_participantes_persona_idx"
            ON "sala_participantes" ("salaId", "personaId")
            WHERE "personaId" IS NOT NULL
        `;

        // El buzón. Ver la cabecera: se vacía al leerlo.
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "sala_senales" (
                "id" TEXT PRIMARY KEY,
                "salaId" TEXT NOT NULL,
                "deId" TEXT NOT NULL,
                "paraId" TEXT NOT NULL,
                "tipo" TEXT NOT NULL,
                "sdp" TEXT NOT NULL,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "sala_senales_para_idx"
            ON "sala_senales" ("paraId", "creadoEn")
        `;
    })().catch((e) => {
        listas = null;
        throw e;
    });
    return listas;
}

/**
 * El `42P01` de Prisma **no está donde parece**: en una consulta en crudo el
 * `code` de primer nivel es el de Prisma (`P2010`) y el de Postgres viaja
 * dentro, en `meta.code`. Se miran los dos sitios y el texto.
 */
function faltaLaTabla(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
    if (e.code === "42P01" || e.meta?.code === "42P01") return true;
    return typeof e.message === "string" && e.message.includes("42P01");
}

/**
 * El recuerdo de «ya las creé» es **del proceso, no de la base**: si las tablas
 * desaparecen por debajo, todas las consultas fallarían hasta reiniciar. Ante
 * un `42P01` se olvida, se crean y se reintenta **una** vez.
 */
async function conLasTablas<T>(consulta: () => Promise<T>): Promise<T> {
    await asegurarLasTablas();
    try {
        return await consulta();
    } catch (error) {
        if (!faltaLaTabla(error)) throw error;
        listas = null;
        await asegurarLasTablas();
        return consulta();
    }
}

/**
 * El candado de una sala: serializa TODO lo que decide si cabe alguien más.
 *
 * Es la pieza que hace que el tope de cuatro sea de verdad, y costó una vuelta
 * entera averiguar que hacía falta. El primer intento metía el `COUNT` dentro
 * del `WHERE` del propio `INSERT`, razonando que así lo serializaba Postgres.
 * **No lo hace**: en `READ COMMITTED` cada sentencia toma su propia foto al
 * empezar, así que ocho entradas simultáneas ven las ocho la misma sala medio
 * vacía y entran seis. Medido en el banco, exactamente eso: **seis de ocho**.
 *
 * Con el candado sobre la fila de la sala, las entradas de ESA sala se ponen en
 * fila india y las de las demás ni se rozan — es una fila por reunión, no un
 * candado global.
 *
 * Y no es un lujo: colar a un quinto en una malla que aguanta cuatro **corta la
 * reunión para todos**, no solo para el que sobra. Ver la tabla de subida en
 * `lib/sala-de-video.ts`.
 */
async function candadoDeLaSala(
    tx: { $queryRawUnsafe: (sql: string, ...args: unknown[]) => Promise<unknown> },
    salaId: string,
): Promise<void> {
    await tx.$queryRawUnsafe(
        `SELECT "id" FROM "salas_de_video" WHERE "id" = $1 FOR UPDATE`,
        salaId,
    );
}

export type FilaDeSala = {
    id: string;
    codigo: string;
    cuentaId: string;
    canalId: string;
    anfitrionId: string;
    anfitrionNombre: string | null;
    titulo: string | null;
    creadoEn: Date;
    expiraEn: Date;
    revocadaEn: Date | null;
};

export type FilaDeParticipante = {
    id: string;
    salaId: string;
    personaId: string | null;
    invitadoToken: string | null;
    nombre: string;
    esInvitado: boolean;
    estado: EstadoEnLaSala;
    creadoEn: Date;
    entradoEn: Date | null;
    vistoEn: Date;
    salidoEn: Date | null;
    micEncendido: boolean;
    camaraEncendida: boolean;
    compartiendo: boolean;
};

export type FilaDeSenal = {
    id: string;
    salaId: string;
    deId: string;
    paraId: string;
    tipo: TipoDeSenal;
    sdp: string;
    creadoEn: Date;
};

const COLUMNAS_SALA = `"id", "codigo", "cuentaId", "canalId", "anfitrionId",
                       "anfitrionNombre", "titulo", "creadoEn", "expiraEn", "revocadaEn"`;

const COLUMNAS_PARTICIPANTE = `"id", "salaId", "personaId", "invitadoToken", "nombre",
                               "esInvitado", "estado", "creadoEn", "entradoEn",
                               "vistoEn", "salidoEn", "micEncendido",
                               "camaraEncendida", "compartiendo"`;

/**
 * El código del enlace: 24 caracteres de `base64url` sobre 18 bytes de azar.
 *
 * **El enlace es lo único que hay entre alguien de fuera y la puerta de la
 * sala**, así que adivinarlo tiene que ser imposible, no difícil: 18 bytes son
 * 144 bits. Un `randomUUID` habría valido igual (122 bits) pero se lee peor
 * pegado en un mensaje, con sus guiones y sus 36 caracteres.
 *
 * `base64url` y no `base64`: esto va **en una URL**, y un `+` o un `/` dentro
 * de una ruta se escapan por el camino y el enlace deja de abrir.
 *
 * Y conviene recordar qué NO es: tener el enlace no mete a nadie en la reunión,
 * solo deja llamar a la puerta. Quien pasa lo decide el anfitrión.
 */
export function unCodigoDeSala(): string {
    return randomBytes(18).toString("base64url");
}

/** El token con el que un invitado se identifica en cada vuelta de su reloj. */
function unTokenDeInvitado(): string {
    return randomBytes(24).toString("base64url");
}

export async function crearLaSala(input: {
    cuentaId: string;
    canalId: string;
    anfitrionId: string;
    anfitrionNombre: string | null;
    titulo: string | null;
    expiraEn: Date;
}): Promise<FilaDeSala> {
    const id = randomUUID();
    const codigo = unCodigoDeSala();
    const filas = await conLasTablas(() => db.$queryRawUnsafe<FilaDeSala[]>(
        `INSERT INTO "salas_de_video"
             ("id", "codigo", "cuentaId", "canalId", "anfitrionId",
              "anfitrionNombre", "titulo", "expiraEn")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${COLUMNAS_SALA}`,
        id,
        codigo,
        input.cuentaId,
        input.canalId,
        input.anfitrionId,
        input.anfitrionNombre,
        input.titulo,
        input.expiraEn,
    ));
    return filas[0];
}

export async function laSalaPorCodigo(codigo: string): Promise<FilaDeSala | null> {
    const filas = await conLasTablas(() => db.$queryRawUnsafe<FilaDeSala[]>(
        `SELECT ${COLUMNAS_SALA} FROM "salas_de_video" WHERE "codigo" = $1`,
        codigo,
    ));
    return filas[0] ?? null;
}

export async function laSalaPorId(id: string): Promise<FilaDeSala | null> {
    const filas = await conLasTablas(() => db.$queryRawUnsafe<FilaDeSala[]>(
        `SELECT ${COLUMNAS_SALA} FROM "salas_de_video" WHERE "id" = $1`,
        id,
    ));
    return filas[0] ?? null;
}

/**
 * Las salas vivas de un canal.
 *
 * Las caducadas y las revocadas **no salen**: la lista está para volver a una
 * reunión abierta, y una fila que al pulsarla dice «este enlace ya no vale» es
 * una fila que estorba. Siguen en la tabla porque su historial es lo que
 * explica quién creó qué.
 */
export async function lasSalasVivasDelCanal(canalId: string): Promise<FilaDeSala[]> {
    return conLasTablas(() => db.$queryRawUnsafe<FilaDeSala[]>(
        `SELECT ${COLUMNAS_SALA} FROM "salas_de_video"
         WHERE "canalId" = $1 AND "revocadaEn" IS NULL AND "expiraEn" > NOW()
         ORDER BY "creadoEn" DESC
         LIMIT 10`,
        canalId,
    ));
}

/**
 * Revocar: cierra el enlace **y echa a quien esté dentro**.
 *
 * Las dos cosas, y en una transacción. Revocar dejando dentro a la gente que ya
 * entró sería media revocación: quien te preocupa es justo quien está dentro
 * ahora mismo, y el enlace cerrado solo evita que llegue alguien nuevo.
 *
 * Condicionado a que no estuviera ya revocada, para que dos pulsaciones
 * seguidas no cuenten como dos.
 */
export async function revocarLaSala(
    salaId: string,
    anfitrionId: string,
): Promise<boolean> {
    return conLasTablas(async () => {
        const tocadas = await db.$executeRaw`
            UPDATE "salas_de_video" SET "revocadaEn" = NOW()
            WHERE "id" = ${salaId} AND "anfitrionId" = ${anfitrionId}
              AND "revocadaEn" IS NULL
        `;
        if (tocadas > 0) {
            await db.$executeRaw`
                UPDATE "sala_participantes"
                SET "estado" = 'fuera', "salidoEn" = NOW()
                WHERE "salaId" = ${salaId} AND "estado" IN ('dentro', 'esperando')
            `;
            await db.$executeRaw`
                DELETE FROM "sala_senales" WHERE "salaId" = ${salaId}
            `;
        }
        return tocadas > 0;
    });
}

/** Los que están dentro o esperando, con su último latido. */
export async function losDeLaSala(salaId: string): Promise<FilaDeParticipante[]> {
    return conLasTablas(() => db.$queryRawUnsafe<FilaDeParticipante[]>(
        `SELECT ${COLUMNAS_PARTICIPANTE} FROM "sala_participantes"
         WHERE "salaId" = $1 AND "estado" IN ('dentro', 'esperando')
         ORDER BY "creadoEn" ASC`,
        salaId,
    ));
}

/**
 * Sacar de la sala a los que dejaron de dar señales.
 *
 * Corre dentro de la misma vuelta del reloj que ya pasa por aquí, así que no
 * añade ni un viaje. Es lo que cierra la reunión sola cuando alguien cierra la
 * pestaña sin despedirse, que es lo que hace todo el mundo: sin esto, su
 * recuadro negro se queda ahí para siempre y su sitio sigue ocupando uno de los
 * cuatro.
 *
 * Y se lleva por delante **sus señales pendientes**: una oferta de alguien que
 * ya no está es una conexión que nadie va a contestar.
 */
export async function sacarALosQueNoDanSenales(salaId: string): Promise<number> {
    const limite = new Date(Date.now() - MARGEN_EN_LA_SALA_MS);
    return conLasTablas(async () => {
        const idos = await db.$queryRawUnsafe<Array<{ id: string }>>(
            `UPDATE "sala_participantes"
             SET "estado" = 'fuera', "salidoEn" = NOW()
             WHERE "salaId" = $1 AND "estado" IN ('dentro', 'esperando') AND "vistoEn" < $2
             RETURNING "id"`,
            salaId,
            limite,
        );
        if (idos.length) {
            const ids = idos.map((f) => f.id);
            await db.$queryRawUnsafe(
                `DELETE FROM "sala_senales"
                 WHERE "salaId" = $1 AND ("deId" = ANY($2::text[]) OR "paraId" = ANY($2::text[]))`,
                salaId,
                ids,
            );
        }
        return idos.length;
    });
}

/** Cuántos hay dentro ahora mismo. Es lo que decide si cabe alguien más. */
export async function cuantosHayDentro(salaId: string): Promise<number> {
    const filas = await conLasTablas(() => db.$queryRaw<Array<{ n: bigint }>>`
        SELECT COUNT(*)::bigint AS n FROM "sala_participantes"
        WHERE "salaId" = ${salaId} AND "estado" = 'dentro'
    `);
    return Number(filas[0]?.n ?? 0);
}

/**
 * Meter —o devolver— a alguien CON CUENTA.
 *
 * Entra directo, sin sala de espera: el enlace no es lo que le deja pasar, es
 * **pertenecer al canal**, y eso ya se comprobó antes de llamar aquí. La sala
 * de espera existe para quien viene de fuera, que es de quien no se sabe nada.
 *
 * Y es un `ON CONFLICT` sobre `(salaId, personaId)` y no un `INSERT`: recargar
 * la pestaña, o volver a entrar después de irse, tiene que devolver **la misma
 * fila**. Con una fila nueva por recarga, el tope de cuatro se agotaría con una
 * sola persona probando.
 *
 * Devuelve `null` cuando la sala está llena — y solo cuando esa persona **no
 * estaba ya dentro**: quien recarga no puede quedarse fuera de su propia
 * reunión porque la sala esté al completo contándole a él.
 */
export async function entrarConCuenta(input: {
    salaId: string;
    personaId: string;
    nombre: string;
}): Promise<FilaDeParticipante | null> {
    return conLasTablas(() => db.$transaction(async (tx) => {
        await candadoDeLaSala(tx, input.salaId);

        // Quien YA está dentro no cuenta contra el tope: recargar la pestaña
        // no puede dejar a alguien fuera de su propia reunión por estar llena
        // contándole a él.
        const yaEsta = await tx.$queryRawUnsafe<Array<{ estado: string }>>(
            `SELECT "estado" FROM "sala_participantes"
             WHERE "salaId" = $1 AND "personaId" = $2`,
            input.salaId,
            input.personaId,
        );
        if (yaEsta[0]?.estado !== "dentro") {
            const n = await tx.$queryRawUnsafe<Array<{ n: bigint }>>(
                `SELECT COUNT(*)::bigint AS n FROM "sala_participantes"
                 WHERE "salaId" = $1 AND "estado" = 'dentro'`,
                input.salaId,
            );
            if (Number(n[0]?.n ?? 0) >= TOPE_DE_LA_SALA) return null;
        }

        const filas = await tx.$queryRawUnsafe<FilaDeParticipante[]>(
            `INSERT INTO "sala_participantes"
                 ("id", "salaId", "personaId", "nombre", "esInvitado", "estado",
                  "entradoEn", "vistoEn")
             VALUES ($1, $2, $3, $4, false, 'dentro', NOW(), NOW())
             ON CONFLICT ("salaId", "personaId") WHERE "personaId" IS NOT NULL
             DO UPDATE SET "estado" = 'dentro', "entradoEn" = NOW(), "vistoEn" = NOW(),
                           "salidoEn" = NULL, "nombre" = EXCLUDED."nombre"
             RETURNING ${COLUMNAS_PARTICIPANTE}`,
            randomUUID(),
            input.salaId,
            input.personaId,
            input.nombre,
        );
        return filas[0] ?? null;
    }));
}

/**
 * Llamar a la puerta: alguien de fuera deja su nombre y espera.
 *
 * **No entra**, y esa es la función entera de esto: crea la fila en
 * `esperando` y devuelve el token con el que esa pestaña se identificará
 * después. El token se genera **aquí, en el servidor**, y no llega nunca del
 * navegador: si llegara, cualquiera podría decir que es la fila de otro.
 *
 * Devuelve `null` con la puerta llena — ver `TOPE_EN_LA_PUERTA`: el enlace es
 * público, así que sin tope alguien llenaría la tabla llamando en bucle.
 */
export async function llamarALaPuerta(input: {
    salaId: string;
    nombre: string;
}): Promise<FilaDeParticipante | null> {
    return conLasTablas(async () => {
        const enLaPuerta = await db.$queryRaw<Array<{ n: bigint }>>`
            SELECT COUNT(*)::bigint AS n FROM "sala_participantes"
            WHERE "salaId" = ${input.salaId} AND "estado" = 'esperando'
        `;
        if (Number(enLaPuerta[0]?.n ?? 0) >= TOPE_EN_LA_PUERTA) return null;

        const filas = await db.$queryRawUnsafe<FilaDeParticipante[]>(
            `INSERT INTO "sala_participantes"
                 ("id", "salaId", "invitadoToken", "nombre", "esInvitado", "estado", "vistoEn")
             VALUES ($1, $2, $3, $4, true, 'esperando', NOW())
             RETURNING ${COLUMNAS_PARTICIPANTE}`,
            randomUUID(),
            input.salaId,
            unTokenDeInvitado(),
            input.nombre,
        );
        return filas[0] ?? null;
    });
}

/** La fila de un invitado, por su token. Es su única forma de identificarse. */
export async function elInvitadoDelToken(token: string): Promise<FilaDeParticipante | null> {
    const filas = await conLasTablas(() => db.$queryRawUnsafe<FilaDeParticipante[]>(
        `SELECT ${COLUMNAS_PARTICIPANTE} FROM "sala_participantes"
         WHERE "invitadoToken" = $1`,
        token,
    ));
    return filas[0] ?? null;
}

/** La fila de alguien con cuenta en una sala. */
export async function elParticipanteConCuenta(
    salaId: string,
    personaId: string,
): Promise<FilaDeParticipante | null> {
    const filas = await conLasTablas(() => db.$queryRawUnsafe<FilaDeParticipante[]>(
        `SELECT ${COLUMNAS_PARTICIPANTE} FROM "sala_participantes"
         WHERE "salaId" = $1 AND "personaId" = $2`,
        salaId,
        personaId,
    ));
    return filas[0] ?? null;
}

/**
 * Dejar pasar a alguien que esperaba.
 *
 * Condicionado a que **siguiera esperando** y a que quepa. Las dos: sin la
 * primera, dos pulsaciones seguidas del anfitrión —o dos anfitriones a la
 * vez— meterían a la misma persona dos veces; sin la segunda, se podría pasar
 * de cuatro admitiendo a varios a la vez, y entonces la malla pide más subida
 * de la que hay y se corta para todos.
 *
 * Devuelve `"llena"` y `"ya"` por separado porque son dos cosas distintas que
 * decir: una se arregla esperando a que alguien salga y la otra no necesita
 * arreglo ninguno.
 */
export async function dejarPasar(input: {
    salaId: string;
    participanteId: string;
}): Promise<"pasa" | "llena" | "ya"> {
    return conLasTablas(() => db.$transaction(async (tx) => {
        await candadoDeLaSala(tx, input.salaId);

        const fila = await tx.$queryRawUnsafe<Array<{ estado: string }>>(
            `SELECT "estado" FROM "sala_participantes" WHERE "id" = $1 AND "salaId" = $2`,
            input.participanteId,
            input.salaId,
        );
        // No estaba esperando: o ya entró —una segunda pulsación, que no es un
        // error— o se fue. Decirle «está llena» a un doble clic manda a buscar
        // un problema que no existe. Lo cazó el banco.
        if (fila[0]?.estado !== "esperando") return "ya";

        const n = await tx.$queryRawUnsafe<Array<{ n: bigint }>>(
            `SELECT COUNT(*)::bigint AS n FROM "sala_participantes"
             WHERE "salaId" = $1 AND "estado" = 'dentro'`,
            input.salaId,
        );
        if (Number(n[0]?.n ?? 0) >= TOPE_DE_LA_SALA) return "llena";

        const tocadas = await tx.$executeRawUnsafe(
            `UPDATE "sala_participantes"
             SET "estado" = 'dentro', "entradoEn" = NOW(), "vistoEn" = NOW()
             WHERE "id" = $1 AND "salaId" = $2 AND "estado" = 'esperando'`,
            input.participanteId,
            input.salaId,
        );
        return tocadas > 0 ? "pasa" : "ya";
    }));
}

/**
 * No dejar pasar, o echar a alguien que ya estaba dentro.
 *
 * Es la misma escritura para las dos cosas a propósito: lo que hace el
 * anfitrión es sacar a alguien de la reunión, y que estuviera en la puerta o
 * dentro solo cambia dónde se le quita el sitio. Con dos funciones, el día que
 * se afine una —limpiar sus señales, por ejemplo— la otra se queda atrás.
 */
export async function sacarDeLaSala(input: {
    salaId: string;
    participanteId: string;
    motivo: "rechazado" | "fuera";
}): Promise<boolean> {
    return conLasTablas(async () => {
        const tocadas = await db.$executeRaw`
            UPDATE "sala_participantes"
            SET "estado" = ${input.motivo}, "salidoEn" = NOW()
            WHERE "id" = ${input.participanteId} AND "salaId" = ${input.salaId}
              AND "estado" IN ('dentro', 'esperando')
        `;
        if (tocadas > 0) {
            await db.$executeRaw`
                DELETE FROM "sala_senales"
                WHERE "salaId" = ${input.salaId}
                  AND ("deId" = ${input.participanteId} OR "paraId" = ${input.participanteId})
            `;
        }
        return tocadas > 0;
    });
}

/**
 * El latido de quien está dentro o esperando. **Una escritura por vuelta.**
 *
 * Lleva dentro qué está mandando esa persona, en la MISMA sentencia: son tres
 * booleanos en una fila que ya se estaba escribiendo de todas formas. En una
 * acción aparte serían el doble de viajes en el camino más caliente de esta
 * pantalla, y en una reunión de cuatro eso es el doble por persona y por
 * vuelta.
 */
export async function latirEnLaSala(
    participanteId: string,
    medios?: { mic?: boolean; camara?: boolean; compartiendo?: boolean } | null,
): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        UPDATE "sala_participantes"
        SET "vistoEn" = NOW(),
            "micEncendido" = COALESCE(${medios?.mic ?? null}::boolean, "micEncendido"),
            "camaraEncendida" = COALESCE(${medios?.camara ?? null}::boolean, "camaraEncendida"),
            "compartiendo" = COALESCE(${medios?.compartiendo ?? null}::boolean, "compartiendo")
        WHERE "id" = ${participanteId} AND "estado" IN ('dentro', 'esperando')
    `);
}

/**
 * Dejar una oferta o una respuesta en el buzón de otro.
 *
 * **`deId` NO llega del navegador**: lo pone quien llama, resuelto desde la
 * sesión o desde el token. Si llegara de fuera, cualquiera dentro de una sala
 * podría dejar una oferta firmada con el id de otro y hacer que dos personas se
 * conectaran creyendo hablar con quien no es.
 */
export async function dejarLaSenal(input: {
    salaId: string;
    deId: string;
    paraId: string;
    tipo: TipoDeSenal;
    sdp: string;
}): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        INSERT INTO "sala_senales" ("id", "salaId", "deId", "paraId", "tipo", "sdp")
        VALUES (${randomUUID()}, ${input.salaId}, ${input.deId}, ${input.paraId},
                ${input.tipo}, ${input.sdp})
    `);
}

/**
 * Vaciar el buzón de alguien: se lee **y se borra**, en una sola sentencia.
 *
 * Lo de la sentencia única no es estilo: con un `SELECT` y luego un `DELETE`,
 * dos vueltas que se solapen se llevarían las dos la misma oferta y la
 * aplicarían dos veces sobre una conexión ya negociada. Y con `RETURNING` la
 * fila sale de la tabla en el acto, que es lo que hay que hacer con un SDP —
 * lleva dentro las direcciones IP de quien lo mandó.
 */
export async function vaciarElBuzon(paraId: string): Promise<FilaDeSenal[]> {
    return conLasTablas(() => db.$queryRawUnsafe<FilaDeSenal[]>(
        `DELETE FROM "sala_senales" WHERE "paraId" = $1
         RETURNING "id", "salaId", "deId", "paraId", "tipo", "sdp", "creadoEn"`,
        paraId,
    ));
}

/**
 * Barrer las señales que nadie recogió.
 *
 * Una oferta que lleva un minuto ahí es de alguien que cerró la pestaña: la
 * conexión no se va a establecer y aplicarla ahora sería peor que tirarla. Se
 * hace **una de cada veinte vueltas** y en su propio `try`, como el podado de
 * `envios_automaticos`: un barrido que se cuelgue no puede retener la vuelta
 * del reloj que lo disparó, que es la que trae la reunión.
 */
export async function barrerSenalesViejas(): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        DELETE FROM "sala_senales" WHERE "creadoEn" < NOW() - INTERVAL '2 minutes'
    `);
}

/** Para el banco: los topes con los que se decide. */
export const TOPES = { sala: TOPE_DE_LA_SALA, puerta: TOPE_EN_LA_PUERTA };

/**
 * Cómo se llaman unas reuniones, y si siguen valiendo.
 *
 * Es lo que convierte una dirección cruda de ochenta caracteres pegada en un
 * mensaje en una tarjeta que dice de qué reunión es. **Una sola consulta por
 * página de mensajes**, como `lasCitasQueSiguenAhi` y `lasReaccionesDe`: una
 * por burbuja serían decenas cada cinco segundos y por pestaña abierta.
 *
 * Y va acotada al CANAL que se está leyendo. No es un detalle de rendimiento:
 * sin eso, pegar en un canal el enlace de una reunión de otro sitio pintaría
 * una tarjeta con **el título de una reunión que quien lee no alcanza** — un
 * nombre que se le escapa a quien no tiene por qué verlo. Lo que no encaje sale
 * como una tarjeta genérica, que sigue siendo pulsable: la puerta de verdad
 * está al entrar, no al pintar.
 */
export async function lasReunionesDeLosMensajes(
    codigos: string[],
    canalId: string,
): Promise<Map<string, { titulo: string | null; abierta: boolean; dentro: number }>> {
    const unicos = Array.from(new Set(codigos.filter(Boolean))).slice(0, 50);
    if (!unicos.length || !canalId) return new Map();

    const filas = await conLasTablas(() => db.$queryRawUnsafe<
        Array<{
            codigo: string;
            titulo: string | null;
            expiraEn: Date;
            revocadaEn: Date | null;
            dentro: bigint;
        }>
    >(
        // `LEFT JOIN`, nunca `JOIN`: una reunión abierta en la que todavía no
        // ha entrado nadie **no tiene ni una fila** de participante, y con un
        // `JOIN` desaparecería del resultado — o sea que su tarjeta se
        // quedaría sin nombre justo cuando es la recién abierta. Es la misma
        // familia que el universo de «Actividad de instancias»: se parte de lo
        // que existe y lo que se cuenta se pega al lado; el cero es el dato.
        `SELECT s."codigo", s."titulo", s."expiraEn", s."revocadaEn",
                COUNT(p."id") FILTER (
                    WHERE p."estado" = 'dentro' AND p."vistoEn" > $3
                )::bigint AS "dentro"
           FROM "salas_de_video" s
           LEFT JOIN "sala_participantes" p ON p."salaId" = s."id"
          WHERE s."canalId" = $1 AND s."codigo" = ANY($2::text[])
          GROUP BY s."codigo", s."titulo", s."expiraEn", s."revocadaEn"`,
        canalId,
        unicos,
        // Se cuenta a quien está LATIENDO, no a quien tiene la fila puesta.
        //
        // `sacarALosQueNoDanSenales` limpia por sala, y solo la barre quien
        // está dentro de ELLA: una reunión que se quedó vacía no tiene a nadie
        // que la barra, así que su última fila se queda en `dentro` para
        // siempre. Contando el estado a secas, esa tarjeta diría «1 persona
        // dentro» eternamente — que es exactamente la confusión que este
        // número viene a quitar. El mismo margen que usa el barrido.
        new Date(Date.now() - MARGEN_EN_LA_SALA_MS),
    ));

    const mapa = new Map<string, { titulo: string | null; abierta: boolean; dentro: number }>();
    for (const f of filas) {
        mapa.set(f.codigo, {
            titulo: f.titulo,
            // La misma regla que la puerta: revocada o caducada, no vale. Se
            // dice en la tarjeta para no hacer pulsar un enlace muerto.
            abierta: !f.revocadaEn && f.expiraEn.getTime() > Date.now(),
            dentro: Number(f.dentro ?? 0),
        });
    }
    return mapa;
}
