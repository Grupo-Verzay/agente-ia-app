import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  comoEstadoDeTicket,
  type EstadoDeTicket,
  type Ticket,
} from "@/lib/tickets";
import {
  TIPOS_DE_ADJUNTO,
  type TipoDeAdjunto,
} from "@/lib/adjuntos-de-tarea-tipos";

/**
 * Los tickets de soporte: sus tres tablas y cómo se leen.
 *
 * ## Por qué tablas nuestras y no `tasks`
 *
 * **Las migraciones son del BACKEND** (`docs/db-migrations-ownership.md`), y
 * `tasks` y `projects` son suyas: añadirles una columna desde aquí es lo que
 * reventó el #360. Así que van como `work_folders`, `flows` y
 * `task_attachments` —tabla de la App, creada por la App con
 * `CREATE TABLE IF NOT EXISTS`— y sin ninguna clave foránea.
 *
 * Y aunque `tasks` fuera nuestra, tampoco: **un ticket no es una tarea de
 * Proyectos**. Colgarlo de `tasks` lo metería en el tablero interno, en el
 * reparto del trabajo y en los avisos de tarea, y el encargo dice justo lo
 * contrario — «el cliente nunca entra a Proyectos» —. Una fila de más en la
 * tabla equivocada no se ve como un error: se ve como un proyecto fantasma que
 * nadie sabe de dónde salió.
 *
 * ## El id es TEXTO
 *
 * Un `uuid` y no un autoincremento, porque el id viaja al navegador del cliente
 * y un entero correlativo le dice cuántos tickets ha abierto la plataforma
 * entera.
 */

/** Los adjuntos de un ticket, tal y como los pintan las dos pantallas. */
export type AdjuntoDeTicket = {
  id: string;
  ticketId: string;
  url: string;
  nombre: string;
  tipo: TipoDeAdjunto;
  mimeType: string | null;
  tamanoBytes: number | null;
};

/** Cuántos archivos admite un ticket. El mismo número que una tarea. */
export { TOPE_DE_ADJUNTOS_POR_TAREA as TOPE_DE_ADJUNTOS_POR_TICKET } from "@/lib/adjuntos-de-tarea-tipos";

let tablasListas: Promise<void> | null = null;

/**
 * Crea las tres tablas si no están.
 *
 * El recuerdo de «ya las creé» es **del proceso, no de la base**: si las tablas
 * desaparecen por debajo —una restauración, un entorno recién levantado— el
 * recuerdo seguiría diciendo que existen. Por eso quien lee pasa por
 * `conLasTablas`, que ante un `42P01` lo olvida y reintenta una vez.
 */
