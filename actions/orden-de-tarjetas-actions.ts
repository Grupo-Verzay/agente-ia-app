"use server";

// El orden en que cada CUENTA coloca sus tarjetas de Proyectos y de Diagramas.
//
// Tres decisiones que conviene entender antes de tocar esto:
//
// 1. **El orden no vive dentro de la cosa.** Ni `orden` en `Project` ni en
//    `flows`: una tabla aparte que dice «esta cuenta pone esta cosa en este
//    sitio». Con `Project` está además la razón de siempre —es del BACKEND y
//    añadirle columnas desde aquí es lo que reventó el #360— pero el motivo que
//    manda es otro y vale también para `flows`, que sí es nuestra: **una cosa
//    compartida tiene UNA fila y DOS sitios**, uno por cuenta. Ver
//    `lib/orden-de-las-tarjetas.ts`.
// 2. **La tabla se crea aquí**, con `CREATE TABLE IF NOT EXISTS`, como
//    `work_folders`, `flows` y `chat_messages`.
// 3. **El orden es de la CUENTA, uno solo.** Lo que coloque alguien lo ve todo
//    su equipo. No es una preferencia de cada persona: si lo fuera, dos asesores
//    mirando la misma pantalla verían dos pantallas distintas y no podrían
//    decirse «el tercero empezando por arriba».
//
// Este fichero SOLO exporta funciones asíncronas: es lo único que admite un
// módulo `'use server'`. Los tipos y las constantes están en
// `lib/orden-de-las-tarjetas.ts` —con un `export const` aquí el build pasa y en
// producción cada llamada da un 500 sin decir nada—.

import { Prisma } from "@prisma/client";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { esTipoDeCarpeta, type TipoDeCarpeta } from "@/lib/carpetas";
import {
  TOPE_DE_TARJETAS_ORDENADAS,
  type OrdenGuardado,
} from "@/lib/orden-de-las-tarjetas";

type Resultado<T> = { success: true; data: T } | { success: false; message: string };

let ensurePromise: Promise<void> | null = null;

