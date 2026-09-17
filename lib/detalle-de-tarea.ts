import { db } from "@/lib/db";

import { limpiarDetalle } from "@/lib/titulo-de-la-tarea";

/**
 * El texto largo de una tarea: el «Qué hay que hacer» que antes vivía dentro de
 * `tasks.title` y se comía la tarjeta del tablero.
 *
 * ## Por qué una tabla aparte y no una columna en `tasks`
 *
 * **Las migraciones son del BACKEND** (`api-webhook`), que las aplica en su
 * arranque; la App no las toca. Añadirle una columna a `tasks` desde aquí es
 * exactamente lo que reventó el #360: si la App despliega antes, cada consulta
 * a esa tabla falla.
 *
 * Así que se hace como `task_attachments`, `task_comments` y `work_folders`:
 * **una tabla nuestra, creada por la propia App** con
 * `CREATE TABLE IF NOT EXISTS`, sin clave foránea. Por eso al borrar una tarea
 * la limpieza es explícita (`olvidarElDetalleDe`) y no puede reventar el
 * borrado.
 *
 * El motivo de que sea el DETALLE lo que se muda —y no el título corto— está
 * escrito en `lib/titulo-de-la-tarea.ts`, que es donde se decide.
 */

let tablaLista: Promise<void> | null = null;

function asegurarLaTabla(): Promise<void> {
  tablaLista ??= (async () => {
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "task_details" (
        "taskId" INTEGER PRIMARY KEY,
        -- El dueño se copia aqui para poder acotar por cuenta sin unir con la
        -- tabla de tareas, igual que en task_attachments.
        -- (Sin comillas invertidas: esto vive dentro de una plantilla y una
        --  sola la corta por la mitad.)
        "ownerId" TEXT NOT NULL,
        "detalle" TEXT NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
  })().catch((error) => {
    // El recuerdo de «ya la creé» es del PROCESO, no de la base. Si la creación
    // falla hay que olvidarlo, o todas las llamadas de después dan por hecho
    // que la tabla está y se caen con `42P01` hasta que alguien reinicie.
    tablaLista = null;
    throw error;
  });

  return tablaLista;
}

/** `42P01` de Postgres: «relation does not exist». */
function esTablaQueFalta(error: unknown): boolean {
  // En una consulta en crudo el `code` de primer nivel es el de PRISMA
  // (`P2010`) y el de Postgres viaja dentro, en `meta.code`. Preguntando solo
  // por `code` el reintento no se dispara nunca — ya costó una vez.
  const conMeta = error as { code?: string; meta?: { code?: string } };
  if (conMeta?.meta?.code === "42P01") return true;
  const texto = error instanceof Error ? error.message : String(error);
  return texto.includes("42P01") || texto.includes("does not exist");
}

/**
 * Con la tabla puesta, y si no está, se crea y se reintenta UNA vez.
 *
 * Una, no un bucle: si tampoco va la segunda, el problema no era que faltara
 * la tabla, y esconderlo detrás de un bucle sería peor.
 */
async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
  await asegurarLaTabla();
  try {
    return await hacer();
  } catch (error) {
    if (!esTablaQueFalta(error)) throw error;
    console.warn("[tareas] la tabla del detalle no estaba; se crea y se reintenta");
    tablaLista = null;
    await asegurarLaTabla();
    return hacer();
  }
}

/**
 * El detalle de varias tareas de una vez.
 *
 * Por lista y no de una en una porque quien las pide es el tablero: con una
 * consulta por tarjeta, cuarenta tareas son cuarenta consultas — la regla de
 * siempre. Lo que no tenga fila no sale en el mapa, y eso **es** el dato: son
 * las tareas de antes de que esto existiera.
 */
export async function detallesDeLasTareas(
  taskIds: number[],
): Promise<Record<number, string>> {
  const ids = taskIds.filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return {};

  return conLaTabla(async () => {
    const filas = await db.$queryRaw<{ taskId: number; detalle: string }[]>`
      SELECT "taskId", "detalle" FROM "task_details"
      WHERE "taskId" = ANY(${ids}::int[])
    `;
    const mapa: Record<number, string> = {};
    for (const fila of filas) mapa[fila.taskId] = fila.detalle;
    return mapa;
  });
}

/** El detalle de UNA tarea, o `null` si no tiene. */
export async function detalleDeLaTarea(taskId: number): Promise<string | null> {
  const mapa = await detallesDeLasTareas([taskId]);
  return mapa[taskId] ?? null;
}

/**
 * Guarda el detalle, o borra la fila cuando se deja en blanco.
 *
 * Vaciar el campo tiene que **quitar** el detalle, no dejar una fila con una
 * cadena vacía: si no, la tarea seguiría diciendo que tiene detalle y al
 * abrirla no habría nada.
 */
export async function guardarElDetalle(input: {
  taskId: number;
  ownerId: string;
  detalle: string | null | undefined;
}): Promise<void> {
  const limpio = limpiarDetalle(input.detalle);

  await conLaTabla(async () => {
    if (!limpio) {
      await db.$executeRaw`DELETE FROM "task_details" WHERE "taskId" = ${input.taskId}`;
      return;
    }
    await db.$executeRaw`
      INSERT INTO "task_details" ("taskId", "ownerId", "detalle", "updatedAt")
      VALUES (${input.taskId}, ${input.ownerId}, ${limpio}, CURRENT_TIMESTAMP)
      ON CONFLICT ("taskId")
      DO UPDATE SET "detalle" = EXCLUDED."detalle", "updatedAt" = CURRENT_TIMESTAMP
    `;
  });
}

/**
 * Al borrar una tarea, su detalle se va con ella.
 *
 * No hay clave foránea —la tabla es nuestra y `tasks` del backend—, así que la
 * limpieza es explícita. Y **nunca lanza**: la tarea ya está borrada cuando se
 * llama a esto, y que la limpieza reviente no puede deshacer el borrado.
 */
export async function olvidarElDetalleDe(taskId: number): Promise<void> {
  try {
    await conLaTabla(() => db.$executeRaw`
      DELETE FROM "task_details" WHERE "taskId" = ${taskId}
    `);
  } catch (error) {
    console.warn("[tareas] no se pudo borrar el detalle de la tarea", { taskId, error });
  }
}
