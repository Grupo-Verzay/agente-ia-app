import "server-only";

import { randomBytes, randomUUID } from "crypto";

import { db } from "@/lib/db";
import { sePuedeReanudar, type MotivoDeSalida } from "@/lib/reconexion-de-la-sala";
import {
    MARGEN_EN_LA_SALA_MS,
    TOPE_DE_LA_SALA,
    TOPE_EN_LA_PUERTA,
    comoEstaLaSala,
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
        // **Una sala ya no tiene por qué ser de un canal.**
        //
        // Va con `ALTER COLUMN … DROP NOT NULL` y NO reescribiendo el `CREATE`:
        // la tabla ya está en producción y un `CREATE TABLE IF NOT EXISTS` no
        // toca una que ya existe. Es el fallo que se comete solo al cambiarle
        // una columna a una tabla de la App ya desplegada — el mismo camino por
        // el que `task_alerts.taskId` se hizo opcional para las menciones del
        // chat de equipo.
        //
        // `DROP NOT NULL` no se queja si ya está quitado, así que se puede
        // repetir en cada arranque. Y las filas que ya están **no se tocan**:
        // siguen con su canal y se comportan exactamente igual.
        await db.$executeRaw`
            ALTER TABLE "salas_de_video"
            ALTER COLUMN "canalId" DROP NOT NULL
        `;
        // **Y un enlace puede no caducar.**
        //
        // Por el mismo camino y por el mismo motivo: la tabla ya está en
        // producción, así que va con `ALTER COLUMN … DROP NOT NULL` y NO
        // reescribiendo el `CREATE`, que no toca una tabla que ya existe.
        //
        // `NULL` aquí significa **«no caduca»**, no «no se sabe». Es lo que
        // permite el enlace fijo de atención que se pidió, y lo que evita el
        // apaño de guardar una fecha a cien años: un centinela acaba impreso,
        // y «caduca en 36.500 días» es exactamente esa clase de número.
        //
        // Las filas que ya están **no se tocan**: siguen con su fecha y
        // caducan igual. Y la consulta de las vivas pregunta `IS NULL OR >
        // NOW()`, así que sin esa mitad un enlace permanente desaparecería de
        // su propia lista — que es justo la pantalla desde la que se revoca.
        await db.$executeRaw`
            ALTER TABLE "salas_de_video"
            ALTER COLUMN "expiraEn" DROP NOT NULL
        `;
        // Por donde entra la pantalla de Reuniones: las de una cuenta, las
        // vivas arriba y las pasadas debajo, las dos ordenadas por fecha.
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "salas_de_video_cuenta_idx"
            ON "salas_de_video" ("cuentaId", "creadoEn")
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
        // La mano levantada y la petición de silencio: dos MARCAS DE TIEMPO,
        // no dos booleanos.
        //
        // Con un booleano las dos se quedarían puestas para siempre, y cada una
        // por su motivo:
        //
        // - Una mano levantada no la baja nadie: a quien la levantó se le
        //   olvida, así que a los diez minutos la reunión entera tiene la mano
        //   arriba y el icono deja de significar nada. Con la hora dentro,
        //   `tieneLaManoLevantada` la baja sola a los dos minutos.
        // - Y una petición de silencio puesta es una persona que **no puede
        //   volver a encender el micro nunca**: su pestaña leería la orden en
        //   cada vuelta del reloj y se callaría sola una y otra vez. Con la hora
        //   dentro, la orden vale unos segundos —lo que tarda en recogerla— y
        //   caduca.
        //
        // Van por `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, como las tres de
        // arriba: la tabla ya está en producción y un `CREATE TABLE IF NOT
        // EXISTS` no toca una que ya existe.
        await db.$executeRaw`
            ALTER TABLE "sala_participantes"
            ADD COLUMN IF NOT EXISTS "manoLevantadaEn" TIMESTAMP(3)
        `;
        await db.$executeRaw`
            ALTER TABLE "sala_participantes"
            ADD COLUMN IF NOT EXISTS "silenciadoEn" TIMESTAMP(3)
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

        // El chat de la reunión. **No sale de la sala**, y eso es una columna:
        // `salaId`. No es el chat de equipo con otro nombre — no hay canal, no
        // hay menciones, no hay avisos y no aparece en ninguna otra pantalla.
        // Lo que se escribe aquí lo leen los que están en esta reunión, y ahí
        // se acaba.
        //
        // El nombre del autor se **copia dentro**, como en `team_chat_messages`
        // y por el mismo motivo llevado al extremo: media reunión son invitados
        // sin cuenta, cuya única identidad es una fila de `sala_participantes`
        // que se borra con la sala. Sin el nombre copiado, al recargar la
        // pantalla el hilo diría «Alguien» en la mitad de las burbujas.
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "sala_mensajes" (
                "id" TEXT PRIMARY KEY,
                "salaId" TEXT NOT NULL,
                "deId" TEXT NOT NULL,
                "autorNombre" TEXT NOT NULL,
                "texto" TEXT NOT NULL,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        // Por `(salaId, creadoEn)` porque así se lee siempre: los de ESTA sala
        // posteriores al último que ya tengo. Sin el índice, cada vuelta del
        // reloj —cada dos segundos y por persona— recorrería la tabla entera
        // para no devolver nada, que es el caso normal.
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "sala_mensajes_sala_idx"
            ON "sala_mensajes" ("salaId", "creadoEn")
        `;

        // Por qué alguien dejó de estar dentro.
        //
        // Los tres caminos escribían `estado = 'fuera'` y nada más, así que
        // eran **indistinguibles** — y a la hora de volver significan cosas
        // opuestas: a quien se le cayó la red se le devuelve a su sitio solo, y
        // a quien acaban de echar no. Sin esta columna, la pestaña de alguien a
        // quien sacaron volvería a entrar sola dos segundos después.
        //
        // `ADD COLUMN IF NOT EXISTS` y no reescribiendo el `CREATE`: la tabla
        // ya está en producción. Las filas viejas traen `NULL`, que
        // `sePuedeReanudar` trata como «no se reanuda»: se ve de menos, nunca
        // de más.
        await db.$executeRaw`
            ALTER TABLE "sala_participantes"
            ADD COLUMN IF NOT EXISTS "motivoDeSalida" TEXT
        `;

        // Que se está grabando, en la SALA y no en la grabación.
        //
        // Lo pregunta el reloj de todos los participantes en cada vuelta, y la
        // fila de la sala ya viene cargada en esa vuelta: en la tabla de
        // grabaciones serían dos consultas por persona y por vuelta en el
        // camino más caliente que tiene esto.
        //
        // Y son DOS marcas, no un booleano. `grabandoDesde` es cuándo empezó,
        // que es lo que se enseña; `grabandoVistoEn` lo refresca el reloj de
        // quien graba, y es lo que hace que el aviso **se apague solo** cuando
        // esa pestaña se cierra. Con un booleano, una reunión diría «grabando»
        // para siempre después de que a quien grababa se le cerrara el
        // portátil. Es la misma forma que la mano levantada.
        await db.$executeRaw`
            ALTER TABLE "salas_de_video"
            ADD COLUMN IF NOT EXISTS "grabandoDesde" TIMESTAMP(3)
        `;
        await db.$executeRaw`
            ALTER TABLE "salas_de_video"
            ADD COLUMN IF NOT EXISTS "grabandoVistoEn" TIMESTAMP(3)
        `;
        await db.$executeRaw`
            ALTER TABLE "salas_de_video"
            ADD COLUMN IF NOT EXISTS "grabacionId" TEXT
        `;
        // El nombre de quien graba, COPIADO aquí.
        //
        // Lo lee el reloj de todos los participantes en cada vuelta para pintar
        // el aviso, y la fila de la sala ya viene cargada; sacarlo de la fila de
        // la grabación sería una consulta más por persona y por vuelta para
        // enseñar un nombre. Es el mismo criterio con el que un mensaje del chat
        // copia `autorNombre`: lo barato viaja con lo que ya se lee.
        await db.$executeRaw`
            ALTER TABLE "salas_de_video"
            ADD COLUMN IF NOT EXISTS "grabandoPor" TEXT
        `;

        // Las grabaciones. Tabla de la App, `CREATE TABLE IF NOT EXISTS` y sin
        // clave foránea, como las cuatro de arriba.
        //
        // Sin clave foránea a `salas_de_video` **a propósito**: una sala
        // caduca y se puede revocar, y su grabación tiene que seguir en la
        // ficha ciento ochenta días después. El título de la reunión se
        // **copia dentro** por lo mismo, igual que `autorNombre` en los
        // mensajes: la ficha sigue diciendo de qué reunión era aunque la sala
        // ya no exista.
        //
        // Y el audio y el video van en DOS parejas de columnas y no en una
        // tabla de ficheros: son como mucho dos por grabación, siempre los
        // mismos dos, y con una tabla aparte cada ficha pediría una consulta
        // más para enseñar un reproductor.
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "grabaciones_de_reunion" (
                "id" TEXT PRIMARY KEY,
                "salaId" TEXT NOT NULL,
                "cuentaId" TEXT NOT NULL,
                "salaTitulo" TEXT,
                "pedidaPorId" TEXT NOT NULL,
                "pedidaPorNombre" TEXT NOT NULL,
                "modo" TEXT NOT NULL DEFAULT 'audio',
                "estado" TEXT NOT NULL DEFAULT 'grabando',
                "audioUrl" TEXT,
                "audioBytes" BIGINT NOT NULL DEFAULT 0,
                "videoUrl" TEXT,
                "videoBytes" BIGINT NOT NULL DEFAULT 0,
                "segundos" INTEGER NOT NULL DEFAULT 0,
                "partesAudio" INTEGER NOT NULL DEFAULT 0,
                "partesVideo" INTEGER NOT NULL DEFAULT 0,
                "transcripcion" TEXT,
                "resumen" TEXT,
                "transcritaEn" TIMESTAMP(3),
                "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "terminadaEn" TIMESTAMP(3)
            )
        `;
        // Por `(cuentaId, creadaEn)`: así se lee la ficha y así se suma el
        // cupo. Y por `salaId` para pegarle sus grabaciones a cada reunión de
        // la lista en una sola consulta, no una por fila.
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "grabaciones_cuenta_idx"
            ON "grabaciones_de_reunion" ("cuentaId", "creadaEn")
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "grabaciones_sala_idx"
            ON "grabaciones_de_reunion" ("salaId")
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
    /** El canal del que nació, o `null` si es una reunión de la cuenta. */
    canalId: string | null;
    anfitrionId: string;
    anfitrionNombre: string | null;
    titulo: string | null;
    creadoEn: Date;
    /** `null` es **no caduca**, no «no se sabe». Ver la migración de arriba. */
    expiraEn: Date | null;
    revocadaEn: Date | null;
    /** Cuándo empezó la grabación en curso, si la hay. */
    grabandoDesde: Date | null;
    /** El último latido de quien graba. Es lo que apaga el aviso solo. */
    grabandoVistoEn: Date | null;
    grabacionId: string | null;
    /** El nombre de quien graba, copiado para no tener que ir a buscarlo. */
    grabandoPor: string | null;
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
    manoLevantadaEn: Date | null;
    silenciadoEn: Date | null;
    /** Por qué dejó de estar dentro. `null` en las filas de antes de #832. */
    motivoDeSalida: string | null;
};

export type FilaDeMensajeDeSala = {
    id: string;
    salaId: string;
    deId: string;
    autorNombre: string;
    texto: string;
    creadoEn: Date;
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
                       "anfitrionNombre", "titulo", "creadoEn", "expiraEn", "revocadaEn",
                       "grabandoDesde", "grabandoVistoEn", "grabacionId", "grabandoPor"`;

const COLUMNAS_PARTICIPANTE = `"id", "salaId", "personaId", "invitadoToken", "nombre",
                               "esInvitado", "estado", "creadoEn", "entradoEn",
                               "vistoEn", "salidoEn", "micEncendido",
                               "camaraEncendida", "compartiendo",
                               "manoLevantadaEn", "silenciadoEn", "motivoDeSalida"`;

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
    /** El canal del que nació, o `null` si es una reunión de la cuenta. */
    canalId: string | null;
    anfitrionId: string;
    anfitrionNombre: string | null;
    titulo: string | null;
    /** `null` para un enlace que no caduca. Lo decide `laDuracionQueSePuede`. */
    expiraEn: Date | null;
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
         WHERE "canalId" = $1 AND "revocadaEn" IS NULL
           AND ("expiraEn" IS NULL OR "expiraEn" > NOW())
         ORDER BY "creadoEn" DESC
         LIMIT 10`,
        canalId,
    ));
}

/**
 * Las reuniones VIVAS de una cuenta.
 *
 * **`canalId IS NULL` no es un detalle de la consulta: es la puerta.** Si esta
 * lista trajera también las salas que nacieron en un canal, alguien de la
 * cuenta que no está en ese canal las vería —y con ellas su enlace— sin haber
 * pertenecido nunca a él. Sería ensanchar la puerta del chat de equipo desde
 * una pantalla que no habla de canales, y en silencio.
 *
 * Las caducadas y las revocadas no salen por aquí: salen en el histórico, que
 * es donde se leen.
 */
export async function lasSalasVivasDeLaCuenta(cuentaId: string): Promise<FilaDeSala[]> {
    return conLasTablas(() => db.$queryRawUnsafe<FilaDeSala[]>(
        `SELECT ${COLUMNAS_SALA} FROM "salas_de_video"
         WHERE "cuentaId" = $1 AND "canalId" IS NULL
           AND "revocadaEn" IS NULL
           AND ("expiraEn" IS NULL OR "expiraEn" > NOW())
         ORDER BY "creadoEn" DESC
         LIMIT 50`,
        cuentaId,
    ));
}

/**
 * Mover la caducidad de un enlace que ya existe.
 *
 * Condicionado a que **no esté revocada**: revocar es una decisión que alguien
 * tomó, y devolverla a la vida alargándole la fecha sería deshacerla por la
 * puerta de atrás — con la gente que se echó fuera ya echada. Para volver a
 * reunirse se abre otra sala, que es una línea.
 *
 * Caducada sí se puede: es el caso de todos los días —la reunión se movió al
 * jueves— y es justo lo que evita tener que repartir un enlace nuevo. Quien
 * puede hacerlo lo decide `puedeAdministrarLaSala`, en la acción.
 */
export async function cambiarLaCaducidad(
    salaId: string,
    /** `null` la deja sin caducidad. Quién puede, lo decide la acción. */
    expiraEn: Date | null,
): Promise<boolean> {
    return conLasTablas(async () => {
        const tocadas = await db.$executeRaw`
            UPDATE "salas_de_video" SET "expiraEn" = ${expiraEn}
            WHERE "id" = ${salaId} AND "revocadaEn" IS NULL
        `;
        return tocadas > 0;
    });
}

/**
 * Las reuniones PASADAS de una cuenta, y quién entró en cada una.
 *
 * # Esto no es una tabla nueva: es leer las que ya se llenaban solas
 *
 * `sala_participantes` lleva desde el primer día guardando `entradoEn`,
 * `salidoEn` y `vistoEn` de cada persona, y `salas_de_video` guarda cada sala
 * con su título y su anfitrión. **El histórico ya estaba escrito; lo que no
 * había era quien lo leyera.** Por eso esto no añade ni una columna: son las
 * mismas filas que hoy se acumulan, puestas delante.
 *
 * # Dos consultas, y la cuenta se hace en TypeScript a propósito
 *
 * Se podría agregar en SQL con un `GROUP BY` y un `GREATEST`, y sería una
 * consulta menos. No se hace porque **cuándo terminó una reunión y cuánto duró
 * son decisiones**, no sumas: el fin no es `salidoEn` —cuando todos cierran la
 * pestaña a la vez nadie lo escribe— y una sala en la que no entró nadie no
 * dura cero, no dura. Eso vive en `lib/reuniones-de-la-cuenta.ts`, que es puro
 * y está probado; escrito dentro del SQL no lo prueba nadie.
 *
 * La segunda consulta va por `salaId = ANY(...)`, una sola vez por página,
 * como `lasCitasQueSiguenAhi` del chat de equipo. Una por sala serían cien.
 */
export type FilaDeHistorico = {
    sala: FilaDeSala;
    participantes: Array<{
        nombre: string;
        esInvitado: boolean;
        entradoEn: Date | null;
        salidoEn: Date | null;
        vistoEn: Date;
    }>;
};

export async function elHistorialDeLaCuenta(
    cuentaId: string,
    dias: number,
    tope: number,
): Promise<FilaDeHistorico[]> {
    return conLasTablas(async () => {
        // `make_interval(days => $2::int)` con el molde puesto: Prisma manda el
        // parámetro sin tipo y `make_interval` solo acepta `int`; sin el molde
        // la consulta cae con «no existe la función». Es la misma trampa que
        // ya costó dos vueltas en la tarjeta de actividad de instancias.
        //
        // Y una sala que NO caduca (`expiraEn` nulo) no entra aquí: en SQL
        // `NULL <= NOW()` no es cierto, es desconocido, así que no pasa el
        // filtro. La condición lleva el `IS NOT NULL` delante para que eso se
        // lea, porque de ahí depende que un enlace permanente no aparezca a la
        // vez en las vivas y en las pasadas.
        //
        // (La explicación va aquí y no dentro del SQL a propósito: en un
        // template de consulta no puede haber acentos graves — cierran el
        // literal y el fichero deja de parsear.)
        const salas = await db.$queryRawUnsafe<FilaDeSala[]>(
            `SELECT ${COLUMNAS_SALA} FROM "salas_de_video"
             WHERE "cuentaId" = $1 AND "canalId" IS NULL
               AND ("revocadaEn" IS NOT NULL
                    OR ("expiraEn" IS NOT NULL AND "expiraEn" <= NOW()))
               AND "creadoEn" > NOW() - make_interval(days => $2::int)
             ORDER BY "creadoEn" DESC
             LIMIT $3`,
            cuentaId,
            Math.max(1, Math.floor(dias)),
            Math.max(1, Math.floor(tope)),
        );
        if (!salas.length) return [];

        const ids = salas.map((s) => s.id);
        // Solo los que ENTRARON: quien se quedó en la puerta y nunca pasó no es
        // un asistente. Dejarlo dentro contaría como reunión de cinco una a la
        // que entraron dos.
        const gente = await db.$queryRawUnsafe<Array<{
            salaId: string; nombre: string; esInvitado: boolean;
            entradoEn: Date | null; salidoEn: Date | null; vistoEn: Date;
        }>>(
            `SELECT "salaId", "nombre", "esInvitado", "entradoEn", "salidoEn", "vistoEn"
             FROM "sala_participantes"
             WHERE "salaId" = ANY($1::text[]) AND "entradoEn" IS NOT NULL
             ORDER BY "entradoEn" ASC`,
            ids,
        );

        const porSala = new Map<string, FilaDeHistorico["participantes"]>();
        for (const g of gente) {
            const lista = porSala.get(g.salaId) ?? [];
            lista.push({
                nombre: g.nombre,
                esInvitado: g.esInvitado,
                entradoEn: g.entradoEn,
                salidoEn: g.salidoEn,
                vistoEn: g.vistoEn,
            });
            porSala.set(g.salaId, lista);
        }
        return salas.map((sala) => ({ sala, participantes: porSala.get(sala.id) ?? [] }));
    });
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
 *
 * **Quién puede revocar NO se decide aquí.** Lo decide `puedeAdministrarLaSala`
 * en la acción, que es donde se sabe quién pregunta y si administra la cuenta.
 * Antes iba en el `WHERE` como `anfitrionId = ...`, y eso mezclaba dos cosas:
 * la guarda de permiso y la de «no dos veces». Con las dos juntas, un permiso
 * más ancho obligaba a reescribir la consulta y un `false` no decía cuál de
 * las dos había fallado.
 */
export async function revocarLaSala(salaId: string): Promise<boolean> {
    return conLasTablas(async () => {
        const tocadas = await db.$executeRaw`
            UPDATE "salas_de_video" SET "revocadaEn" = NOW()
            WHERE "id" = ${salaId} AND "revocadaEn" IS NULL
        `;
        if (tocadas > 0) {
            // El motivo importa: a quien echa una revocación **no** se le
            // devuelve solo a la reunión. Sin escribirlo, esas filas quedan con
            // `motivoDeSalida` nulo, que `sePuedeReanudar` ya trata como «no
            // se reanuda» — pero dejarlo implícito es dejar que el día que ese
            // nulo signifique otra cosa, media sala vuelva a entrar sola.
            await db.$executeRaw`
                UPDATE "sala_participantes"
                SET "estado" = 'fuera', "salidoEn" = NOW(), "motivoDeSalida" = 'sacado'
                WHERE "salaId" = ${salaId} AND "estado" IN ('dentro', 'esperando')
            `;
            await db.$executeRaw`
                DELETE FROM "sala_senales" WHERE "salaId" = ${salaId}
            `;
            // Y el chat se va con ella, en la misma vuelta que echa a la gente.
            // Revocar un enlace dejando dentro la conversación sería media
            // revocación: lo que se escribió ahí no tiene ya ningún sitio donde
            // leerse, y sigue ocupando una tabla sin clave foránea que lo limpie.
            await db.$executeRaw`
                DELETE FROM "sala_mensajes" WHERE "salaId" = ${salaId}
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
        // El motivo es lo que después deja volver solo: este barrido es
        // **exactamente** el caso de «se me cayó internet», y es el único que
        // se reanuda sin pedirle nada a nadie.
        const idos = await db.$queryRawUnsafe<Array<{ id: string }>>(
            `UPDATE "sala_participantes"
             SET "estado" = 'fuera', "salidoEn" = NOW(), "motivoDeSalida" = 'silencio'
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
                           "salidoEn" = NULL, "motivoDeSalida" = NULL,
                           "nombre" = EXCLUDED."nombre"
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
    /**
     * Por qué se sale, que NO es lo mismo que el estado en el que se queda.
     *
     * Los dos caminos escriben `fuera` y significan cosas opuestas a la hora de
     * volver: quien pulsó colgar no vuelve solo, y a quien echaron, menos. Sin
     * esto, la reconexión automática devolvería a la reunión a quien acaban de
     * sacar — que es lo contrario de moderar.
     */
    porQue: MotivoDeSalida;
}): Promise<boolean> {
    return conLasTablas(async () => {
        const tocadas = await db.$executeRaw`
            UPDATE "sala_participantes"
            SET "estado" = ${input.motivo}, "salidoEn" = NOW(),
                "motivoDeSalida" = ${input.porQue}
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

// ── La mano, el silencio y el chat ───-----------------------------------------

/**
 * Levantar o bajar la mano.
 *
 * Se escribe la HORA, no un `true`. Lo que se lee después
 * (`tieneLaManoLevantada`) la baja sola a los dos minutos, que es lo que evita
 * una reunión entera con la mano arriba porque a nadie se le ocurrio volver a
 * pulsar el boton.
 *
 * Y **es de uno mismo**: el `participanteId` lo pone quien llama desde su
 * sesión o su token, nunca los parámetros. Levantarle la mano a otro sería
 * ponerle a pedir la palabra sin que la haya pedido.
 */
export async function levantarLaMano(
    participanteId: string,
    levantada: boolean,
): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        UPDATE "sala_participantes"
        SET "manoLevantadaEn" = ${levantada ? new Date() : null}
        WHERE "id" = ${participanteId} AND "estado" = 'dentro'
    `);
}

/**
 * Pedirle a alguien que se silencie.
 *
 * **El servidor no apaga ningún micro**, porque no tiene ninguna pista que
 * tocar: lo único que puede hacer es dejar una marca que el navegador de esa
 * persona recoge en su siguiente vuelta y obedece apagando el suyo. Es como lo
 * hacen todas, y conviene que esté escrito: quien pulsa el botón tiene que
 * saber que lo que manda es una orden que la otra punta cumple, no un
 * interruptor sobre su micrófono.
 *
 * De ahí que la marca sea una hora y **caduque**
 * (`VIGENCIA_DEL_SILENCIO_MS`): puesta para siempre, esa persona no podría
 * volver a encender el micro nunca — cada vuelta del reloj le traería la orden
 * otra vez y se callaría sola.
 *
 * Acota por sala además de por id: sin eso, un id de otra reunión silenciaría a
 * alguien que no está en esta.
 */
export async function pedirElSilencio(input: {
    salaId: string;
    participanteId: string;
}): Promise<boolean> {
    return conLasTablas(async () => {
        const tocadas = await db.$executeRaw`
            UPDATE "sala_participantes"
            SET "silenciadoEn" = NOW()
            WHERE "id" = ${input.participanteId} AND "salaId" = ${input.salaId}
              AND "estado" = 'dentro'
        `;
        return tocadas > 0;
    });
}

/**
 * Escribir en el chat de la reunión.
 *
 * El nombre del autor se copia dentro en el momento de escribir, desde la fila
 * de quien escribe: ver la cabecera de la tabla. Media reunión son invitados
 * cuya fila se va con la sala.
 */
export async function escribirEnLaSala(input: {
    salaId: string;
    deId: string;
    autorNombre: string;
    texto: string;
}): Promise<FilaDeMensajeDeSala> {
    return conLasTablas(async () => {
        const id = randomUUID();
        await db.$executeRaw`
            INSERT INTO "sala_mensajes" ("id", "salaId", "deId", "autorNombre", "texto")
            VALUES (${id}, ${input.salaId}, ${input.deId}, ${input.autorNombre}, ${input.texto})
        `;
        const filas = await db.$queryRawUnsafe<FilaDeMensajeDeSala[]>(
            `SELECT "id", "salaId", "deId", "autorNombre", "texto", "creadoEn"
             FROM "sala_mensajes" WHERE "id" = $1`,
            id,
        );
        return filas[0];
    });
}

/**
 * Los mensajes que faltan, **no el hilo entero**.
 *
 * Esto viaja en cada vuelta del reloj de la sala, o sea cada dos segundos y por
 * persona. Devolver el hilo completo cada vez sería meter una conversación
 * entera en el camino más caliente de esta pantalla para no decir nada nuevo
 * el 99 % de las veces.
 *
 * El corte es **la hora del último que ya se tiene**, que la manda el
 * navegador. Con un `OFFSET` habría que contar los de antes —o sea recorrerlos—
 * y además se saltarían filas en cuanto entrara uno nuevo entre dos vueltas.
 *
 * `desde` nulo es «acabo de entrar»: se devuelven los últimos, no todos, y se
 * les da la vuelta al salir. Pidiéndolos `ASC` con un tope, una reunión larga
 * devolvería el principio de la conversación en vez del final.
 */
export async function losMensajesDeLaSala(input: {
    salaId: string;
    desde?: Date | null;
    tope: number;
}): Promise<FilaDeMensajeDeSala[]> {
    return conLasTablas(async () => {
        if (input.desde) {
            return db.$queryRawUnsafe<FilaDeMensajeDeSala[]>(
                `SELECT "id", "salaId", "deId", "autorNombre", "texto", "creadoEn"
                 FROM "sala_mensajes"
                 WHERE "salaId" = $1 AND "creadoEn" > $2
                 ORDER BY "creadoEn" ASC
                 LIMIT $3`,
                input.salaId,
                input.desde,
                input.tope,
            );
        }
        const ultimos = await db.$queryRawUnsafe<FilaDeMensajeDeSala[]>(
            `SELECT "id", "salaId", "deId", "autorNombre", "texto", "creadoEn"
             FROM "sala_mensajes"
             WHERE "salaId" = $1
             ORDER BY "creadoEn" DESC
             LIMIT $2`,
            input.salaId,
            input.tope,
        );
        return ultimos.reverse();
    });
}

/**
 * Olvidar el chat de una sala.
 *
 * Se llama al revocarla, junto con echar a la gente: revocar un enlace dejando
 * dentro la conversación sería media revocación. Y **no hay clave foránea**,
 * como en el resto de las tablas de la App, así que la limpieza es explícita o
 * no pasa.
 */
export async function olvidarLosMensajesDe(salaId: string): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        DELETE FROM "sala_mensajes" WHERE "salaId" = ${salaId}
    `);
}

