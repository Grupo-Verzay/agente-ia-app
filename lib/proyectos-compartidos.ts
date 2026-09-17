import { db } from "@/lib/db";

/**
 * A qué OTRAS cuentas se les enseña un proyecto.
 *
 * Es **cosa aparte de la privacidad con el equipo** (Privado / Solo lectura /
 * Editable, que en Proyectos es `filtroDeProyectosVisibles`): aquella reparte
 * dentro del equipo de una misma cuenta, y esto cruza a la cuenta de un cliente,
 * que no tiene nada que ver con ese equipo. Son dos ideas distintas y se
 * mantienen separadas; mezclarlas es lo que ya despistó una vez en Diagramas,
 * donde poner un diagrama «Editable» no le daba nada al cliente.
 *
 * ## La tabla es NUESTRA y no lleva clave foránea
 *
 * `projects` es del BACKEND —lo dice `docs/db-migrations-ownership.md`— y
 * añadirle una columna `sharedWith` desde la App es lo que reventó el #360. Así
 * que va como `flow_shares`, `task_comments` y `work_folder_items`: tabla de la
 * App, creada por la App con `CREATE TABLE IF NOT EXISTS`. Sin clave foránea, y
 * por eso al borrar un proyecto la limpieza es **explícita**
 * (`olvidarLosCompartidosDe`) y no puede reventar el borrado.
 */

export type PermisoDeProyecto = "lectura" | "edicion";

/** Lo que llegue de fuera no se da por bueno: cualquier cosa que no sea «edicion» es lectura. */
export function comoPermiso(valor: unknown): PermisoDeProyecto {
  return valor === "edicion" ? "edicion" : "lectura";
}

let tablaLista: Promise<void> | null = null;

function asegurarLaTabla(): Promise<void> {
  tablaLista ??= (async () => {
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "project_shares" (
        "id" TEXT PRIMARY KEY,
        "projectId" INTEGER NOT NULL,
        "accountUserId" TEXT NOT NULL,
        "sharedById" TEXT,
        "permiso" TEXT NOT NULL DEFAULT 'lectura',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
      )
    `;
    await db.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "project_shares_project_account_unique"
      ON "project_shares" ("projectId", "accountUserId")
    `;
    // Por aquí entra la consulta que más se hace: «qué me están enseñando a mí».
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "project_shares_account_idx"
      ON "project_shares" ("accountUserId")
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
  // (`P2010`) y el de Postgres viaja dentro, en `meta.code`. Preguntar solo por
  // el de arriba es lo que dejó el reintento de `task_comments` sin dispararse
  // nunca. Se miran los dos sitios, y el texto.
  const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
  if (e?.code === "42P01" || e?.meta?.code === "42P01") return true;
  return String(e?.message ?? "").includes("42P01");
}

/**
 * Corre algo contra la tabla, creándola si hiciera falta.
 *
 * El recuerdo de «ya la creé» es **del proceso, no de la base**: si la tabla
 * desaparece por debajo —una restauración, un entorno recién levantado— el
 * recuerdo seguiría diciendo que existe y todas las consultas fallarían hasta
 * que alguien reiniciara el contenedor. Se reintenta **una** vez: si tampoco va
 * la segunda, el problema no era que faltara la tabla.
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

/**
 * ¿A esta cuenta le están enseñando este proyecto, y con qué permiso?
 *
 * `null` = no se lo comparten.
 */
export async function permisoRecibidoDelProyecto(
  projectId: number,
  cuenta: string,
): Promise<PermisoDeProyecto | null> {
  return conLaTabla(async () => {
    const filas = await db.$queryRaw<{ permiso: string }[]>`
      SELECT "permiso" FROM "project_shares"
      WHERE "projectId" = ${projectId} AND "accountUserId" = ${cuenta}
      LIMIT 1
    `;
    return filas[0] ? comoPermiso(filas[0].permiso) : null;
  });
}

/** Los proyectos que OTRAS cuentas le enseñan a esta, con su permiso. */
export async function losProyectosQueMeComparten(
  cuenta: string,
): Promise<Map<number, PermisoDeProyecto>> {
  return conLaTabla(async () => {
    const filas = await db.$queryRaw<{ projectId: number; permiso: string }[]>`
      SELECT "projectId", "permiso" FROM "project_shares" WHERE "accountUserId" = ${cuenta}
    `;
    return new Map(filas.map((f) => [Number(f.projectId), comoPermiso(f.permiso)]));
  });
}

/** Con cuántas cuentas se comparte cada uno de estos proyectos. */
export async function conCuantasCuentasSeComparten(
  projectIds: number[],
): Promise<Map<number, number>> {
  const ids = Array.from(new Set(projectIds)).filter((id) => Number.isInteger(id));
  if (ids.length === 0) return new Map();
  return conLaTabla(async () => {
    const filas = await db.$queryRaw<{ projectId: number; cuantas: bigint }[]>`
      SELECT "projectId", COUNT(*)::bigint AS cuantas
      FROM "project_shares"
      WHERE "projectId" = ANY(${ids}::int[])
      GROUP BY "projectId"
    `;
    return new Map(filas.map((f) => [Number(f.projectId), Number(f.cuantas)]));
  });
}

/** A qué cuentas se le está enseñando este proyecto hoy. */
export async function losDestinosDelProyecto(
  projectId: number,
): Promise<Map<string, PermisoDeProyecto>> {
  return conLaTabla(async () => {
    const filas = await db.$queryRaw<{ accountUserId: string; permiso: string }[]>`
      SELECT "accountUserId", "permiso" FROM "project_shares" WHERE "projectId" = ${projectId}
    `;
    return new Map(filas.map((f) => [f.accountUserId, comoPermiso(f.permiso)]));
  });
}

/**
 * Deja la lista de destinos EXACTAMENTE como se pide.
 *
 * Se borra y se vuelve a escribir, como en Diagramas: la pantalla manda la lista
 * entera, así que quitar una cuenta es que ya no venga. Quien llama tiene que
 * haber comprobado antes que esas cuentas son suyas — una lista que llega del
 * navegador no decide a quién se le enseña un proyecto.
 */
export async function guardarLosDestinosDelProyecto(
  projectId: number,
  destinos: Array<{ accountUserId: string; permiso: PermisoDeProyecto }>,
  sharedById: string,
): Promise<void> {
  await conLaTabla(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM "project_shares" WHERE "projectId" = ${projectId}`;
      for (const destino of destinos) {
        const id = `ps_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        await tx.$executeRaw`
          INSERT INTO "project_shares" ("id", "projectId", "accountUserId", "sharedById", "permiso")
          VALUES (${id}, ${projectId}, ${destino.accountUserId}, ${sharedById}, ${destino.permiso})
          ON CONFLICT ("projectId", "accountUserId")
          DO UPDATE SET "permiso" = EXCLUDED."permiso"
        `;
      }
    });
  });
}

/**
 * Al borrar un proyecto, sus filas de compartido se van con él.
 *
 * No hay clave foránea, así que esto es la limpieza — y **no lanza**: lo peor
 * que puede pasar si falla son unas filas huérfanas que apuntan a un proyecto
 * que ya no existe, y eso no puede tumbar el borrado. Es lo mismo que hace
 * `olvidarElHiloDe` con los comentarios.
 */
export async function olvidarLosCompartidosDe(projectId: number): Promise<void> {
  try {
    await conLaTabla(async () => {
      await db.$executeRaw`DELETE FROM "project_shares" WHERE "projectId" = ${projectId}`;
    });
  } catch (error) {
    console.warn("[proyectos] no se pudieron limpiar los compartidos", {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
