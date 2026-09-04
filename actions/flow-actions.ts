"use server";

// Diagramas de "Flow": lienzo puro para disenar procesos de clientes, sin
// motor de ejecucion ni tablas relacionales por nodo/conexion (a diferencia
// de Workflow). Un solo blob JSON por diagrama con los `nodes`/`edges` tal
// cual los entrega React Flow.
//
// La tabla se auto-provisiona aqui (CREATE TABLE IF NOT EXISTS) en vez de
// depender de una migracion del backend, igual que chat_messages/
// chat_conversations en lib/chat-persistence.ts: el frontend no corre
// migraciones, pero SI puede crear sus propias tablas nuevas en tiempo de
// ejecucion, de forma idempotente.

import { revalidatePath } from "next/cache";

import { currentUser } from "@/lib/auth";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { VISIBILIDADES, type FlowVisibility } from "@/lib/flow-visibility";
import { clientesDeLaCuenta } from "@/lib/cuentas-cliente";

export interface FlowSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Cuantos nodos tiene dibujados. Para que la tarjeta del listado diga algo. */
  nodeCount: number;
  visibility: FlowVisibility;
  /** Quien lo hizo. Nulo en los diagramas anteriores a esta funcion. */
  createdById: string | null;
  /** Si quien mira puede cambiarlo, o solo verlo. */
  puedeEditar: boolean;
  /** Si además decide con quién se comparte y puede eliminarlo. */
  puedeCompartir: boolean;
  /**
   * Llegó compartido desde OTRA cuenta. Se ve y se puede duplicar, nada más: el
   * original es de quien lo hizo y no se toca desde fuera.
   */
  recibido: boolean;
  /** A cuántas cuentas se lo está enseñando. Cero en los recibidos. */
  compartidoCon: number;
}

// Al abrir un diagrama vienen los nodos enteros, asi que contarlos aparte
// sobra: `nodeCount` es solo para el listado.
export interface FlowDetail extends Omit<FlowSummary, "nodeCount"> {
  nodes: unknown[];
  edges: unknown[];
}

type ActionResult<T> = { success: true; data: T } | { success: false; message: string };

let ensurePromise: Promise<void> | null = null;

async function ensureFlowTable(): Promise<void> {
  ensurePromise ??= (async () => {
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "flows" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "nodes" JSONB NOT NULL DEFAULT '[]',
        "edges" JSONB NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
      )
    `;
    // Diagrama generado desde el entrenamiento de un agente: se guarda de que
    // prompt salio para poder volver a dibujarlo encima en vez de crear uno
    // nuevo cada vez. Nulo en los diagramas hechos a mano.
    await db.$executeRaw`
      ALTER TABLE "flows" ADD COLUMN IF NOT EXISTS "promptId" TEXT
    `;
    // Quien lo hizo y con quien lo comparte. Las filas que ya existian se
    // quedan en "edicion", que es como se comportaban: del equipo y editables.
    // `createdById` nulo en ellas: no hay forma de saber quien las dibujo.
    await db.$executeRaw`
      ALTER TABLE "flows" ADD COLUMN IF NOT EXISTS "createdById" TEXT
    `;
    await db.$executeRaw`
      ALTER TABLE "flows" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'edicion'
    `;
    await db.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "flows_user_name_unique" ON "flows" ("userId", "name")
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "flows_prompt_idx" ON "flows" ("userId", "promptId")
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "flows_user_updated_idx" ON "flows" ("userId", "updatedAt" DESC)
    `;
    // A qué OTRAS cuentas se les enseña un diagrama. Es cosa aparte de la
    // visibilidad, que reparte dentro del equipo de una misma cuenta: aquí se
    // cruza a la cuenta de un cliente, que no tiene nada que ver con el equipo.
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "flow_shares" (
        "id" TEXT PRIMARY KEY,
        "flowId" TEXT NOT NULL,
        "accountUserId" TEXT NOT NULL,
        "sharedById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
      )
    `;
    // Con que permiso se comparte. Las filas que ya existian se quedan en
    // 'lectura', que es exactamente como se comportaban: lo recibido se miraba
    // y se duplicaba, nunca se cambiaba.
    await db.$executeRaw`
      ALTER TABLE "flow_shares" ADD COLUMN IF NOT EXISTS "permiso" TEXT NOT NULL DEFAULT 'lectura'
    `;
    await db.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "flow_shares_flow_account_unique"
      ON "flow_shares" ("flowId", "accountUserId")
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "flow_shares_account_idx" ON "flow_shares" ("accountUserId")
    `;
  })().catch((error) => {
    ensurePromise = null;
    throw error;
  });

  return ensurePromise;
}

async function requireUserId(): Promise<string> {
  const user = await currentUser();
  const userId = user?.effectiveId ?? user?.id;
  if (!userId) throw new Error("No autenticado.");
  return userId;
}