/**
 * Barrer los chats de reuniones que ya no están vivas.
 *
 * Va con el mismo barrido que las señales viejas —una de cada veinte vueltas y
 * en su propio `try`— y por el mismo motivo: son mensajes de una conversación
 * que ya terminó, sin ningún sitio donde leerse. Se borran los de salas
 * revocadas o caducadas, y los sueltos de más de un día: **una sala sin
 * caducidad nunca está «caducada»**, así que sin esa segunda mitad su chat
 * crecería sin fin.
 */
export async function barrerLosChatsViejos(): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        DELETE FROM "sala_mensajes" m
        WHERE m."creadoEn" < NOW() - INTERVAL '1 day'
           OR EXISTS (
               SELECT 1 FROM "salas_de_video" s
               WHERE s."id" = m."salaId"
                 AND (s."revocadaEn" IS NOT NULL
                      OR (s."expiraEn" IS NOT NULL AND s."expiraEn" <= NOW()))
           )
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
            expiraEn: Date | null;
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
            // La misma regla que la puerta, y **la misma función**: revocada
            // o caducada, no vale. Escrita a mano aquí —que es como estaba—
            // se le olvidó el caso nuevo en cuanto `expiraEn` admitió nulos:
            // un enlace que no caduca se leía como caducado, o reventaba al
            // llamar a `getTime()` sobre un nulo.
            abierta: comoEstaLaSala(f) === "abierta",
            dentro: Number(f.dentro ?? 0),
        });
    }
    return mapa;
}

