"use server";

// Carpetas para ORDENAR lo que se acumula en una pantalla: por ahora Proyectos
// y Diagramas, que crecen sin parar y acaban siendo una cuadrícula de tarjetas
// donde no se encuentra nada.
//
// Dos decisiones que conviene entender antes de tocar esto:
//
// 1. **La carpeta no vive dentro de la cosa.** No hay `folderId` en `Project`
//    ni en `flows`: hay una tabla aparte que dice "esta cosa está en esta
//    carpeta". `Project` es del BACKEND (él es dueño de las migraciones, ver
//    docs/db-migrations-ownership.md) y añadirle columnas desde aquí es
//    justo lo que rompió el #360. Con una tabla propia no se toca nada suyo.
// 2. **Las tablas se crean aquí**, con `CREATE TABLE IF NOT EXISTS`, como ya
//    hacen `flows` y `chat_messages`: el frontend no corre migraciones, pero sí
//    puede provisionar sus propias tablas nuevas de forma idempotente.
//
// La carpeta es de la CUENTA, no de la persona: el equipo tiene que ver la
// misma organización. Quien puede ver una cosa la ve en su carpeta.

import { revalidatePath } from "next/cache";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageWorkspace } from "@/lib/workspace-roles";

/** Qué pantalla ordena esta carpeta. Si se añade otra, va aquí y nada más. */
export const TIPOS_DE_CARPETA = ["proyecto", "diagrama"] as const;
export type TipoDeCarpeta = (typeof TIPOS_DE_CARPETA)[number];

export type Carpeta = {
  id: string;
  nombre: string;
  color: string | null;
  orden: number;
  /** Quién la creó. Solo esa persona —o quien gestiona la cuenta— la cambia. */
  createdById: string | null;
  puedeGestionar: boolean;
};

export type CarpetasDeUnTipo = {
  carpetas: Carpeta[];
  /** id de la cosa → id de su carpeta. Lo que no está aquí, va suelto. */
  deCadaCosa: Record<string, string>;
};

type Resultado<T> = { success: true; data: T } | { success: false; message: string };

let ensurePromise: Promise<void> | null = null;

async function asegurarTablas(): Promise<void> {
  ensurePromise ??= (async () => {
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "work_folders" (
        "id" TEXT PRIMARY KEY,
        "ownerId" TEXT NOT NULL,
        "tipo" TEXT NOT NULL,
        "nombre" TEXT NOT NULL,
        "color" TEXT,
        "orden" INTEGER NOT NULL DEFAULT 0,
        "createdById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
      )
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "work_folders_owner_tipo_idx"
      ON "work_folders" ("ownerId", "tipo", "orden")
    `;
    // Una cosa está en UNA carpeta: la llave primaria lo impide de raíz, así no
    // hace falta limpiar duplicados al mover.
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "work_folder_items" (
        "ownerId" TEXT NOT NULL,
        "tipo" TEXT NOT NULL,
        "itemId" TEXT NOT NULL,
        "folderId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("ownerId", "tipo", "itemId")
      )
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "work_folder_items_folder_idx"
      ON "work_folder_items" ("folderId")
    `;
  })().catch((error) => {
    ensurePromise = null;
    throw error;
  });

  return ensurePromise;
}

/**
 * La cuenta a la que pertenecen las carpetas y quién está mirando.
 *
 * `effectiveId` es el mismo valor que usan Proyectos (`ownerId ?? id`) y
 * Diagramas para agrupar lo suyo: si aquí se usara otro, las carpetas
 * quedarían en una cuenta y las cosas en otra.
 */
async function contexto() {
  const user = await currentUser();
  const cuenta = user?.effectiveId ?? user?.id;
  if (!user || !cuenta) throw new Error("No autorizado.");
  return { cuenta, persona: user.sessionUserId ?? user.id, gestiona: canManageWorkspace(user) };
}

function limpiarTipo(tipo: string): TipoDeCarpeta {
  if (!(TIPOS_DE_CARPETA as readonly string[]).includes(tipo)) {
    throw new Error("Tipo de carpeta desconocido.");
  }
  return tipo as TipoDeCarpeta;
}

function limpiarNombre(nombre: string): string {
  const limpio = nombre.trim();
  if (!limpio) throw new Error("Ponle un nombre a la carpeta.");
  if (limpio.length > 60) throw new Error("El nombre es demasiado largo.");
  return limpio;
}

export async function listarCarpetasAction(tipoCrudo: string): Promise<Resultado<CarpetasDeUnTipo>> {
  try {
    const tipo = limpiarTipo(tipoCrudo);
    const ctx = await contexto();
    await asegurarTablas();

    const [filas, items] = await Promise.all([
      db.$queryRaw<
        { id: string; nombre: string; color: string | null; orden: number; createdById: string | null }[]
      >`
        SELECT "id", "nombre", "color", "orden", "createdById"
        FROM "work_folders"
        WHERE "ownerId" = ${ctx.cuenta} AND "tipo" = ${tipo}
        ORDER BY "orden" ASC, "nombre" ASC
      `,
      db.$queryRaw<{ itemId: string; folderId: string }[]>`
        SELECT "itemId", "folderId"
        FROM "work_folder_items"
        WHERE "ownerId" = ${ctx.cuenta} AND "tipo" = ${tipo}
      `,
    ]);

    const deCadaCosa: Record<string, string> = {};
    for (const it of items) deCadaCosa[it.itemId] = it.folderId;

    return {
      success: true,
      data: {
        carpetas: filas.map((f) => ({
          ...f,
          puedeGestionar: ctx.gestiona || f.createdById === ctx.persona,
        })),
        deCadaCosa,
      },
    };
  } catch (error) {
    console.error("[carpetas] no se pudieron listar", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudieron cargar las carpetas.",
    };
  }
}

