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

// ── Escribir ─────────────────────────────────────────────────────────────────

export async function crearElTicket(input: {
  id: string;
  clienteId: string;
  creadoPorId: string;
  destinoId: string;
  titulo: string;
  descripcion: string;
  whatsapp: string;
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
          ("id", "clienteId", "creadoPorId", "destinoId", "titulo", "descripcion", "whatsapp", "estado")
        VALUES (
          ${input.id}, ${input.clienteId}, ${input.creadoPorId}, ${input.destinoId},
          ${input.titulo}, ${input.descripcion}, ${input.whatsapp}, 'recibido'
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
  clienteNombre?: string | null;
};

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
    clienteNombre: f.clienteNombre ?? null,
  };
}

/** Cuántos caben en una pantalla. Sin tope, una cuenta vieja los trae todos. */
export const TOPE_DE_TICKETS = 300;

/** Los tickets de una cuenta cliente: lo que ve en «Mis tickets». */
export async function losTicketsDelCliente(clienteId: string): Promise<Ticket[]> {
  return conLasTablas(async () => {
    const filas = await db.$queryRaw<FilaDeTicket[]>`
      SELECT "id", "clienteId", "destinoId", "titulo", "descripcion", "whatsapp",
             "estado", "motivoDescarte", "creadoEn", "actualizadoEn", "avisadoEn"
      FROM "tickets_de_soporte"
      WHERE "clienteId" = ${clienteId}
      ORDER BY "creadoEn" DESC
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
      SELECT t."id", t."clienteId", t."destinoId", t."titulo", t."descripcion",
             t."whatsapp", t."estado", t."motivoDescarte", t."creadoEn",
             t."actualizadoEn", t."avisadoEn",
             COALESCE(NULLIF(TRIM(u."name"), ''), u."email") AS "clienteNombre"
      FROM "tickets_de_soporte" t
      LEFT JOIN "User" u ON u."id" = t."clienteId"
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
      SELECT "id", "clienteId", "destinoId", "titulo", "descripcion", "whatsapp",
             "estado", "motivoDescarte", "creadoEn", "actualizadoEn", "avisadoEn"
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