// ── Volver a la reunión después de un corte ─────────────────────────────────

/**
 * Devolver a alguien a la MISMA fila después de un corte de red.
 *
 * **No crea ninguna fila y no pasa por la puerta**, que es lo que distingue
 * esto de entrar: la fila ya existe y alguien de dentro la admitió en su
 * momento. Lo único que se deshace es el barrido que la sacó por dejar de dar
 * señales.
 *
 * Y por eso lleva dos condiciones que no se pueden ablandar:
 *
 * 1. **Solo si salió por silencio** (`sePuedeReanudar`). A quien echaron, o
 *    quien se fue por su pie, no se le devuelve solo.
 * 2. **Solo si cabe.** Mientras alguien estaba desconectado pueden haber
 *    entrado otros: volver sin mirar el tope metería a un quinto, y un quinto
 *    corta la reunión para **todos**, no solo para el que sobra. Quien ya
 *    consta dentro no cuenta contra el tope — es el mismo razonamiento de
 *    `entrarConCuenta` con quien recarga.
 *
 * Devuelve la fila si se pudo, `null` si no cabía, y `"no_procede"` cuando esa
 * fila no es de las que se reanudan. Son tres respuestas distintas a propósito:
 * quien llama tiene que poder decir «la reunión está llena» sin confundirlo con
 * «te sacaron».
 */
