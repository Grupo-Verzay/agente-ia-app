import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  TOPE_DE_AVISOS,
  esTipoDeAviso,
  type AvisoDeTarea,
  type ComentarioDeTarea,
  type TipoDeAviso,
} from "@/lib/avisos-de-tarea-tipos";

/**
 * El hilo de una tarea y los avisos que salen de él.
 *
 * ## Por qué dos tablas nuestras y ninguna columna en `tasks`
 *
 * **Las migraciones son del BACKEND** (`api-webhook`). Añadirle una columna a
 * `tasks` desde la App es exactamente lo que reventó el #360. Así que van como
 * `task_attachments`, `work_folders` y `flows`: **tablas de la App, creadas por
 * la App** con `CREATE TABLE IF NOT EXISTS`, sin clave foránea contra `tasks`
 * —una `FOREIGN KEY` desde aquí ataría las dos migraciones—.
 *
 * ## Un aviso lleva DOS marcas, y no son la misma
 *
 * Hacen falta las dos porque el encargo pide dos cosas distintas:
 *
 * - **`atendidoEn`** es LEÍDO: el clic de la ventana emergente, abrir o cerrar.
 *   Decide si la ventana vuelve a salir y si el aviso sigue contando en la
 *   campanita.
 * - **`vistoEn`** es haber ABIERTO LA TAREA. Es lo único que quita el punto del
 *   tablero.
 *
 * Con una sola marca no se puede cumplir el encargo: cerrar la ventana calla el
 * aviso, pero no es haber leído la tarea, así que la tarjeta tiene que seguir
 * marcada. Por eso el clic de la ventana escribe solo `atendidoEn`, y **abrir
 * la tarea escribe las dos** —quien ya entró no necesita que le salte una
 * ventana por algo que ya leyó—.
 *
 * Y eso es además lo que cierra la ventana **en todas las pestañas y
 * dispositivos**: abrir la tarea en uno deja el aviso atendido en la base, y el
 * sondeo de los demás deja de traerlo en su vuelta siguiente.
 *
 * ## Y nada de esto puede tumbar lo que lo dispara
 *
 * Avisar es una mejora sobre una acción que ya funcionaba —crear una tarea,
 * darla por hecha—. Si el aviso falla, la tarea se crea igual: `crearLosAvisos`
 * no lanza, **pero tampoco es mudo**. Un aviso que no sale sin decirlo se ve
 * como «a mí nunca me llega nada», que es justo lo que se viene a arreglar.
 */

let tablasListas: Promise<void> | null = null;

