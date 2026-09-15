import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Los archivos que cuelgan de una tarea del tablero.
 *
 * ## Por que una tabla aparte y no una columna en `tasks`
 *
 * **Las migraciones son del BACKEND** (`api-webhook`), que las aplica en su
 * arranque; la App no las toca. Añadirle una columna a `tasks` desde aqui es
 * exactamente lo que reventó el #360: si la App despliega antes, cada consulta
 * a esa tabla falla.
 *
 * Asi que se hace como `work_folders` y `flows`: **una tabla nuestra, creada
 * por la propia App** con `CREATE TABLE IF NOT EXISTS`. Y de paso sale mejor:
 * una tarea puede llevar varios archivos sin inventar un JSON dentro de una
 * columna.
 *
 * ## No se guarda el archivo, se guarda donde quedo
 *
 * El fichero sube por `/api/upload` -la misma ruta que usa el recordatorio- y
 * aqui solo se anota su URL. Esa ruta ya comprueba sesion y que la carpeta sea
 * de una cuenta sobre la que se manda (H02 de la auditoria).
 */

// Los tipos y las constantes viven en `lib/adjuntos-de-tarea-tipos.ts`, que es
// puro: de ahi tira tambien el tablero, que es cliente, y este fichero importa
// Prisma.
import {
  TIPOS_DE_ADJUNTO,
  type AdjuntoDeTarea,
  type TipoDeAdjunto,
} from "@/lib/adjuntos-de-tarea-tipos";

export type { AdjuntoDeTarea, TipoDeAdjunto };
export { TIPOS_DE_ADJUNTO, TOPE_DE_ADJUNTOS_POR_TAREA } from "@/lib/adjuntos-de-tarea-tipos";

let tablaLista: Promise<void> | null = null;

function asegurarLaTabla(): Promise<void> {
  tablaLista ??= (async () => {
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "task_attachments" (
        "id" TEXT PRIMARY KEY,
        "taskId" INTEGER NOT NULL,
        -- El dueño se copia aqui para poder acotar por cuenta sin unir con la
        -- tabla de tareas en cada consulta, y para que un borrado de la tarea
        -- no deje filas sin saber de quien eran.
        -- (Sin comillas invertidas: esto vive dentro de una plantilla y una
        --  sola la corta por la mitad.)
        "ownerId" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "nombre" TEXT NOT NULL,
        "tipo" TEXT NOT NULL,
        "mimeType" TEXT,
        "tamanoBytes" BIGINT,
        "creadoPorId" TEXT NOT NULL,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "task_attachments_task_idx"
      ON "task_attachments" ("taskId")
    `;
  })().catch((error) => {
    // Que el fallo no se quede pegado: la siguiente vuelve a intentarlo.
    tablaLista = null;
    throw error;
  });
  return tablaLista;
}

/**
 * Los adjuntos de varias tareas de una vez.
 *
 * Por lista y no de uno en uno porque quien los pide es el tablero: con una
 * consulta por tarjeta, un tablero de treinta tareas son treinta consultas
 * -la regla de siempre-.
 *
 * Un fallo aqui devuelve un mapa vacio y **lo dice**: el tablero se pinta sin
 * clips, que es peor que con ellos pero mucho mejor que no pintarse.
 */
export async function leerLosAdjuntos(
  taskIds: number[],
): Promise<Map<number, AdjuntoDeTarea[]>> {
  const ids = Array.from(new Set(taskIds.filter((n) => Number.isInteger(n))));
  if (!ids.length) return new Map();

  try {
    await asegurarLaTabla();
    const filas = await db.$queryRaw<
      Array<{
        id: string;
        taskId: number;
        url: string;
        nombre: string;
        tipo: string;
        mimeType: string | null;
        tamanoBytes: bigint | null;
        creadoEn: Date;
      }>
    >`
      SELECT "id", "taskId", "url", "nombre", "tipo", "mimeType", "tamanoBytes", "creadoEn"
      FROM "task_attachments"
      WHERE "taskId" IN (${Prisma.join(ids)})
      ORDER BY "creadoEn" ASC
    `;

    const porTarea = new Map<number, AdjuntoDeTarea[]>();
    for (const f of filas) {
      const adjunto: AdjuntoDeTarea = {
        id: f.id,
        taskId: Number(f.taskId),
        url: f.url,
        nombre: f.nombre,
        tipo: esTipoConocido(f.tipo) ? f.tipo : "document",
        mimeType: f.mimeType,
        // `BIGINT` no viaja a un componente de cliente (la misma regla que el
        // `Decimal` de `price` en Clientes).
        tamanoBytes: f.tamanoBytes === null ? null : Number(f.tamanoBytes),
        creadoEn: f.creadoEn.toISOString(),
      };
      const suyos = porTarea.get(adjunto.taskId);
      if (suyos) suyos.push(adjunto);
      else porTarea.set(adjunto.taskId, [adjunto]);
    }
    return porTarea;
  } catch (error) {
    console.warn("[tareas] no se pudieron leer los adjuntos", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}

export async function contarLosAdjuntos(taskId: number): Promise<number> {
  await asegurarLaTabla();
  const filas = await db.$queryRaw<Array<{ cuantos: bigint }>>`
    SELECT COUNT(*)::bigint AS cuantos FROM "task_attachments" WHERE "taskId" = ${taskId}
  `;
  return Number(filas[0]?.cuantos ?? 0);
}

export async function guardarUnAdjunto(input: {
  id: string;
  taskId: number;
  ownerId: string;
  creadoPorId: string;
  url: string;
  nombre: string;
  tipo: TipoDeAdjunto;
  mimeType: string | null;
  tamanoBytes: number | null;
}): Promise<void> {
  await asegurarLaTabla();
  await db.$executeRaw`
    INSERT INTO "task_attachments"
      ("id", "taskId", "ownerId", "url", "nombre", "tipo", "mimeType", "tamanoBytes", "creadoPorId")
    VALUES (
      ${input.id}, ${input.taskId}, ${input.ownerId}, ${input.url}, ${input.nombre},
      ${input.tipo}, ${input.mimeType}, ${input.tamanoBytes}, ${input.creadoPorId}
    )
  `;
}

/**
 * Quita un adjunto, **acotado por cuenta**.
 *
 * El `ownerId` en el `WHERE` no es de adorno: sin el, con un id a mano se
 * podria borrar el adjunto de otra cuenta. Devuelve cuantas filas se fueron,
 * para que quien llama sepa si existia.
 */
export async function quitarUnAdjunto(id: string, ownerId: string): Promise<number> {
  await asegurarLaTabla();
  return db.$executeRaw`
    DELETE FROM "task_attachments" WHERE "id" = ${id} AND "ownerId" = ${ownerId}
  `;
}

/**
 * Al borrar una tarea se van sus adjuntos.
 *
 * No hay clave foranea: `tasks` es del backend y una `FOREIGN KEY` desde una
 * tabla nuestra ataria las dos migraciones. Asi que la limpieza es explicita,
 * y **no puede reventar el borrado de la tarea**: si esto falla, lo peor que
 * queda son unas filas huerfanas que nadie lee.
 */
export async function olvidarLosAdjuntosDe(taskId: number): Promise<void> {
  try {
    await asegurarLaTabla();
    await db.$executeRaw`DELETE FROM "task_attachments" WHERE "taskId" = ${taskId}`;
  } catch (error) {
    console.warn("[tareas] no se pudieron borrar los adjuntos de la tarea", {
      taskId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function esTipoConocido(v: string): v is TipoDeAdjunto {
  return (TIPOS_DE_ADJUNTO as readonly string[]).includes(v);
}