export async function reanudarEnLaSala(input: {
    salaId: string;
    participanteId: string;
}): Promise<FilaDeParticipante | null | "no_procede"> {
    return conLasTablas(() => db.$transaction(async (tx) => {
        await candadoDeLaSala(tx, input.salaId);

        const antes = await tx.$queryRawUnsafe<FilaDeParticipante[]>(
            `SELECT ${COLUMNAS_PARTICIPANTE} FROM "sala_participantes"
             WHERE "id" = $1 AND "salaId" = $2`,
            input.participanteId,
            input.salaId,
        );
        const fila = antes[0];
        if (!fila) return "no_procede" as const;
        // Ya está dentro: el corte fue corto y el barrido no llegó a sacarle.
        // No es un error — es el caso bueno, y se contesta que sí.
        if (fila.estado === "dentro") return fila;
        if (!sePuedeReanudar(fila.motivoDeSalida)) return "no_procede" as const;

        const n = await tx.$queryRawUnsafe<Array<{ n: bigint }>>(
            `SELECT COUNT(*)::bigint AS n FROM "sala_participantes"
             WHERE "salaId" = $1 AND "estado" = 'dentro'`,
            input.salaId,
        );
        if (Number(n[0]?.n ?? 0) >= TOPE_DE_LA_SALA) return null;

        const vuelve = await tx.$queryRawUnsafe<FilaDeParticipante[]>(
            `UPDATE "sala_participantes"
             SET "estado" = 'dentro', "vistoEn" = NOW(), "salidoEn" = NULL,
                 "motivoDeSalida" = NULL
             WHERE "id" = $1 AND "salaId" = $2
             RETURNING ${COLUMNAS_PARTICIPANTE}`,
            input.participanteId,
            input.salaId,
        );
        return vuelve[0] ?? ("no_procede" as const);
    }));
}