function asegurarLasTablas(): Promise<void> {
  tablasListas ??= (async () => {
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "task_comments" (
        "id" TEXT PRIMARY KEY,
        "taskId" INTEGER NOT NULL,
        -- La cuenta se copia aqui para poder acotar sin unir con "tasks" en
        -- cada consulta, igual que en los adjuntos.
        "ownerId" TEXT NOT NULL,
        "autorId" TEXT NOT NULL,
        "autorNombre" TEXT,
        "texto" TEXT NOT NULL,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "task_comments_task_idx"
      ON "task_comments" ("taskId", "creadoEn")
    `;
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "task_alerts" (
        "id" TEXT PRIMARY KEY,
        "taskId" INTEGER NOT NULL,
        "projectId" INTEGER,
        "ownerId" TEXT NOT NULL,
        "destinatarioId" TEXT NOT NULL,
        "actorId" TEXT,
        "actorNombre" TEXT,
        "tipo" TEXT NOT NULL,
        "titulo" TEXT NOT NULL,
        "texto" TEXT,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        -- El clic obligatorio de la ventana emergente.
        "atendidoEn" TIMESTAMP(3),
        -- Abrio la tarea: quita el punto del tablero.
        "vistoEn" TIMESTAMP(3)
      )
    `;
    // El indice que usa el sondeo de la ventana emergente, que corre cada pocos
    // segundos por pestaña abierta: tiene que ser el mas barato de todos.
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "task_alerts_pendientes_idx"
      ON "task_alerts" ("destinatarioId", "atendidoEn")
    `;
    // El del punto del tablero: todos los avisos de unas tareas para una persona.
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "task_alerts_tarea_idx"
      ON "task_alerts" ("taskId", "destinatarioId")
    `;
  })().catch((error) => {
    tablasListas = null;
    throw error;
  });
  return tablasListas;
}

/**
 * `42P01` de Postgres: «relation does not exist».
 *
 * **Prisma no lo deja arriba.** En una consulta en crudo el `code` de primer
 * nivel es el suyo —`P2010`— y el de Postgres viaja dentro, en `meta.code`.
 * Mirar solo `error.code` no encuentra nunca el `42P01`, así que el reintento
 * no se dispara y vuelve justo el fallo que `conLasTablas` existe para evitar.
 *
 * Lo cazó el banco de pruebas borrando las tablas a mano: con la comprobación
 * ingenua, las ocho consultas siguientes se caían y ninguna se recuperaba.
 */
function esTablaQueFalta(error: unknown): boolean {
  const meta = (error as { meta?: { code?: string } } | null)?.meta;
  if (meta?.code === "42P01") return true;
  const texto = error instanceof Error ? error.message : String(error);
  return texto.includes("42P01");
}

/**
 * Hace algo contra estas tablas, creándolas si no están.
 *
 * El recuerdo de «ya las creé» es **del proceso, no de la base**: si las tablas
 * desaparecen por debajo —una restauración, un entorno recién levantado— el
 * recuerdo seguiría diciendo que existen y todas las consultas fallarían con
 * `42P01` hasta que alguien reiniciara el contenedor. Ante ese código se olvida,
 * se crean y se reintenta **una vez**: si tampoco va la segunda, el problema no
 * era que faltara la tabla.
 */
async function conLasTablas<T>(hacer: () => Promise<T>): Promise<T> {
  await asegurarLasTablas();
  try {
    return await hacer();
  } catch (error) {
    if (!esTablaQueFalta(error)) throw error;
    console.warn("[tareas] las tablas del hilo no estaban; se crean y se reintenta");
    tablasListas = null;
    await asegurarLasTablas();
    return hacer();
  }
}

// ─── Comentarios ─────────────────────────────────────────────────────────────

export async function leerLosComentarios(taskId: number): Promise<ComentarioDeTarea[]> {
  return conLasTablas(async () => {
    const filas = await db.$queryRaw<
      Array<{
        id: string;
        taskId: number;
        autorId: string;
        autorNombre: string | null;
        texto: string;
        creadoEn: Date;
      }>
    >`
      SELECT "id", "taskId", "autorId", "autorNombre", "texto", "creadoEn"
      FROM "task_comments"
      WHERE "taskId" = ${taskId}
      ORDER BY "creadoEn" ASC
    `;
    return filas.map((f) => ({
      id: f.id,
      taskId: Number(f.taskId),
      autorId: f.autorId,
      autorNombre: f.autorNombre,
      texto: f.texto,
      creadoEn: f.creadoEn.toISOString(),
    }));
  });
}

export async function guardarUnComentario(input: {
  id: string;
  taskId: number;
  ownerId: string;
  autorId: string;
  autorNombre: string | null;
  texto: string;
}): Promise<void> {
  await conLasTablas(() => db.$executeRaw`
    INSERT INTO "task_comments"
      ("id", "taskId", "ownerId", "autorId", "autorNombre", "texto")
    VALUES (
      ${input.id}, ${input.taskId}, ${input.ownerId},
      ${input.autorId}, ${input.autorNombre}, ${input.texto}
    )
  `);
}

/** Quiénes han escrito ya en esta tarea. Parte de «los implicados». */
export async function quienesHanComentado(taskId: number): Promise<string[]> {
  return conLasTablas(async () => {
    const filas = await db.$queryRaw<Array<{ autorId: string }>>`
      SELECT DISTINCT "autorId" FROM "task_comments" WHERE "taskId" = ${taskId}
    `;
    return filas.map((f) => f.autorId);
  });
}

// ─── Avisos ──────────────────────────────────────────────────────────────────

export type AvisoPorGuardar = {
  id: string;
  taskId: number;
  projectId: number | null;
  ownerId: string;
  destinatarioId: string;
  actorId: string | null;
  actorNombre: string | null;
  tipo: TipoDeAviso;
  titulo: string;
  texto: string | null;
};

/**
 * Guarda una tanda de avisos. **No lanza nunca**: lo que la dispara —crear la
 * tarea, darla por hecha, comentar— ya se hizo y no puede deshacerse porque el
 * aviso falle. Pero deja rastro, que no es lo mismo que callarse.
 */
export async function crearLosAvisos(avisos: AvisoPorGuardar[]): Promise<number> {
  // A uno mismo no se le avisa de lo que acaba de hacer, y a nadie dos veces
  // por lo mismo: en un comentario la misma persona puede ser la asignada, la
  // que creó la tarea y una de las que ya habían escrito.
  const vistos = new Set<string>();
  const pendientes = avisos.filter((a) => {
    if (!a.destinatarioId || a.destinatarioId === a.actorId) return false;
    const llave = `${a.taskId}::${a.destinatarioId}`;
    if (vistos.has(llave)) return false;
    vistos.add(llave);
    return true;
  });
  if (!pendientes.length) return 0;

  try {
    return await conLasTablas(() => db.$executeRaw`
      INSERT INTO "task_alerts"
        ("id", "taskId", "projectId", "ownerId", "destinatarioId",
         "actorId", "actorNombre", "tipo", "titulo", "texto")
      VALUES ${Prisma.join(
        pendientes.map(
          (a) => Prisma.sql`(
            ${a.id}, ${a.taskId}, ${a.projectId}, ${a.ownerId}, ${a.destinatarioId},
            ${a.actorId}, ${a.actorNombre}, ${a.tipo}, ${a.titulo}, ${a.texto}
          )`,
        ),
      )}
    `);
  } catch (error) {
    // Un aviso que no sale sin decirlo se ve como «a mí nunca me llega nada»,
    // que es exactamente lo que este trabajo vino a arreglar.
    console.warn("[tareas] no se pudieron guardar los avisos", {
      cuantos: pendientes.length,
      taskId: pendientes[0]?.taskId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

function aAviso(f: {
  id: string;
  taskId: number;
  projectId: number | null;
  tipo: string;
  titulo: string;
  texto: string | null;
  actorNombre: string | null;
  creadoEn: Date;
  atendidoEn: Date | null;
  vistoEn: Date | null;
}): AvisoDeTarea {
  return {
    id: f.id,
    taskId: Number(f.taskId),
    projectId: f.projectId === null ? null : Number(f.projectId),
    tipo: esTipoDeAviso(f.tipo) ? f.tipo : "comentario",
    titulo: f.titulo,
    texto: f.texto,
    actorNombre: f.actorNombre,
    creadoEn: f.creadoEn.toISOString(),
    atendido: f.atendidoEn !== null,
    visto: f.vistoEn !== null,
  };
}

/**
 * Lo que tiene que saltar en pantalla ahora mismo.
 *
 * Es la consulta del sondeo, así que va por el índice `(destinatarioId,
 * atendidoEn)` y no mira nada más. Los más antiguos primero: si se acumularon
 * tres, se atienden en el orden en que pasaron.
 */
export async function avisosPorSaltar(destinatarioId: string): Promise<AvisoDeTarea[]> {
  return conLasTablas(async () => {
    const filas = await db.$queryRaw<Parameters<typeof aAviso>[0][]>`
      SELECT "id", "taskId", "projectId", "tipo", "titulo", "texto",
             "actorNombre", "creadoEn", "atendidoEn", "vistoEn"
      FROM "task_alerts"
      WHERE "destinatarioId" = ${destinatarioId} AND "atendidoEn" IS NULL
      ORDER BY "creadoEn" ASC
      LIMIT ${TOPE_DE_AVISOS}
    `;
    return filas.map(aAviso);
  });
}

/**
 * El historial de la campanita: lo atendido también, porque «si la persona no
 * estaba en pantalla cuando saltó, tiene que poder leerlo después».
 */
export async function avisosDeLaCampanita(destinatarioId: string): Promise<AvisoDeTarea[]> {
  return conLasTablas(async () => {
    const filas = await db.$queryRaw<Parameters<typeof aAviso>[0][]>`
      SELECT "id", "taskId", "projectId", "tipo", "titulo", "texto",
             "actorNombre", "creadoEn", "atendidoEn", "vistoEn"
      FROM "task_alerts"
      WHERE "destinatarioId" = ${destinatarioId}
      ORDER BY "creadoEn" DESC
      LIMIT ${TOPE_DE_AVISOS}
    `;
    return filas.map(aAviso);
  });
}

/**
 * El clic de la ventana emergente, que atiende **todos** los avisos que
 * enseñaba: la ventana es una, agrupada, y se sale de ella de una vez.
 *
 * Van los ids explícitos y no «todo lo pendiente de esta persona»: un aviso que
 * haya entrado entre pintar la ventana y pulsar el botón no se puede dar por
 * atendido sin que nadie lo haya visto.
 *
 * Esto marca como leído —lo que se descuenta de la campanita— y **no** toca
 * `vistoEn`: el punto del tablero solo se quita abriendo la tarea.
 */
export async function atenderLosAvisos(
  ids: string[],
  destinatarioId: string,
): Promise<number> {
  const limpios = Array.from(new Set(ids.filter(Boolean)));
  if (!limpios.length) return 0;
  return conLasTablas(() => db.$executeRaw`
    UPDATE "task_alerts"
    SET "atendidoEn" = NOW()
    WHERE "destinatarioId" = ${destinatarioId}
      AND "atendidoEn" IS NULL
      AND "id" IN (${Prisma.join(limpios)})
  `);
}

/**
 * Abrió la tarea: se quita el punto del tablero **y** se da por atendido lo que
 * quedara pendiente de saltar. Quien ya entró a leerlo no necesita que le salga
 * una ventana por lo mismo.
 */
export async function marcarLaTareaComoVista(
  taskId: number,
  destinatarioId: string,
): Promise<number> {
  return conLasTablas(() => db.$executeRaw`
    UPDATE "task_alerts"
    SET "vistoEn" = COALESCE("vistoEn", NOW()),
        "atendidoEn" = COALESCE("atendidoEn", NOW())
    WHERE "taskId" = ${taskId}
      AND "destinatarioId" = ${destinatarioId}
      AND "vistoEn" IS NULL
  `);
}

/**
 * De estas tareas, cuáles traen algo que esta persona no ha visto.
 *
 * Por lista y no de una en una: quien pregunta es el tablero, y con una
 * consulta por tarjeta un tablero de treinta tareas son treinta consultas.
 *
 * Un fallo devuelve el conjunto vacío y **lo dice**: el tablero se pinta sin
 * puntos, que es peor que con ellos y muchísimo mejor que no pintarse.
 */
export async function tareasConAlgoSinVer(
  taskIds: number[],
  destinatarioId: string,
): Promise<Set<number>> {
  const ids = Array.from(new Set(taskIds.filter((n) => Number.isInteger(n))));
  if (!ids.length || !destinatarioId) return new Set();

  try {
    return await conLasTablas(async () => {
      const filas = await db.$queryRaw<Array<{ taskId: number }>>`
        SELECT DISTINCT "taskId"
        FROM "task_alerts"
        WHERE "destinatarioId" = ${destinatarioId}
          AND "vistoEn" IS NULL
          AND "taskId" IN (${Prisma.join(ids)})
      `;
      return new Set(filas.map((f) => Number(f.taskId)));
    });
  } catch (error) {
    console.warn("[tareas] no se pudo saber qué tareas traen algo sin ver", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Set();
  }
}

/**
 * Al borrar una tarea se van su hilo y sus avisos.
 *
 * Sin clave foránea —`tasks` es del backend—, así que la limpieza es explícita
 * y **no puede reventar el borrado**: si esto falla, lo peor que queda son unas
 * filas huérfanas que nadie lee.
 */
export async function olvidarElHiloDe(taskId: number): Promise<void> {
  try {
    await conLasTablas(async () => {
      await db.$executeRaw`DELETE FROM "task_comments" WHERE "taskId" = ${taskId}`;
      await db.$executeRaw`DELETE FROM "task_alerts" WHERE "taskId" = ${taskId}`;
    });
  } catch (error) {
    console.warn("[tareas] no se pudo borrar el hilo de la tarea", {
      taskId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