/**
 * Los diagramas son de la CUENTA, pero cada uno tiene autor.
 *
 * `cuenta` es de quien cuelgan —lo que los mantiene juntos aunque cambie la
 * gente—, y `persona` es quien está sentado delante: es lo que permite que un
 * diagrama sea suyo y no de todo el equipo.
 */
type Contexto = { cuenta: string; persona: string; gestiona: boolean };

async function contexto(): Promise<Contexto> {
  const user = await currentUser();
  const cuenta = user?.effectiveId ?? user?.id;
  if (!user || !cuenta) throw new Error("No autenticado.");
  return {
    cuenta,
    persona: user.sessionUserId ?? user.id,
    gestiona: canManageWorkspace(user),
  };
}

/** Un diagrama privado solo lo ve su autor; el resto, todo el equipo. */
function puedeVerlo(
  flow: { visibility: string; createdById: string | null },
  ctx: Contexto,
): boolean {
  return flow.visibility !== "privado" || flow.createdById === ctx.persona;
}

/**
 * Cambiarlo lo puede su autor, quien gestiona la cuenta, y el equipo entero si
 * está marcado como editable. En "lectura" se abre y se mira, nada más.
 */
function puedeEditarlo(
  flow: { visibility: string; createdById: string | null },
  ctx: Contexto,
): boolean {
  if (!puedeVerlo(flow, ctx)) return false;
  if (ctx.gestiona) return true;
  if (flow.createdById === ctx.persona) return true;
  return flow.visibility === "edicion";
}

/** Solo su autor y quien gestiona la cuenta deciden con quién se comparte. */
function puedeMandarEnEl(
  flow: { visibility: string; createdById: string | null },
  ctx: Contexto,
): boolean {
  return puedeVerlo(flow, ctx) && (ctx.gestiona || flow.createdById === ctx.persona);
}

type FilaDePermiso = { id: string; visibility: string; createdById: string | null };

async function buscarFlow(flowId: string, cuenta: string): Promise<FilaDePermiso | null> {
  const rows = await db.$queryRaw<FilaDePermiso[]>`
    SELECT "id", "visibility", "createdById"
    FROM "flows"
    WHERE "userId" = ${cuenta} AND "id" = ${flowId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function listFlowsAction(): Promise<ActionResult<FlowSummary[]>> {
  try {
    const ctx = await contexto();
    await ensureFlowTable();
    // Dos grupos en una sola consulta: los de esta cuenta, y los que otra
    // cuenta le esta enseñando.
    //
    // El conteo de nodos se hace en la base y no trayendo los nodos: el listado
    // solo necesita el numero, y un diagrama grande son varios kB de JSON por
    // fila. El CASE es por si algun diagrama viejo guardo algo que no es una
    // lista.
    //
    // Los privados de otros no salen de la base siquiera: filtrarlos despues
    // significaria traerselos, y un privado que viaja al navegador ya no lo es.
    const rows = await db.$queryRaw<
      (Omit<FlowSummary, "puedeEditar" | "puedeCompartir"> & {
        recibido: boolean;
        permisoRecibido: string | null;
      })[]
    >`
      SELECT "id", "name", "description", "createdAt", "updatedAt", "visibility", "createdById",
             CASE WHEN jsonb_typeof("nodes") = 'array' THEN jsonb_array_length("nodes") ELSE 0 END AS "nodeCount",
             false AS "recibido",
             NULL AS "permisoRecibido",
             (SELECT COUNT(*)::int FROM "flow_shares" s WHERE s."flowId" = f."id") AS "compartidoCon"
      FROM "flows" f
      WHERE "userId" = ${ctx.cuenta}
        AND ("visibility" <> 'privado' OR "createdById" = ${ctx.persona})

      UNION ALL

      SELECT f."id", f."name", f."description", f."createdAt", f."updatedAt", f."visibility", f."createdById",
             CASE WHEN jsonb_typeof(f."nodes") = 'array' THEN jsonb_array_length(f."nodes") ELSE 0 END AS "nodeCount",
             true AS "recibido",
             s."permiso" AS "permisoRecibido",
             0 AS "compartidoCon"
      FROM "flows" f
      JOIN "flow_shares" s ON s."flowId" = f."id"
      WHERE s."accountUserId" = ${ctx.cuenta}
        AND f."userId" <> ${ctx.cuenta}

      ORDER BY "updatedAt" DESC
    `;
    return {
      success: true,
      data: rows.map((row) => ({
        ...row,
        // Lo recibido se cambia solo si se compartio con permiso de edicion.
        // Repartirlo sigue siendo cosa de la cuenta que lo hizo.
        puedeEditar: row.recibido
          ? row.permisoRecibido === "edicion"
          : puedeEditarlo(row, ctx),
        puedeCompartir: row.recibido ? false : puedeMandarEnEl(row, ctx),
      })),
    };
  } catch (error) {
    console.error("[listFlowsAction]", error);
    return { success: false, message: "No se pudieron obtener los flujos." };
  }
}

/**
 * ¿A esta cuenta le están enseñando este diagrama, y con qué permiso?
 *
 * Devuelve `null` si no se lo comparten. `"lectura"` o `"edicion"` si sí.
 */
async function permisoRecibido(
  flowId: string,
  cuenta: string,
): Promise<"lectura" | "edicion" | null> {
  const rows = await db.$queryRaw<{ permiso: string }[]>`
    SELECT "permiso" FROM "flow_shares"
    WHERE "flowId" = ${flowId} AND "accountUserId" = ${cuenta}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rows[0].permiso === "edicion" ? "edicion" : "lectura";
}