// ── Las grabaciones ─────────────────────────────────────────────────────────

export type FilaDeGrabacion = {
    id: string;
    salaId: string;
    cuentaId: string;
    salaTitulo: string | null;
    pedidaPorId: string;
    pedidaPorNombre: string;
    modo: string;
    estado: string;
    audioUrl: string | null;
    audioBytes: number;
    videoUrl: string | null;
    videoBytes: number;
    segundos: number;
    partesAudio: number;
    partesVideo: number;
    transcripcion: string | null;
    resumen: string | null;
    transcritaEn: Date | null;
    creadaEn: Date;
    terminadaEn: Date | null;
};

const COLUMNAS_GRABACION = `"id", "salaId", "cuentaId", "salaTitulo", "pedidaPorId",
                            "pedidaPorNombre", "modo", "estado", "audioUrl",
                            "audioBytes", "videoUrl", "videoBytes", "segundos",
                            "partesAudio", "partesVideo", "transcripcion", "resumen",
                            "transcritaEn", "creadaEn", "terminadaEn"`;

/**
 * Postgres devuelve un `BIGINT` como `BigInt`, que **no se puede serializar**.
 *
 * Una fila con un `BigInt` dentro cruzando la frontera de una acción de
 * servidor revienta con «Do not know how to serialize a BigInt», y ese error
 * sale al pintar la pantalla, lejísimos de la consulta que lo trajo. Se
 * convierte aquí, una vez, y no en cada sitio que lea una fila.
 */