function asegurarLasTablas(): Promise<void> {
  tablasListas ??= (async () => {
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "tickets_de_soporte" (
        "id" TEXT PRIMARY KEY,
        -- La CUENTA del cliente, no la persona: el ticket es de la cuenta y lo
        -- ven todos los suyos.
        "clienteId" TEXT NOT NULL,
        -- Quien lo escribio. Solo informativo.
        "creadoPorId" TEXT NOT NULL,
        -- La cuenta de administrador que lo recibe. Se copia AQUI, no se
        -- resuelve al leer: si algun dia cambia el destino, los tickets ya
        -- abiertos se quedan con quien los estaba atendiendo.
        "destinoId" TEXT NOT NULL,
        "titulo" TEXT NOT NULL,
        "descripcion" TEXT NOT NULL,
        "whatsapp" TEXT NOT NULL,
        "estado" TEXT NOT NULL DEFAULT 'recibido',
        "motivoDescarte" TEXT,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        -- Cuando salio el WhatsApp de resuelto. Nulo = todavia no.
        "avisadoEn" TIMESTAMP(3)
      )
    `;
    // Quien lo atiende, de la cuenta de destino. Entra con ALTER y no
    // reescribiendo el CREATE de arriba: la tabla YA existe en produccion y un
    // `CREATE TABLE IF NOT EXISTS` no toca una tabla que ya esta — es el fallo
    // que se comete solo al anadirle una columna a una tabla de la App ya
    // desplegada.
    await db.$executeRaw`
      ALTER TABLE "tickets_de_soporte" ADD COLUMN IF NOT EXISTS "responsableId" TEXT
    `;
    // Cuando hay que tenerlo resuelto. NULO = sin vencimiento, que es lo normal
    // y por eso es opcional de verdad: la mayoria de los tickets no se
    // comprometen a una fecha, y obligar a poner una llenaria el tablero de
    // fechas inventadas que despues avisan.
    //
    // Va con ALTER y no reescribiendo el CREATE de arriba, por lo mismo que
    // `responsableId`: la tabla YA existe en produccion y un
    // `CREATE TABLE IF NOT EXISTS` no toca una tabla que ya esta.
    await db.$executeRaw`
      ALTER TABLE "tickets_de_soporte" ADD COLUMN IF NOT EXISTS "venceEl" TIMESTAMP(3)
    `;
    // El trabajo diario busca por fecha en TODAS las cuentas, asi que no puede
    // entrar por ninguno de los dos indices de arriba, que empiezan por cuenta.
    // Parcial: las filas sin vencimiento son la mayoria y no se miran nunca.
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "tickets_de_soporte_vence_idx"
      ON "tickets_de_soporte" ("venceEl")
      WHERE "venceEl" IS NOT NULL
    `;
    // Las dos pantallas: la del cliente entra por su cuenta, la del
    // administrador por el destino. Las dos ordenan por fecha, asi que va
    // dentro del indice y no como un ordenamiento aparte.
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "tickets_de_soporte_cliente_idx"
      ON "tickets_de_soporte" ("clienteId", "creadoEn" DESC)
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "tickets_de_soporte_destino_idx"
      ON "tickets_de_soporte" ("destinoId", "creadoEn" DESC)
    `;

    // ── Lo que trae un ticket de la FICHA PÚBLICA ───────────────────────────
    //
    // Los cuatro entran con ALTER y no reescribiendo el CREATE de arriba, por
    // lo mismo que `responsableId` y `venceEl`: la tabla YA existe en
    // produccion y un `CREATE TABLE IF NOT EXISTS` no toca una que ya esta.
    //
    // `origen` NULO es «lo abrio alguien con cuenta», que es como nacieron
    // todos los tickets de antes: sin backfill y sin dos clases de ticket. Lo
    // unico que lo distingue es esa marca.
    await db.$executeRaw`
      ALTER TABLE "tickets_de_soporte" ADD COLUMN IF NOT EXISTS "origen" TEXT
    `;
    // Quien lo escribio, tal y como lo tecleo. Se COPIA aqui y no se resuelve
    // al leer: el lead se puede renombrar o borrar, y el ticket tiene que
    // seguir diciendo quien lo abrio.
    await db.$executeRaw`
      ALTER TABLE "tickets_de_soporte" ADD COLUMN IF NOT EXISTS "contactoNombre" TEXT
    `;
    // Y el lead al que quedo enganchado, si habia linea con la que engancharlo.
    // NULO es un dato: «no se pudo», no «no se intento».
    await db.$executeRaw`
      ALTER TABLE "tickets_de_soporte" ADD COLUMN IF NOT EXISTS "sessionId" INTEGER
    `;

    // El enlace publico de cada cuenta: UNO y permanente, como el de una sala
    // de video. La llave es la cuenta, asi que no puede haber dos.
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "tickets_enlace_publico" (
        "cuentaId" TEXT PRIMARY KEY,
        "codigo" TEXT NOT NULL UNIQUE,
        -- Apagarlo sin perder el codigo: volver a encenderlo devuelve el MISMO
        -- enlace, que es el que la cuenta ya repartio entre sus clientes.
        "activo" BOOLEAN NOT NULL DEFAULT TRUE,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "ticket_attachments" (
        "id" TEXT PRIMARY KEY,
        "ticketId" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "nombre" TEXT NOT NULL,
        "tipo" TEXT NOT NULL,
        "mimeType" TEXT,
        "tamanoBytes" BIGINT,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "ticket_attachments_ticket_idx"
      ON "ticket_attachments" ("ticketId")
    `;

    // El destino: una sola fila, como `site_config`. No va EN `site_config`
    // porque esa tabla es del backend.
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "tickets_config" (
        "id" INTEGER PRIMARY KEY,
        "destinoId" TEXT,
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
  // (`P2010`) y el de Postgres viaja dentro, en `meta.code`. Preguntar solo por
  // el de arriba es lo que dejó el reintento de `task_comments` sin dispararse
  // nunca. Se miran los dos sitios, y el texto.
  const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
  if (e?.code === "42P01" || e?.meta?.code === "42P01") return true;
  return String(e?.message ?? "").includes("42P01");
}

/** Corre algo contra las tablas, creándolas si hicieran falta. Una sola vez. */
async function conLasTablas<T>(hacer: () => Promise<T>): Promise<T> {
  await asegurarLasTablas();
  try {
    return await hacer();
  } catch (error) {
    if (!faltaLaTabla(error)) throw error;
    // Estaban y ya no: se olvida el recuerdo, se crean y se reintenta. UNA vez:
    // si tampoco va la segunda, el problema no era que faltara la tabla.
    tablasListas = null;
    await asegurarLasTablas();
    return hacer();
  }
}

// ── El destino ───────────────────────────────────────────────────────────────

/**
 * A qué cuenta caen los tickets nuevos.
 *
 * `null` = nadie lo ha configurado. **No se inventa un destino**: mandar los
 * tickets a la primera cuenta admin que aparezca sería elegir por alguien que
 * no lo ha pedido, y el cliente creería que su solicitud llegó a donde no fue.
 * El botón no se pinta y el formulario lo dice.
 */
export async function elDestinoDeLosTickets(): Promise<string | null> {
  try {
    return await conLasTablas(async () => {
      const filas = await db.$queryRaw<Array<{ destinoId: string | null }>>`
        SELECT "destinoId" FROM "tickets_config" WHERE "id" = 1
      `;
      return filas[0]?.destinoId?.trim() || null;
    });
  } catch (error) {
    console.warn("[tickets] no se pudo leer el destino", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function guardarElDestino(destinoId: string | null): Promise<void> {
  await conLasTablas(async () => {
    await db.$executeRaw`
      INSERT INTO "tickets_config" ("id", "destinoId", "actualizadoEn")
      VALUES (1, ${destinoId}, CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO UPDATE
      SET "destinoId" = EXCLUDED."destinoId",
          "actualizadoEn" = CURRENT_TIMESTAMP
    `;
  });
}

// ── El enlace público de cada cuenta ─────────────────────────────────────────

/**
 * El código del enlace: 16 caracteres de `base64url` sobre 12 bytes de azar.
 *
 * `base64url` y no `base64` porque esto va **en una URL** que se manda por
 * WhatsApp, y un `+` o un `/` dentro se escapan por el camino. Noventa y seis
 * bits: no se adivina, y es corto de leer en un mensaje.
 *
 * Y es **permanente**, como el de una sala: la cuenta lo reparte una vez entre
 * sus clientes y no puede cambiar debajo de ellos. Apagar el módulo lo deja
 * inactivo; volver a encenderlo devuelve el mismo.
 */
function unCodigoDeEnlace(): string {
  return randomBytes(12).toString("base64url");
}

export type EnlaceDeTickets = { cuentaId: string; codigo: string; activo: boolean };

/** El enlace de una cuenta, **creándolo si todavía no tiene**. */
export async function asegurarElEnlace(cuentaId: string): Promise<EnlaceDeTickets> {
  return conLasTablas(async () => {
    // `DO NOTHING` y no `DO UPDATE`: dos pestañas abriendo el tablero a la vez
    // no pueden darle dos códigos a la misma cuenta, y el primero es el bueno
    // porque puede estar ya repartido.
    await db.$executeRaw`
      INSERT INTO "tickets_enlace_publico" ("cuentaId", "codigo")
      VALUES (${cuentaId}, ${unCodigoDeEnlace()})
      ON CONFLICT ("cuentaId") DO NOTHING
    `;
    const filas = await db.$queryRaw<Array<{ codigo: string; activo: boolean }>>`
      SELECT "codigo", "activo" FROM "tickets_enlace_publico" WHERE "cuentaId" = ${cuentaId}
    `;
    return {
      cuentaId,
      codigo: filas[0]?.codigo ?? "",
      activo: filas[0]?.activo ?? false,
    };
  });
}

/** El enlace de una cuenta, sin crearlo. `null` = todavía no tiene. */
export async function elEnlaceDeLaCuenta(cuentaId: string): Promise<EnlaceDeTickets | null> {
  return conLasTablas(async () => {
    const filas = await db.$queryRaw<Array<{ codigo: string; activo: boolean }>>`
      SELECT "codigo", "activo" FROM "tickets_enlace_publico" WHERE "cuentaId" = ${cuentaId}
    `;
    return filas[0] ? { cuentaId, codigo: filas[0].codigo, activo: filas[0].activo } : null;
  });
}

/**
 * De qué cuenta es un código, **y solo si está activo**.
 *
 * Es la única puerta de la ficha pública: de aquí sale a qué bandeja cae el
 * ticket y en qué carpeta del bucket se escriben sus archivos. Nunca se coge
 * ninguna de las dos cosas de lo que mande el navegador.
 */
export async function laCuentaDelCodigo(codigo: string): Promise<string | null> {
  const limpio = String(codigo ?? "").trim();
  // Un código vacío no se consulta: `WHERE "codigo" = ''` no devolvería nada,
  // pero es una consulta por cada visita a una URL mal pegada.
  if (!limpio) return null;
  return conLasTablas(async () => {
    const filas = await db.$queryRaw<Array<{ cuentaId: string }>>`
      SELECT "cuentaId" FROM "tickets_enlace_publico"
      WHERE "codigo" = ${limpio} AND "activo" = TRUE
    `;
    return filas[0]?.cuentaId ?? null;
  });
}

/** Encender o apagar el enlace sin perderlo. */
export async function cambiarElEnlace(cuentaId: string, activo: boolean): Promise<void> {
  await conLasTablas(async () => {
    await db.$executeRaw`
      UPDATE "tickets_enlace_publico" SET "activo" = ${activo} WHERE "cuentaId" = ${cuentaId}
    `;
  });
}

// ── Escribir ─────────────────────────────────────────────────────────────────

export async function crearElTicket(input: {
  id: string;
  clienteId: string;
  creadoPorId: string;
  destinoId: string;
  titulo: string;
  descripcion: string;
  whatsapp: string;
  /** Quién lo atiende. Nulo = sin asignar, que es lo normal al abrirlo. */
  responsableId: string | null;
  /** Cuándo hay que tenerlo resuelto. Nulo = sin vencimiento. */
  venceEl: Date | null;
  /**
   * De dónde vino. **Nulo = lo abrió alguien con cuenta**, que es como nacieron
   * todos los de antes; `'publico'` = entró por el enlace de la cuenta.
   */
  origen?: string | null;
  /** Cómo se llama quien lo abrió por el enlace. Solo con `origen`. */
  contactoNombre?: string | null;
  /** El lead al que quedó enganchado. Nulo = no se pudo enganchar. */
  sessionId?: number | null;
  adjuntos: Array<{
    id: string;
    url: string;
    nombre: string;
    tipo: TipoDeAdjunto;
    mimeType: string | null;
    tamanoBytes: number | null;
  }>;
}): Promise<void> {
  await conLasTablas(async () => {
    // El ticket y sus adjuntos, **en la misma transacción**. Si los adjuntos
    // fallaran por fuera quedaría un ticket que dice «mira la captura» sin
    // captura, y el cliente no tiene forma de volver a subirla.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "tickets_de_soporte"
          ("id", "clienteId", "creadoPorId", "destinoId", "titulo", "descripcion",
           "whatsapp", "estado", "responsableId", "venceEl",
           "origen", "contactoNombre", "sessionId")
        VALUES (
          ${input.id}, ${input.clienteId}, ${input.creadoPorId}, ${input.destinoId},
          ${input.titulo}, ${input.descripcion}, ${input.whatsapp}, 'recibido',
          ${input.responsableId}, ${input.venceEl},
          ${input.origen ?? null}, ${input.contactoNombre ?? null}, ${input.sessionId ?? null}
        )
      `;
      for (const a of input.adjuntos) {
        await tx.$executeRaw`
          INSERT INTO "ticket_attachments"
            ("id", "ticketId", "url", "nombre", "tipo", "mimeType", "tamanoBytes")
          VALUES (
            ${a.id}, ${input.id}, ${a.url}, ${a.nombre}, ${a.tipo},
            ${a.mimeType}, ${a.tamanoBytes}
          )
        `;
      }
    });
  });
}

/**
 * Cambia el estado, **solo si sigue en el que se creía**.
 *
 * El `AND "estado" = ${antes}` no es de adorno: dos administradores mirando la
 * misma lista pueden resolver el mismo ticket a la vez, y sin esa condición
 * salen **dos WhatsApps** al cliente por un solo cierre. Devuelve si se cambió
 * de verdad, y quien llama solo avisa cuando fue que sí.
 */
export async function cambiarElEstado(input: {
  id: string;
  destinoId: string;
  antes: EstadoDeTicket;
  despues: EstadoDeTicket;
  motivoDescarte: string | null;
}): Promise<boolean> {
  return conLasTablas(async () => {
    const tocadas = await db.$executeRaw`
      UPDATE "tickets_de_soporte"
      SET "estado" = ${input.despues},
          "motivoDescarte" = ${input.motivoDescarte},
          "actualizadoEn" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.id}
        AND "destinoId" = ${input.destinoId}
        AND "estado" = ${input.antes}
    `;
    return tocadas > 0;
  });
}

/**
 * Cambia quién lo atiende.
 *
 * Va acotado por `destinoId` como todo lo demás: el id del ticket llega del
 * navegador y no decide de quién es.
 */
export async function asignarElResponsable(input: {
  id: string;
  destinoId: string;
  responsableId: string | null;
}): Promise<boolean> {
  return conLasTablas(async () => {
    const tocadas = await db.$executeRaw`
      UPDATE "tickets_de_soporte"
      SET "responsableId" = ${input.responsableId},
          "actualizadoEn" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.id} AND "destinoId" = ${input.destinoId}
    `;
    return tocadas > 0;
  });
}

/**
 * Cambia cuándo vence, o se lo quita.
 *
 * Acotado por `destinoId` como el resto: el id llega del navegador y no decide
 * de quién es el ticket. Y `null` es un valor legítimo —quitarle la fecha—, no
 * un «no tocar»: por eso el parámetro no es opcional.
 */
export async function ponerElVencimiento(input: {
  id: string;
  destinoId: string;
  venceEl: Date | null;
}): Promise<boolean> {
  return conLasTablas(async () => {
    const tocadas = await db.$executeRaw`
      UPDATE "tickets_de_soporte"
      SET "venceEl" = ${input.venceEl},
          "actualizadoEn" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.id} AND "destinoId" = ${input.destinoId}
    `;
    return tocadas > 0;
  });
}

/** Sella que el aviso salió. Nunca vuelve a salir por el mismo cierre. */
export async function sellarElAviso(id: string): Promise<void> {
  await conLasTablas(async () => {
    await db.$executeRaw`
      UPDATE "tickets_de_soporte" SET "avisadoEn" = CURRENT_TIMESTAMP WHERE "id" = ${id}
    `;
  });
}

// ── Leer ─────────────────────────────────────────────────────────────────────

type FilaDeTicket = {
  id: string;
  clienteId: string;
  destinoId: string;
  titulo: string;
  descripcion: string;
  whatsapp: string;
  estado: string;
  motivoDescarte: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
  avisadoEn: Date | null;
  responsableId: string | null;
  venceEl: Date | null;
  origen: string | null;
  contactoNombre: string | null;
  sessionId: number | null;
  clienteNombre?: string | null;
  responsableNombre?: string | null;
};

/**
 * Las columnas de un ticket, **escritas una sola vez**.
 *
 * Eran tres listas copiadas —«Mis tickets», la del administrador y el ticket
 * suelto— y con `venceEl` habría que tocar las tres, que es exactamente la
 * forma de que a la cuarta se le olvide. Ya pasó en el chat del equipo: al
 * unificar sus cinco listas aparecieron dos consultas a las que les faltaban
 * las columnas de la llamada, y nadie lo había visto.
 *
 * Con alias (`t.`) porque dos de los tres lectores hacen `JOIN` con `User`.
 */
const LAS_COLUMNAS = (t: string) => Prisma.raw(
  [
    "id", "clienteId", "destinoId", "titulo", "descripcion", "whatsapp",
    "estado", "motivoDescarte", "creadoEn", "actualizadoEn", "avisadoEn",
    "responsableId", "venceEl", "origen", "contactoNombre", "sessionId",
  ]
    .map((c) => `${t}"${c}"`)
    .join(", "),
);

function comoTicket(f: FilaDeTicket): Ticket {
  return {
    id: f.id,
    clienteId: f.clienteId,
    destinoId: f.destinoId,
    titulo: f.titulo,
    descripcion: f.descripcion,
    whatsapp: f.whatsapp,
    // Se vuelve a filtrar al LEER: una fila rara —escrita a mano, o de antes de
    // que existiera la comprobación— saldría con un estado que la pantalla no
    // sabe pintar y dejaría la lista en blanco.
    estado: comoEstadoDeTicket(f.estado) ?? "recibido",
    motivoDescarte: f.motivoDescarte,
    creadoEn: f.creadoEn.toISOString(),
    actualizadoEn: f.actualizadoEn.toISOString(),
    avisadoEn: f.avisadoEn ? f.avisadoEn.toISOString() : null,
    responsableId: f.responsableId ?? null,
    venceEl: f.venceEl ? f.venceEl.toISOString() : null,
    // Se vuelve a filtrar al LEER, igual que el estado: una fila con un origen
    // que la pantalla no conoce saldría como pública sin serlo, y el tablero la
    // pintaría con un nombre de contacto que no existe.
    origen: f.origen === "publico" ? "publico" : null,
    contactoNombre: f.contactoNombre?.trim() || null,
    sessionId: f.sessionId ?? null,
    // De quién es, para la lista del administrador. En uno que entró por el
    // enlace **manda el nombre que tecleó el contacto**: el `JOIN` con `User`
    // devolvería el nombre de la cuenta que lo recibe, o sea el suyo propio en
    // todas las filas.
    clienteNombre: f.contactoNombre?.trim() || f.clienteNombre || null,
    responsableNombre: f.responsableNombre ?? null,
  };
}

/** Cuántos caben en una pantalla. Sin tope, una cuenta vieja los trae todos. */
export const TOPE_DE_TICKETS = 300;

/**
 * Los tickets de una cuenta cliente: lo que ve en «Mis tickets».
 *
 * **Los que entraron por su enlace público NO salen aquí**, y es la mitad que
 * se olvida. Un ticket público se archiva bajo la cuenta dueña del enlace
 * —`clienteId` y `destinoId` son la misma—, así que sin el filtro le aparecería
 * a esa cuenta en las dos pantallas: en su tablero, que es donde toca, y en
 * «Mis tickets», que es «lo que YO le pedí a mi proveedor». Dos sitios para lo
 * mismo, y uno de los dos mintiendo.
 */
export async function losTicketsDelCliente(clienteId: string): Promise<Ticket[]> {
  return conLasTablas(async () => {
    const filas = await db.$queryRaw<FilaDeTicket[]>`
      SELECT ${LAS_COLUMNAS('t.')},
             COALESCE(NULLIF(TRIM(u."name"), ''), u."email") AS "responsableNombre"
      FROM "tickets_de_soporte" t
      LEFT JOIN "User" u ON u."id" = t."responsableId"
      WHERE t."clienteId" = ${clienteId}
        AND t."origen" IS DISTINCT FROM 'publico'
      ORDER BY t."creadoEn" DESC
      LIMIT ${TOPE_DE_TICKETS}
    `;
    return filas.map(comoTicket);
  });
}

/**
 * Los tickets que recibe una cuenta de administrador.
 *
 * El nombre del cliente se trae con un `LEFT JOIN`, no con una consulta por
 * fila: una lista de doscientos tickets serían doscientas consultas. Y **es
 * `LEFT`** a propósito: si la cuenta del cliente se eliminó, el ticket sigue
 * saliendo con su id, que es peor que con su nombre pero mucho mejor que
 * desaparecer.
 */
export async function losTicketsDelDestino(
  destinoId: string,
  estado: EstadoDeTicket | null,
): Promise<Ticket[]> {
  return conLasTablas(async () => {
    const filtro = estado
      ? Prisma.sql`AND t."estado" = ${estado}`
      : Prisma.empty;
    const filas = await db.$queryRaw<FilaDeTicket[]>`
      SELECT ${LAS_COLUMNAS('t.')},
             COALESCE(NULLIF(TRIM(u."name"), ''), u."email") AS "clienteNombre",
             COALESCE(NULLIF(TRIM(r."name"), ''), r."email") AS "responsableNombre"
      FROM "tickets_de_soporte" t
      LEFT JOIN "User" u ON u."id" = t."clienteId"
      LEFT JOIN "User" r ON r."id" = t."responsableId"
      WHERE t."destinoId" = ${destinoId}
      ${filtro}
      ORDER BY t."creadoEn" DESC
      LIMIT ${TOPE_DE_TICKETS}
    `;
    return filas.map(comoTicket);
  });
}

/** Cuántos hay de cada estado. Un `COUNT`, no el `length` de lo que se cargó. */
export async function contarPorEstado(
  destinoId: string,
): Promise<Record<string, number>> {
  return conLasTablas(async () => {
    const filas = await db.$queryRaw<Array<{ estado: string; cuantos: bigint }>>`
      SELECT "estado", COUNT(*)::bigint AS cuantos
      FROM "tickets_de_soporte"
      WHERE "destinoId" = ${destinoId}
      GROUP BY "estado"
    `;
    const cuenta: Record<string, number> = {};
    for (const f of filas) cuenta[f.estado] = Number(f.cuantos);
    return cuenta;
  });
}

/** Un ticket suelto, con su dueño y su destino, para poder comprobar quién es. */
export async function elTicket(id: string): Promise<Ticket | null> {
  return conLasTablas(async () => {
    const filas = await db.$queryRaw<FilaDeTicket[]>`
      SELECT ${LAS_COLUMNAS('')}
      FROM "tickets_de_soporte"
      WHERE "id" = ${id}
      LIMIT 1
    `;
    return filas[0] ? comoTicket(filas[0]) : null;
  });
}

/** Los adjuntos de varios tickets de una vez. Por lista, como los del tablero. */
export async function losAdjuntos(
  ticketIds: string[],
): Promise<Map<string, AdjuntoDeTicket[]>> {
  const ids = Array.from(new Set(ticketIds.filter(Boolean)));
  if (!ids.length) return new Map();

  try {
    return await conLasTablas(async () => {
      const filas = await db.$queryRaw<
        Array<{
          id: string;
          ticketId: string;
          url: string;
          nombre: string;
          tipo: string;
          mimeType: string | null;
          tamanoBytes: bigint | null;
        }>
      >`
        SELECT "id", "ticketId", "url", "nombre", "tipo", "mimeType", "tamanoBytes"
        FROM "ticket_attachments"
        WHERE "ticketId" IN (${Prisma.join(ids)})
        ORDER BY "creadoEn" ASC
      `;
      const porTicket = new Map<string, AdjuntoDeTicket[]>();
      for (const f of filas) {
        const adjunto: AdjuntoDeTicket = {
          id: f.id,
          ticketId: f.ticketId,
          url: f.url,
          nombre: f.nombre,
          tipo: (TIPOS_DE_ADJUNTO as readonly string[]).includes(f.tipo)
            ? (f.tipo as TipoDeAdjunto)
            : "document",
          mimeType: f.mimeType,
          // `BIGINT` no viaja a un componente de cliente.
          tamanoBytes: f.tamanoBytes === null ? null : Number(f.tamanoBytes),
        };
        const suyos = porTicket.get(f.ticketId);
        if (suyos) suyos.push(adjunto);
        else porTicket.set(f.ticketId, [adjunto]);
      }
      return porTicket;
    });
  } catch (error) {
    // Sin adjuntos el ticket se lee igual; sin aviso, no se sabe por qué faltan.
    console.warn("[tickets] no se pudieron leer los adjuntos", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}