export async function getFlowAction(flowId: string): Promise<ActionResult<FlowDetail>> {
  try {
    const ctx = await contexto();
    await ensureFlowTable();
    const rows = await db.$queryRaw<
      (Omit<FlowDetail, "puedeEditar" | "puedeCompartir" | "recibido" | "compartidoCon"> & {
        userId: string;
        compartidoCon: number;
      })[]
    >`
      SELECT "id", "userId", "name", "description", "nodes", "edges", "createdAt", "updatedAt",
             "visibility", "createdById",
             (SELECT COUNT(*)::int FROM "flow_shares" s WHERE s."flowId" = f."id") AS "compartidoCon"
      FROM "flows" f
      WHERE "id" = ${flowId}
      LIMIT 1
    `;
    const flow = rows[0];
    if (!flow) return { success: false, message: "Flujo no encontrado." };

    // De otra cuenta: solo se abre si a esta se lo estan enseñando, y con el
    // permiso con el que se lo compartieron.
    const recibido = flow.userId !== ctx.cuenta;
    if (recibido) {
      const permiso = await permisoRecibido(flowId, ctx.cuenta);
      if (!permiso) {
        return { success: false, message: "Flujo no encontrado." };
      }
      return {
        success: true,
        data: {
          ...flow,
          recibido: true,
          compartidoCon: 0,
          puedeEditar: permiso === "edicion",
          // Repartirlo a mas cuentas sigue siendo de quien lo hizo.
          puedeCompartir: false,
        },
      };
    }

    // Un privado ajeno se contesta igual que uno que no existe: decir "no
    // puedes" ya revela que existe y de quien es.
    if (!puedeVerlo(flow, ctx)) return { success: false, message: "Flujo no encontrado." };
    return {
      success: true,
      data: {
        ...flow,
        recibido: false,
        puedeEditar: puedeEditarlo(flow, ctx),
        puedeCompartir: puedeMandarEnEl(flow, ctx),
      },
    };
  } catch (error) {
    console.error("[getFlowAction]", error);
    return { success: false, message: "No se pudo obtener el flujo." };
  }
}

/**
 * Los dos nodos con los que nace todo diagrama nuevo, ya conectados: el que
 * marca el arranque y la primera bifurcacion.
 *
 * Un lienzo en blanco no dice por donde se empieza a leer, y estos diagramas
 * se le muestran al cliente. Se siembran aqui, al crear, y no en el lienzo,
 * para que queden guardados en la base igual que cualquier otro nodo y el
 * usuario pueda editarlos o borrarlos.
 *
 * La forma es la misma que espera el lienzo (`FlowGraphNode` y
 * `FlowGraphEdge` en FlowCanvas.tsx). La separacion horizontal tiene que
 * coincidir con COL_W de ese mismo archivo, para que los dos nodos caigan ya
 * alineados en la cuadricula: si alla se cambia el carril, aqui tambien.
 */
const ANCHO_DE_CARRIL = 132;

// El segundo nodo del diagrama nuevo va mas lejos que un carril normal:
// Decision es rectangular -saca tres conectores con sus etiquetas- y con la
// separacion de siempre le rozaba el hombro al de Inicio.
const SEPARACION_INICIAL = 220;

function grafoInicial(flowId: string) {
  const inicioId = `n_${flowId}_inicio`;
  const decisionId = `n_${flowId}_decision`;

  return {
    nodes: [
      {
        id: inicioId,
        tipo: "inicio",
        label: "Inicio",
        content: "",
        posX: 0,
        posY: 0,
        size: "md" as const,
      },
      {
        id: decisionId,
        tipo: "intention",
        label: "Decisión",
        content: "",
        posX: SEPARACION_INICIAL,
        posY: 0,
        size: "md" as const,
      },
    ],
    edges: [
      {
        id: `e_${flowId}_inicio`,
        sourceId: inicioId,
        targetId: decisionId,
        sourceHandle: "out",
        targetHandle: "in",
      },
    ],
  };
}