function comoLlegaLaGrabacion(f: FilaDeGrabacion): FilaDeGrabacion {
    return {
        ...f,
        audioBytes: Number(f.audioBytes ?? 0),
        videoBytes: Number(f.videoBytes ?? 0),
        segundos: Number(f.segundos ?? 0),
        partesAudio: Number(f.partesAudio ?? 0),
        partesVideo: Number(f.partesVideo ?? 0),
    };
}

/**
 * Empezar a grabar: la fila, y la marca en la sala, **en una transacción**.
 *
 * Las dos a la vez porque a medias cada mitad miente: una fila sin la marca es
 * una grabación que nadie ve que está corriendo, y una marca sin fila es un
 * aviso rojo en la pantalla de todos sin nada detrás.
 *
 * Y el `WHERE "grabandoDesde" IS NULL` es lo que impide dos grabaciones a la
 * vez sobre la misma reunión: dos personas pulsando al mismo tiempo subirían
 * dos ficheros del mismo rato y la ficha enseñaría la reunión dos veces.
 */
export async function empezarLaGrabacion(input: {
    salaId: string;
    cuentaId: string;
    salaTitulo: string | null;
    pedidaPorId: string;
    pedidaPorNombre: string;
    modo: string;
}): Promise<FilaDeGrabacion | null> {
    const id = randomUUID();
    return conLasTablas(() => db.$transaction(async (tx) => {
        const tocadas = await tx.$executeRawUnsafe(
            `UPDATE "salas_de_video"
             SET "grabandoDesde" = NOW(), "grabandoVistoEn" = NOW(),
                 "grabacionId" = $2, "grabandoPor" = $3
             WHERE "id" = $1 AND "grabandoDesde" IS NULL`,
            input.salaId,
            id,
            input.pedidaPorNombre,
        );
        if (tocadas === 0) return null;

        const filas = await tx.$queryRawUnsafe<FilaDeGrabacion[]>(
            `INSERT INTO "grabaciones_de_reunion"
                 ("id", "salaId", "cuentaId", "salaTitulo", "pedidaPorId",
                  "pedidaPorNombre", "modo", "estado")
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'grabando')
             RETURNING ${COLUMNAS_GRABACION}`,
            id,
            input.salaId,
            input.cuentaId,
            input.salaTitulo,
            input.pedidaPorId,
            input.pedidaPorNombre,
            input.modo,
        );
        const fila = filas[0];
        return fila ? comoLlegaLaGrabacion(fila) : null;
    }));
}