export async function crearCarpetaAction(
  tipoCrudo: string,
  nombre: string,
): Promise<Resultado<Carpeta>> {
  try {
    const tipo = limpiarTipo(tipoCrudo);
    const limpio = limpiarNombre(nombre);
    const ctx = await contexto();
    await asegurarTablas();

    const [{ siguiente }] = await db.$queryRaw<{ siguiente: number }[]>`
      SELECT COALESCE(MAX("orden"), 0) + 1 AS "siguiente"
      FROM "work_folders"
      WHERE "ownerId" = ${ctx.cuenta} AND "tipo" = ${tipo}
    `;

    const id = crypto.randomUUID();
    await db.$executeRaw`
      INSERT INTO "work_folders" ("id", "ownerId", "tipo", "nombre", "orden", "createdById")
      VALUES (${id}, ${ctx.cuenta}, ${tipo}, ${limpio}, ${siguiente}, ${ctx.persona})
    `;

    return {
      success: true,
      data: {
        id,
        nombre: limpio,
        color: null,
        orden: siguiente,
        createdById: ctx.persona,
        puedeGestionar: true,
      },
    };
  } catch (error) {
    console.error("[carpetas] no se pudo crear", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo crear la carpeta.",
    };
  }
}

/** La carpeta existe, es de esta cuenta y quien pregunta manda en ella. */
async function carpetaGestionable(id: string, ctx: Awaited<ReturnType<typeof contexto>>) {
  const filas = await db.$queryRaw<{ id: string; createdById: string | null }[]>`
    SELECT "id", "createdById" FROM "work_folders"
    WHERE "id" = ${id} AND "ownerId" = ${ctx.cuenta}
    LIMIT 1
  `;
  const carpeta = filas[0];
  if (!carpeta) throw new Error("Carpeta no encontrada.");
  if (!ctx.gestiona && carpeta.createdById !== ctx.persona) {
    throw new Error("Solo quien creó la carpeta o un administrador puede cambiarla.");
  }
  return carpeta;
}

export async function renombrarCarpetaAction(id: string, nombre: string): Promise<Resultado<null>> {
  try {
    const limpio = limpiarNombre(nombre);
    const ctx = await contexto();
    await asegurarTablas();
    await carpetaGestionable(id, ctx);

    await db.$executeRaw`UPDATE "work_folders" SET "nombre" = ${limpio} WHERE "id" = ${id}`;
    return { success: true, data: null };
  } catch (error) {
    console.error("[carpetas] no se pudo renombrar", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo renombrar la carpeta.",
    };
  }
}

/**
 * Borra la carpeta, no lo que hay dentro.
 *
 * Lo que estaba en ella vuelve a salir suelto, que es lo que se espera de una
 * carpeta: es una forma de mirar, no un sitio donde se guarda nada.
 */
export async function eliminarCarpetaAction(id: string): Promise<Resultado<null>> {
  try {
    const ctx = await contexto();
    await asegurarTablas();
    await carpetaGestionable(id, ctx);

    await db.$executeRaw`DELETE FROM "work_folder_items" WHERE "folderId" = ${id}`;
    await db.$executeRaw`DELETE FROM "work_folders" WHERE "id" = ${id}`;
    return { success: true, data: null };
  } catch (error) {
    console.error("[carpetas] no se pudo eliminar", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo eliminar la carpeta.",
    };
  }
}

/** Mete una cosa en una carpeta, o la saca (`carpetaId` nulo). */
export async function moverACarpetaAction(
  tipoCrudo: string,
  itemId: string,
  carpetaId: string | null,
): Promise<Resultado<null>> {
  try {
    const tipo = limpiarTipo(tipoCrudo);
    const ctx = await contexto();
    await asegurarTablas();

    const cosa = String(itemId ?? "").trim();
    if (!cosa) throw new Error("No se sabe qué mover.");

    if (!carpetaId) {
      await db.$executeRaw`
        DELETE FROM "work_folder_items"
        WHERE "ownerId" = ${ctx.cuenta} AND "tipo" = ${tipo} AND "itemId" = ${cosa}
      `;
    } else {
      // La carpeta tiene que ser de esta cuenta y de este tipo: con el id a mano
      // se podría archivar un proyecto dentro de una carpeta de diagramas ajena.
      const destino = await db.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "work_folders"
        WHERE "id" = ${carpetaId} AND "ownerId" = ${ctx.cuenta} AND "tipo" = ${tipo}
        LIMIT 1
      `;
      if (destino.length === 0) throw new Error("Carpeta no encontrada.");

      await db.$executeRaw`
        INSERT INTO "work_folder_items" ("ownerId", "tipo", "itemId", "folderId")
        VALUES (${ctx.cuenta}, ${tipo}, ${cosa}, ${carpetaId})
        ON CONFLICT ("ownerId", "tipo", "itemId")
        DO UPDATE SET "folderId" = EXCLUDED."folderId"
      `;
    }

    revalidatePath(tipo === "proyecto" ? "/proyectos" : "/diagramas");
    return { success: true, data: null };
  } catch (error) {
    console.error("[carpetas] no se pudo mover", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo mover a la carpeta.",
    };
  }
}