export async function createFlowAction(name: string): Promise<ActionResult<FlowSummary>> {
  const trimmed = name.trim();
  if (!trimmed) return { success: false, message: "El nombre es obligatorio." };

  try {
    // Crear lo puede cualquiera del equipo: el suyo es suyo, y con quien lo
    // comparte lo decide el. Antes hacia falta ser dueño o administrador, asi
    // que un colaborador no podia ni empezar uno.
    const ctx = await contexto();
    await ensureFlowTable();

    const existing = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "flows" WHERE "userId" = ${ctx.cuenta} AND "name" = ${trimmed} LIMIT 1
    `;
    if (existing.length > 0) {
      return { success: false, message: "Ya tienes un flujo con ese nombre." };
    }

    const id = `flow_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const grafo = grafoInicial(id);
    const nodesJson = JSON.stringify(grafo.nodes) as unknown as Prisma.InputJsonValue;
    const edgesJson = JSON.stringify(grafo.edges) as unknown as Prisma.InputJsonValue;
    const rows = await db.$queryRaw<Omit<FlowSummary, "puedeEditar" | "puedeCompartir">[]>`
      INSERT INTO "flows" ("id", "userId", "name", "nodes", "edges", "createdById")
      VALUES (${id}, ${ctx.cuenta}, ${trimmed}, ${nodesJson}::jsonb, ${edgesJson}::jsonb, ${ctx.persona})
      RETURNING "id", "name", "description", "createdAt", "updatedAt", "visibility", "createdById",
                jsonb_array_length("nodes") AS "nodeCount"
    `;
    return { success: true, data: { ...rows[0], puedeEditar: true, puedeCompartir: true } };
  } catch (error) {
    console.error("[createFlowAction]", error);
    return { success: false, message: "No se pudo crear el flujo." };
  }
}