async function asegurarTabla(): Promise<void> {
  ensurePromise ??= (async () => {
    // Una cosa ocupa UN sitio por cuenta: la llave primaria lo impide de raíz,
    // así que guardar el orden es un `upsert` y no hay que limpiar nada antes.
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "work_item_order" (
        "ownerId" TEXT NOT NULL,
        "tipo" TEXT NOT NULL,
        "itemId" TEXT NOT NULL,
        "orden" INTEGER NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("ownerId", "tipo", "itemId")
      )
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "work_item_order_owner_tipo_idx"
      ON "work_item_order" ("ownerId", "tipo", "orden")
    `;
  })().catch((error) => {
    // El recuerdo de «ya la creé» es del PROCESO, no de la base. Si la creación
    // falla hay que olvidarlo, o todas las llamadas de después dan por hecho que
    // la tabla está y se caen con `42P01` hasta que alguien reinicie.
    ensurePromise = null;
    throw error;
  });

  return ensurePromise;
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
 * El recuerdo de «ya la creé» es de este PROCESO, no de la base. Si la tabla
 * desaparece por debajo —una restauración, un entorno recién levantado que este
 * proceso ya visitó— el recuerdo sigue diciendo que existe y todas las
 * consultas fallan hasta que alguien reinicie el contenedor. Lo destapó el
 * banco borrando la tabla a mano.
 *
 * El reintento es UNO: si tampoco va la segunda, el problema no era que faltara
 * la tabla, y esconderlo detrás de un bucle sería peor.
 */
async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
  await asegurarTabla();
  try {
    return await hacer();
  } catch (error) {
    if (!esTablaQueFalta(error)) throw error;
    console.warn("[orden] la tabla del orden no estaba; se crea y se reintenta");
    ensurePromise = null;
    await asegurarTabla();
    return hacer();
  }
}

/**
 * La cuenta que ordena y si quien mira puede mover.
 *
 * `effectiveId` es el mismo valor con el que agrupan Proyectos (`ownerId ?? id`),
 * Diagramas y las carpetas. Con otro, el orden quedaría en una cuenta y las
 * tarjetas en otra.
 */
async function contexto() {
  const user = await currentUser();
  const cuenta = user?.effectiveId ?? user?.id;
  if (!user || !cuenta) throw new Error("No autorizado.");
  return { cuenta, ordena: canManageWorkspace(user) };
}

function limpiarTipo(tipo: string): TipoDeCarpeta {
  if (!esTipoDeCarpeta(tipo)) throw new Error("Tipo de tarjeta desconocido.");
  return tipo;
}

/** Cómo está colocada hoy esta pantalla para esta cuenta. */
export async function leerElOrdenAction(tipoCrudo: string): Promise<Resultado<OrdenGuardado>> {
  try {
    const tipo = limpiarTipo(tipoCrudo);
    const ctx = await contexto();

    const filas = await conLaTabla(() => db.$queryRaw<{ itemId: string; orden: number }[]>`
      SELECT "itemId", "orden"
      FROM "work_item_order"
      WHERE "ownerId" = ${ctx.cuenta} AND "tipo" = ${tipo}
      ORDER BY "orden" ASC
    `);

    const orden: OrdenGuardado = {};
    for (const fila of filas) orden[fila.itemId] = fila.orden;
    return { success: true, data: orden };
  } catch (error) {
    console.error("[orden] no se pudo leer", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo cargar el orden.",
    };
  }
}

/**
 * Guarda la lista entera, en UNA consulta.
 *
 * Los módulos lo hacen con una llamada por tarjeta (`newOrder.map(...)` con un
 * `updateModuleOrder` cada uno), y con ocho módulos eso se aguanta. Aquí no:
 * una cuenta con cuarenta proyectos son cuarenta peticiones por cada arrastre,
 * que es exactamente «muchas peticiones pequeñas son turno, no trabajo». Va un
 * `INSERT ... ON CONFLICT` de varias filas y ya.
 *
 * Y **se guardan todas, no solo la que se movió**: mover una cambia el sitio de
 * las que quedan detrás, así que escribir solo la arrastrada dejaría la mitad de
 * la lista diciendo una posición que ya no es la suya.
 */
export async function guardarElOrdenAction(
  tipoCrudo: string,
  ids: string[],
): Promise<Resultado<null>> {
  try {
    const tipo = limpiarTipo(tipoCrudo);
    const ctx = await contexto();

    // La puerta va AQUÍ, no en la pantalla. Esconder el asa evita el arrastre
    // accidental; lo que cierra la petición directa es esto.
    if (!ctx.ordena) {
      throw new Error("Solo un administrador de la cuenta puede reordenar.");
    }

    const limpios: string[] = [];
    const vistos = new Set<string>();
    for (const crudo of ids ?? []) {
      const id = String(crudo ?? "").trim();
      // Un id repetido escribiría dos veces la misma fila en el mismo `INSERT`,
      // y Postgres rechaza el comando entero con «ON CONFLICT no puede afectar
      // dos veces a la misma fila». Se queda la primera aparición.
      if (!id || id.length > 200 || vistos.has(id)) continue;
      vistos.add(id);
      limpios.push(id);
    }
    if (limpios.length === 0) throw new Error("No se sabe qué ordenar.");
    if (limpios.length > TOPE_DE_TARJETAS_ORDENADAS) {
      throw new Error("Son demasiadas tarjetas para ordenar de una vez.");
    }

    const valores = limpios.map(
      (id, indice) => Prisma.sql`(${ctx.cuenta}, ${tipo}, ${id}, ${indice}, NOW())`,
    );
    await conLaTabla(() => db.$executeRaw`
      INSERT INTO "work_item_order" ("ownerId", "tipo", "itemId", "orden", "updatedAt")
      VALUES ${Prisma.join(valores)}
      ON CONFLICT ("ownerId", "tipo", "itemId")
      DO UPDATE SET "orden" = EXCLUDED."orden", "updatedAt" = NOW()
    `);

    return { success: true, data: null };
  } catch (error) {
    console.error("[orden] no se pudo guardar", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo guardar el orden.",
    };
  }
}