/** Refrescar el latido de quien graba. Es lo que mantiene el aviso encendido. */
export async function latirGrabando(salaId: string, grabacionId: string): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        UPDATE "salas_de_video" SET "grabandoVistoEn" = NOW()
        WHERE "id" = ${salaId} AND "grabacionId" = ${grabacionId}
    `);
}

/** Apuntar una parte subida. El contador es lo que después las junta en orden. */
export async function apuntarLaParte(input: {
    grabacionId: string;
    cual: "audio" | "video";
    bytes: number;
}): Promise<number> {
    const columna = input.cual === "audio" ? "partesAudio" : "partesVideo";
    const bytesCol = input.cual === "audio" ? "audioBytes" : "videoBytes";
    const filas = await conLasTablas(() => db.$queryRawUnsafe<Array<{ n: number }>>(
        `UPDATE "grabaciones_de_reunion"
         SET "${columna}" = "${columna}" + 1, "${bytesCol}" = "${bytesCol}" + $2
         WHERE "id" = $1 AND "estado" = 'grabando'
         RETURNING "${columna}" AS n`,
        input.grabacionId,
        Math.max(0, Math.floor(input.bytes)),
    ));
    return Number(filas[0]?.n ?? 0);
}

/**
 * Cerrar la grabación: la fila, y soltar la sala, **en una transacción**.
 *
 * Soltar la sala es lo que deja volver a grabar. Sin ello, una grabación que
 * terminó dejaría la reunión marcada como «grabando» hasta que caducara la
 * marca, y el botón apagado todo ese rato.
 */
export async function cerrarLaGrabacion(input: {
    grabacionId: string;
    salaId: string;
    estado: "lista" | "fallida";
    segundos: number;
    audioUrl?: string | null;
    videoUrl?: string | null;
}): Promise<FilaDeGrabacion | null> {
    return conLasTablas(() => db.$transaction(async (tx) => {
        const filas = await tx.$queryRawUnsafe<FilaDeGrabacion[]>(
            `UPDATE "grabaciones_de_reunion"
             SET "estado" = $2, "segundos" = $3, "terminadaEn" = NOW(),
                 "audioUrl" = COALESCE($4, "audioUrl"),
                 "videoUrl" = COALESCE($5, "videoUrl")
             WHERE "id" = $1 AND "estado" = 'grabando'
             RETURNING ${COLUMNAS_GRABACION}`,
            input.grabacionId,
            input.estado,
            Math.max(0, Math.floor(input.segundos)),
            input.audioUrl ?? null,
            input.videoUrl ?? null,
        );
        await tx.$executeRawUnsafe(
            `UPDATE "salas_de_video"
             SET "grabandoDesde" = NULL, "grabandoVistoEn" = NULL,
                 "grabacionId" = NULL, "grabandoPor" = NULL
             WHERE "id" = $1 AND "grabacionId" = $2`,
            input.salaId,
            input.grabacionId,
        );
        const fila = filas[0];
        return fila ? comoLlegaLaGrabacion(fila) : null;
    }));
}

export async function laGrabacion(id: string): Promise<FilaDeGrabacion | null> {
    const filas = await conLasTablas(() => db.$queryRawUnsafe<FilaDeGrabacion[]>(
        `SELECT ${COLUMNAS_GRABACION} FROM "grabaciones_de_reunion" WHERE "id" = $1`,
        id,
    ));
    const fila = filas[0];
    return fila ? comoLlegaLaGrabacion(fila) : null;
}

/**
 * Lo que ocupan las grabaciones de una cuenta.
 *
 * Un `SUM`, no la suma de una lista: el cupo tiene que contar TODO lo que hay
 * en el bucket de esa cuenta, y una lista topada contaría lo que se pudo
 * cargar. Es la misma regla que «un contador es un `COUNT`, no un `length`».
 */
export async function loQueOcupanLasGrabaciones(cuentaId: string): Promise<number> {
    const filas = await conLasTablas(() => db.$queryRaw<Array<{ n: bigint | null }>>`
        SELECT COALESCE(SUM("audioBytes" + "videoBytes"), 0)::bigint AS n
        FROM "grabaciones_de_reunion"
        WHERE "cuentaId" = ${cuentaId}
    `);
    return Number(filas[0]?.n ?? 0);
}

/** Las grabaciones de un puñado de salas, en UNA consulta y no una por fila. */
export async function lasGrabacionesDeLasSalas(
    salaIds: string[],
): Promise<Map<string, FilaDeGrabacion[]>> {
    const unicos = [...new Set(salaIds.filter(Boolean))];
    const mapa = new Map<string, FilaDeGrabacion[]>();
    if (!unicos.length) return mapa;
    const filas = await conLasTablas(() => db.$queryRawUnsafe<FilaDeGrabacion[]>(
        `SELECT ${COLUMNAS_GRABACION} FROM "grabaciones_de_reunion"
         WHERE "salaId" = ANY($1::text[])
         ORDER BY "creadaEn" ASC`,
        unicos,
    ));
    for (const cruda of filas) {
        const f = comoLlegaLaGrabacion(cruda);
        const lista = mapa.get(f.salaId);
        if (lista) lista.push(f);
        else mapa.set(f.salaId, [f]);
    }
    return mapa;
}

/** Guardar el texto y el resumen. Una sola escritura, después de cobrar nada. */
export async function guardarLaTranscripcionDeLaReunion(input: {
    grabacionId: string;
    texto: string;
    resumen: string | null;
}): Promise<boolean> {
    const tocadas = await conLasTablas(() => db.$executeRaw`
        UPDATE "grabaciones_de_reunion"
        SET "transcripcion" = ${input.texto}, "resumen" = ${input.resumen},
            "transcritaEn" = NOW()
        WHERE "id" = ${input.grabacionId} AND "transcripcion" IS NULL
    `);
    return tocadas > 0;
}

/**
 * Las que ya caducaron, para borrarlas del bucket y de la tabla.
 *
 * Devuelve la fila entera porque quien barre necesita **las direcciones** para
 * borrar los ficheros: una fila que se va sin su fichero deja el giga en el
 * bucket para siempre y nadie sabe de dónde salió.
 */
export async function lasGrabacionesCaducadas(dias: number, tope: number): Promise<FilaDeGrabacion[]> {
    const filas = await conLasTablas(() => db.$queryRawUnsafe<FilaDeGrabacion[]>(
        `SELECT ${COLUMNAS_GRABACION} FROM "grabaciones_de_reunion"
         WHERE "creadaEn" < NOW() - make_interval(days => $1::int)
           AND ("audioUrl" IS NOT NULL OR "videoUrl" IS NOT NULL)
         ORDER BY "creadaEn" ASC
         LIMIT $2`,
        Math.max(1, Math.floor(dias)),
        Math.max(1, Math.floor(tope)),
    ));
    return filas.map(comoLlegaLaGrabacion);
}

/**
 * Olvidar los ficheros de una grabación caducada, **conservando el texto**.
 *
 * La fila NO se borra: la transcripción y el resumen son lo que alguien va a
 * buscar de una reunión de hace seis meses, ocupan texto, y tirarlos con el
 * audio sería perder lo barato por culpa de lo caro. Lo que se pone a cero son
 * las direcciones y los bytes — que es además lo que devuelve el cupo.
 */
export async function olvidarLosFicheros(grabacionId: string): Promise<void> {
    await conLasTablas(() => db.$executeRaw`
        UPDATE "grabaciones_de_reunion"
        SET "audioUrl" = NULL, "videoUrl" = NULL, "audioBytes" = 0, "videoBytes" = 0,
            "estado" = 'caducada'
        WHERE "id" = ${grabacionId}
    `);
}

/**
 * Las que se quedaron en `grabando` porque la pestaña que grababa se cerró.
 *
 * Se marcan como fallidas y sueltan su sala: sin esto, esa reunión no podría
 * volver a grabarse nunca —`empezarLaGrabacion` exige `grabandoDesde IS NULL`—
 * y su fila se quedaría contando bytes de un fichero que nunca se juntó.
 */
export async function cerrarLasGrabacionesColgadas(horas: number): Promise<number> {
    return conLasTablas(async () => {
        const idas = await db.$queryRawUnsafe<Array<{ id: string; salaId: string }>>(
            `UPDATE "grabaciones_de_reunion"
             SET "estado" = 'fallida', "terminadaEn" = NOW()
             WHERE "estado" = 'grabando'
               AND "creadaEn" < NOW() - make_interval(hours => $1::int)
             RETURNING "id", "salaId"`,
            Math.max(1, Math.floor(horas)),
        );
        for (const f of idas) {
            await db.$executeRawUnsafe(
                `UPDATE "salas_de_video"
                 SET "grabandoDesde" = NULL, "grabandoVistoEn" = NULL,
                     "grabacionId" = NULL, "grabandoPor" = NULL
                 WHERE "id" = $1 AND "grabacionId" = $2`,
                f.salaId,
                f.id,
            );
        }
        return idas.length;
    });
}