export async function renameFlowAction(flowId: string, name: string): Promise<ActionResult<null>> {
  const trimmed = name.trim();
  if (!trimmed) return { success: false, message: "El nombre es obligatorio." };

  try {
    const ctx = await contexto();
    await ensureFlowTable();

    const flow = await buscarFlow(flowId, ctx.cuenta);
    if (!flow || !puedeVerlo(flow, ctx)) return { success: false, message: "Flujo no encontrado." };
    if (!puedeEditarlo(flow, ctx)) {
      return { success: false, message: "Este diagrama es de solo lectura." };
    }

    const conflict = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "flows" WHERE "userId" = ${ctx.cuenta} AND "name" = ${trimmed} AND "id" != ${flowId} LIMIT 1
    `;
    if (conflict.length > 0) return { success: false, message: "Ya tienes un flujo con ese nombre." };

    await db.$executeRaw`
      UPDATE "flows" SET "name" = ${trimmed}, "updatedAt" = NOW()
      WHERE "userId" = ${ctx.cuenta} AND "id" = ${flowId}
    `;
    return { success: true, data: null };
  } catch (error) {
    console.error("[renameFlowAction]", error);
    return { success: false, message: "No se pudo renombrar el flujo." };
  }
}

export async function saveFlowGraphAction(
  flowId: string,
  nodes: unknown[],
  edges: unknown[],
): Promise<ActionResult<null>> {
  try {
    const ctx = await contexto();
    await ensureFlowTable();

    // Se comprueba aqui y no solo en la pantalla: el lienzo guarda solo, y un
    // diagrama de lectura tiene que aguantar tambien si la llamada llega suelta.
    const flow = await buscarFlow(flowId, ctx.cuenta);

    if (!flow) {
      // No es de esta cuenta. Puede ser de otra que se lo comparte: si fue con
      // permiso de edicion, se guarda igual -es el mismo diagrama, no una
      // copia-. Antes esto contestaba "Flujo no encontrado" y por eso compartir
      // como editor no existia.
      const permiso = await permisoRecibido(flowId, ctx.cuenta);
      if (!permiso) return { success: false, message: "Flujo no encontrado." };
      if (permiso !== "edicion") {
        return { success: false, message: "Este diagrama es de solo lectura." };
      }

      const nodesJson = JSON.stringify(nodes) as unknown as Prisma.InputJsonValue;
      const edgesJson = JSON.stringify(edges) as unknown as Prisma.InputJsonValue;
      await db.$executeRaw`
        UPDATE "flows" SET "nodes" = ${nodesJson}::jsonb, "edges" = ${edgesJson}::jsonb, "updatedAt" = NOW()
        WHERE "id" = ${flowId}
      `;
      revalidatePath(`/diagramas/${flowId}`);
      revalidatePath("/diagramas");
      return { success: true, data: null };
    }

    if (!puedeVerlo(flow, ctx)) return { success: false, message: "Flujo no encontrado." };
    if (!puedeEditarlo(flow, ctx)) {
      return { success: false, message: "Este diagrama es de solo lectura." };
    }

    const nodesJson = JSON.stringify(nodes) as unknown as Prisma.InputJsonValue;
    const edgesJson = JSON.stringify(edges) as unknown as Prisma.InputJsonValue;

    await db.$executeRaw`
      UPDATE "flows" SET "nodes" = ${nodesJson}::jsonb, "edges" = ${edgesJson}::jsonb, "updatedAt" = NOW()
      WHERE "userId" = ${ctx.cuenta} AND "id" = ${flowId}
    `;

    // Sin esto el diagrama se guarda pero al salir y volver a entrar se ve
    // como estaba: la pagina es de servidor y Next sigue sirviendo la copia
    // que tenia en cache. Recargar a mano la saltaba, y de ahi la sensacion
    // de que el boton no habia hecho nada.
    revalidatePath(`/diagramas/${flowId}`);
    revalidatePath("/diagramas");

    return { success: true, data: null };
  } catch (error) {
    console.error("[saveFlowGraphAction]", error);
    return { success: false, message: "No se pudo guardar el flujo." };
  }
}

export async function deleteFlowAction(flowId: string): Promise<ActionResult<null>> {
  try {
    const ctx = await contexto();
    await ensureFlowTable();

    // Borrarlo es cosa de su autor y de quien gestiona la cuenta. Que el equipo
    // pueda editar un diagrama no quiere decir que pueda hacerlo desaparecer.
    const flow = await buscarFlow(flowId, ctx.cuenta);
    if (!flow || !puedeVerlo(flow, ctx)) return { success: false, message: "Flujo no encontrado." };
    if (!puedeMandarEnEl(flow, ctx)) {
      return { success: false, message: "Solo quien lo creó o un administrador puede eliminarlo." };
    }

    await db.$executeRaw`DELETE FROM "flow_shares" WHERE "flowId" = ${flowId}`;
    await db.$executeRaw`DELETE FROM "flows" WHERE "userId" = ${ctx.cuenta} AND "id" = ${flowId}`;
    revalidatePath("/diagramas");
    return { success: true, data: null };
  } catch (error) {
    console.error("[deleteFlowAction]", error);
    return { success: false, message: "No se pudo eliminar el flujo." };
  }
}

export async function setFlowVisibilityAction(
  flowId: string,
  visibility: FlowVisibility,
): Promise<ActionResult<null>> {
  if (!VISIBILIDADES.includes(visibility)) {
    return { success: false, message: "Visibilidad no válida." };
  }

  try {
    const ctx = await contexto();
    await ensureFlowTable();

    const flow = await buscarFlow(flowId, ctx.cuenta);
    if (!flow || !puedeVerlo(flow, ctx)) return { success: false, message: "Flujo no encontrado." };
    if (!puedeMandarEnEl(flow, ctx)) {
      return { success: false, message: "Solo quien lo creó o un administrador puede cambiar esto." };
    }

    // Un diagrama de los de antes no tiene autor, y sin autor "privado" no
    // significa nada: no habria nadie que pudiera volver a abrirlo. Al hacerlo
    // privado se queda con quien lo esta marcando.
    await db.$executeRaw`
      UPDATE "flows"
      SET "visibility" = ${visibility},
          "createdById" = COALESCE("createdById", ${ctx.persona}),
          "updatedAt" = NOW()
      WHERE "userId" = ${ctx.cuenta} AND "id" = ${flowId}
    `;

    revalidatePath("/diagramas");
    return { success: true, data: null };
  } catch (error) {
    console.error("[setFlowVisibilityAction]", error);
    return { success: false, message: "No se pudo cambiar la visibilidad." };
  }
}

/**
 * Un nombre libre a partir del original: "Ventas" -> "Ventas (copia)", y si ese
 * ya esta cogido, "(copia 2)", "(copia 3)"... El nombre es unico por cuenta, asi
 * que sin esto duplicar dos veces el mismo diagrama fallaba en la segunda.
 */
async function nombreLibre(base: string, cuenta: string): Promise<string> {
  const usados = new Set(
    (
      await db.$queryRaw<{ name: string }[]>`
        SELECT "name" FROM "flows" WHERE "userId" = ${cuenta}
      `
    ).map((r) => r.name),
  );

  // El nombre tiene un limite razonable: el original recortado deja sitio al
  // sufijo, que si no la copia de una copia de una copia crece sin fin.
  const raiz = base.replace(/\s*\(copia(?:\s+\d+)?\)$/i, "").slice(0, 120);

  let candidato = `${raiz} (copia)`;
  for (let n = 2; usados.has(candidato); n += 1) {
    candidato = `${raiz} (copia ${n})`;
  }
  return candidato;
}

/**
 * Una copia del diagrama, con sus nodos y conexiones tal cual, a nombre de quien
 * la hace. Sirve para partir de uno que ya funciona sin miedo a estropearlo.
 *
 * La copia nace con la misma visibilidad que el original: quien duplica algo del
 * equipo espera que la copia siga siendo del equipo, y quien duplica uno suyo
 * privado no querria que de repente lo viera todo el mundo.
 */
export async function duplicateFlowAction(flowId: string): Promise<ActionResult<FlowSummary>> {
  try {
    const ctx = await contexto();
    await ensureFlowTable();

    const rows = await db.$queryRaw<
      {
        userId: string;
        name: string;
        description: string | null;
        visibility: string;
        createdById: string | null;
      }[]
    >`
      SELECT "userId", "name", "description", "visibility", "createdById"
      FROM "flows"
      WHERE "id" = ${flowId}
      LIMIT 1
    `;
    const original = rows[0];
    if (!original) return { success: false, message: "Flujo no encontrado." };

    // Uno recibido tambien se puede copiar: es la forma de que una cuenta se
    // quede con el diagrama que le enseñaron y lo siga a su manera. La copia
    // nace en SU cuenta, y como no es del equipo de quien lo hizo, nace privada.
    const recibido = original.userId !== ctx.cuenta;
    if (recibido) {
      // Copiar se puede con cualquiera de los dos permisos: se copia lo que se
      // ve, y verlo ya se puede.
      if (!(await permisoRecibido(flowId, ctx.cuenta))) {
        return { success: false, message: "Flujo no encontrado." };
      }
    } else if (!puedeVerlo(original, ctx)) {
      return { success: false, message: "Flujo no encontrado." };
    }

    const id = `flow_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const nombre = await nombreLibre(original.name, ctx.cuenta);
    const visibilidad = recibido ? "privado" : original.visibility;

    // Los nodos se copian dentro de la base: son varios kB de JSON que no hacen
    // falta aqui para nada mas que volver a mandarlos.
    const creado = await db.$queryRaw<
      (Omit<FlowSummary, "puedeEditar" | "puedeCompartir" | "recibido" | "compartidoCon">)[]
    >`
      INSERT INTO "flows" ("id", "userId", "name", "description", "nodes", "edges", "createdById", "visibility")
      SELECT ${id}, ${ctx.cuenta}, ${nombre}, "description", "nodes", "edges", ${ctx.persona}, ${visibilidad}
      FROM "flows"
      WHERE "id" = ${flowId}
      RETURNING "id", "name", "description", "createdAt", "updatedAt", "visibility", "createdById",
                CASE WHEN jsonb_typeof("nodes") = 'array' THEN jsonb_array_length("nodes") ELSE 0 END AS "nodeCount"
    `;
    if (!creado[0]) return { success: false, message: "No se pudo duplicar el diagrama." };

    revalidatePath("/diagramas");
    return {
      success: true,
      data: {
        ...creado[0],
        recibido: false,
        compartidoCon: 0,
        puedeEditar: true,
        puedeCompartir: true,
      },
    };
  } catch (error) {
    console.error("[duplicateFlowAction]", error);
    return { success: false, message: "No se pudo duplicar el diagrama." };
  }
}

export type PermisoCompartido = "lectura" | "edicion";

export type CuentaDestino = {
  id: string;
  name: string | null;
  email: string;
  company: string;
  compartido: boolean;
  /** Con qué permiso se le comparte hoy. `lectura` si aún no se le comparte. */
  permiso: PermisoCompartido;
};

/** Una cuenta y con qué permiso se le enseña el diagrama. */
export type CompartirCon = { accountUserId: string; permiso: PermisoCompartido };

/**
 * A qué cuentas se les puede enseñar este diagrama, y a cuáles ya.
 *
 * Son las cuentas de cliente sobre las que manda quien pregunta: un admin las
 * tiene todas; un reseller, las suyas. La misma lista que reparte clientes entre
 * el equipo, para que no haya dos ideas de "mis cuentas".
 */
export async function getFlowShareTargetsAction(
  flowId: string,
): Promise<ActionResult<CuentaDestino[]>> {
  try {
    const user = await currentUser();
    const ctx = await contexto();
    await ensureFlowTable();

    const flow = await buscarFlow(flowId, ctx.cuenta);
    if (!flow || !puedeVerlo(flow, ctx)) return { success: false, message: "Flujo no encontrado." };
    if (!puedeMandarEnEl(flow, ctx)) {
      return { success: false, message: "Solo quien lo creó o un administrador puede compartirlo." };
    }

    const [cuentas, compartidas] = await Promise.all([
      clientesDeLaCuenta({ id: ctx.cuenta, role: user?.role ?? "user" }),
      db.$queryRaw<{ accountUserId: string; permiso: string }[]>`
        SELECT "accountUserId", "permiso" FROM "flow_shares" WHERE "flowId" = ${flowId}
      `,
    ]);

    const yaTiene = new Map(
      compartidas.map((c) => [c.accountUserId, c.permiso === "edicion" ? "edicion" : "lectura"] as const),
    );
    return {
      success: true,
      // La propia cuenta no se lista: ya lo tiene, y marcarla no querria decir nada.
      data: cuentas
        .filter((c) => c.id !== ctx.cuenta)
        .map((c) => ({
          ...c,
          compartido: yaTiene.has(c.id),
          permiso: yaTiene.get(c.id) ?? "lectura",
        })),
    };
  } catch (error) {
    console.error("[getFlowShareTargetsAction]", error);
    return { success: false, message: "No se pudieron cargar las cuentas." };
  }
}

export async function setFlowSharesAction(
  flowId: string,
  destinos: CompartirCon[],
): Promise<ActionResult<null>> {
  try {
    const user = await currentUser();
    const ctx = await contexto();
    await ensureFlowTable();

    const flow = await buscarFlow(flowId, ctx.cuenta);
    if (!flow || !puedeVerlo(flow, ctx)) return { success: false, message: "Flujo no encontrado." };
    if (!puedeMandarEnEl(flow, ctx)) {
      return { success: false, message: "Solo quien lo creó o un administrador puede compartirlo." };
    }

    // Solo cuentas sobre las que se manda de verdad: lo que llegue del navegador
    // no decide a quien se le enseña un diagrama.
    const cuentas = await clientesDeLaCuenta({ id: ctx.cuenta, role: user?.role ?? "user" });
    const suyas = new Set(cuentas.map((c) => c.id));
    // Una entrada por cuenta -si el navegador manda la misma dos veces, manda la
    // ultima- y el permiso se normaliza aqui: cualquier cosa que no sea
    // "edicion" es lectura.
    const porCuenta = new Map<string, PermisoCompartido>();
    for (const destino of destinos) {
      if (destino.accountUserId === ctx.cuenta) continue;
      if (!suyas.has(destino.accountUserId)) continue;
      porCuenta.set(destino.accountUserId, destino.permiso === "edicion" ? "edicion" : "lectura");
    }

    await db.$executeRaw`DELETE FROM "flow_shares" WHERE "flowId" = ${flowId}`;
    for (const [accountUserId, permiso] of porCuenta) {
      const id = `fs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await db.$executeRaw`
        INSERT INTO "flow_shares" ("id", "flowId", "accountUserId", "sharedById", "permiso")
        VALUES (${id}, ${flowId}, ${accountUserId}, ${ctx.persona}, ${permiso})
        ON CONFLICT ("flowId", "accountUserId")
        DO UPDATE SET "permiso" = EXCLUDED."permiso"
      `;
    }

    revalidatePath("/diagramas");
    return { success: true, data: null };
  } catch (error) {
    console.error("[setFlowSharesAction]", error);
    return { success: false, message: "No se pudo guardar con quién se comparte." };
  }
}

/* ------------------------------------------------------------------ *
 * Generar un diagrama a partir del entrenamiento del agente
 * ------------------------------------------------------------------ */

/**
 * Que tipo de nodo le toca a un paso segun lo que hace. Un paso que solo
 * habla es un nodo de texto; si ademas ejecuta una funcion, se dibuja con el
 * icono de esa funcion, que dice mas de un vistazo.
 */
const TIPO_POR_FUNCION: Record<string, string> = {
  captura_datos: "solicitud",
  notificar_asesor: "notificacion",
  consulta_datos: "sheets_read",
  actualizar_datos: "sheets_write",
  ejecutar_flujo: "flujo",
  enrutamiento: "intention",
};

interface PasoDeEntrenamiento {
  title?: string;
  mainMessage?: string;
  condicionParaAvanzar?: string;
  elements?: { kind?: string; fn?: string; text?: string }[];
}

function limpiar(texto: string, tope: number): string {
  // El nodo muestra dos renglones: se recorta para que la tarjeta no cargue
  // el paso entero, que en estos prompts puede ser media pantalla.
  const plano = texto
    .replace(/[*_>#`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plano.length > tope ? `${plano.slice(0, tope - 1).trimEnd()}…` : plano;
}

function tipoDelPaso(paso: PasoDeEntrenamiento): string {
  const funcion = (paso.elements ?? []).find((el) => el?.kind === "function" && el.fn);
  if (funcion?.fn && TIPO_POR_FUNCION[funcion.fn]) return TIPO_POR_FUNCION[funcion.fn];
  return "text";
}

function grafoDesdePasos(flowId: string, pasos: PasoDeEntrenamiento[]) {
  const nodes: {
    id: string;
    tipo: string;
    label: string;
    content: string;
    posX: number;
    posY: number;
    size: "md";
  }[] = [];
  const edges: {
    id: string;
    sourceId: string;
    targetId: string;
    sourceHandle: string;
    targetHandle: string;
  }[] = [];

  const inicioId = `n_${flowId}_inicio`;
  nodes.push({ id: inicioId, tipo: "inicio", label: "Inicio", content: "", posX: 0, posY: 0, size: "md" });

  let anteriorId = inicioId;
  let anteriorSalida = "out";

  pasos.forEach((paso, i) => {
    const id = `n_${flowId}_p${i + 1}`;
    const mensaje = limpiar(paso.mainMessage ?? "", 160);
    const condicion = limpiar(paso.condicionParaAvanzar ?? "", 120);

    // Con condicion para avanzar el paso se dibuja como Decision: sale por Si
    // (sigue) y por No (queda libre para que se dibuje que hacer cuando no se
    // cumple). La condicion se suma al texto para que se vea en el nodo.
    const tipo = condicion ? "intention" : tipoDelPaso(paso);
    const texto = condicion
      ? [mensaje, `Avanza si: ${condicion}`].filter(Boolean).join("\n\n")
      : mensaje;

    nodes.push({
      id,
      tipo,
      label: (paso.title ?? "").trim() || `Paso ${i + 1}`,
      content: texto,
      posX: (i + 1) * ANCHO_DE_CARRIL,
      posY: 0,
      size: "md",
    });

    edges.push({
      id: `e_${flowId}_${i}`,
      sourceId: anteriorId,
      targetId: id,
      sourceHandle: anteriorSalida,
      targetHandle: "in",
    });

    anteriorId = id;
    anteriorSalida = tipo === "intention" ? "yes" : "out";
  });

  return { nodes, edges };
}

/**
 * Dibuja los pasos del entrenamiento del agente en SU diagrama.
 *
 * Cada agente tiene un solo diagrama generado (se reconoce por "promptId"):
 * la primera vez se crea y de ahi en adelante se vuelve a dibujar encima, asi
 * que el diagrama siempre retrata el prompt de hoy. Ojo: eso pisa lo que se
 * haya movido o agregado a mano en ese diagrama; los diagramas hechos a mano
 * desde /diagramas no se tocan nunca, porque no tienen promptId.
 */
export async function createFlowFromPromptAction(
  promptId: string,
): Promise<ActionResult<{ id: string; name: string; pasos: number; actualizado: boolean }>> {
  try {
    const userId = await requireUserId();
    await ensureFlowTable();

    const prompt = await db.agentPrompt.findFirst({
      where: { id: promptId, userId },
      select: { sections: true, businessName: true },
    });
    if (!prompt) return { success: false, message: "No se encontró el entrenamiento del agente." };

    const secciones = (prompt.sections ?? {}) as { training?: { steps?: PasoDeEntrenamiento[] } };
    const pasos = Array.isArray(secciones.training?.steps) ? secciones.training!.steps! : [];
    if (pasos.length === 0) {
      return { success: false, message: "El entrenamiento no tiene pasos todavía. Guarda el prompt y vuelve a intentarlo." };
    }

    const existente = await db.$queryRaw<{ id: string; name: string }[]>`
      SELECT "id", "name" FROM "flows"
      WHERE "userId" = ${userId} AND "promptId" = ${promptId}
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `;

    if (existente.length > 0) {
      const { id, name } = existente[0];
      const grafo = grafoDesdePasos(id, pasos);
      const nodesJson = JSON.stringify(grafo.nodes) as unknown as Prisma.InputJsonValue;
      const edgesJson = JSON.stringify(grafo.edges) as unknown as Prisma.InputJsonValue;

      await db.$executeRaw`
        UPDATE "flows"
        SET "nodes" = ${nodesJson}::jsonb, "edges" = ${edgesJson}::jsonb, "updatedAt" = NOW()
        WHERE "userId" = ${userId} AND "id" = ${id}
      `;
      return { success: true, data: { id, name, pasos: pasos.length, actualizado: true } };
    }

    // Primera vez: nombre libre, y si ya hay uno con ese nombre se numera. El
    // indice unico es (userId, name), asi que sin esto el insert falla.
    const base = `Flujo de ${(prompt.businessName ?? "").trim() || "mi agente"}`;
    const usados = await db.$queryRaw<{ name: string }[]>`
      SELECT "name" FROM "flows" WHERE "userId" = ${userId} AND "name" LIKE ${`${base}%`}
    `;
    const tomados = new Set(usados.map((f) => f.name));
    let name = base;
    for (let i = 2; tomados.has(name); i++) name = `${base} ${i}`;

    const id = `flow_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const grafo = grafoDesdePasos(id, pasos);
    const nodesJson = JSON.stringify(grafo.nodes) as unknown as Prisma.InputJsonValue;
    const edgesJson = JSON.stringify(grafo.edges) as unknown as Prisma.InputJsonValue;

    await db.$executeRaw`
      INSERT INTO "flows" ("id", "userId", "name", "promptId", "nodes", "edges")
      VALUES (${id}, ${userId}, ${name}, ${promptId}, ${nodesJson}::jsonb, ${edgesJson}::jsonb)
    `;

    return { success: true, data: { id, name, pasos: pasos.length, actualizado: false } };
  } catch (error) {
    console.error("[createFlowFromPromptAction]", error);
    return { success: false, message: "No se pudo generar el diagrama." };
  }
}
