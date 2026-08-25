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

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export interface FlowSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowDetail extends FlowSummary {
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
    await db.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "flows_user_name_unique" ON "flows" ("userId", "name")
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "flows_user_updated_idx" ON "flows" ("userId", "updatedAt" DESC)
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

export async function listFlowsAction(): Promise<ActionResult<FlowSummary[]>> {
  try {
    const userId = await requireUserId();
    await ensureFlowTable();
    const rows = await db.$queryRaw<FlowSummary[]>`
      SELECT "id", "name", "description", "createdAt", "updatedAt"
      FROM "flows"
      WHERE "userId" = ${userId}
      ORDER BY "updatedAt" DESC
    `;
    return { success: true, data: rows };
  } catch (error) {
    console.error("[listFlowsAction]", error);
    return { success: false, message: "No se pudieron obtener los flujos." };
  }
}

export async function getFlowAction(flowId: string): Promise<ActionResult<FlowDetail>> {
  try {
    const userId = await requireUserId();
    await ensureFlowTable();
    const rows = await db.$queryRaw<FlowDetail[]>`
      SELECT "id", "name", "description", "nodes", "edges", "createdAt", "updatedAt"
      FROM "flows"
      WHERE "userId" = ${userId} AND "id" = ${flowId}
      LIMIT 1
    `;
    const flow = rows[0];
    if (!flow) return { success: false, message: "Flujo no encontrado." };
    return { success: true, data: flow };
  } catch (error) {
    console.error("[getFlowAction]", error);
    return { success: false, message: "No se pudo obtener el flujo." };
  }
}

/**
 * Los dos nodos con los que nace todo diagrama nuevo, ya conectados: el que
 * marca el arranque y el primer mensaje al cliente.
 *
 * Un lienzo en blanco no dice por donde se empieza a leer, y estos diagramas
 * se le muestran al cliente. Se siembran aqui, al crear, y no en el lienzo,
 * para que queden guardados en la base igual que cualquier otro nodo y el
 * usuario pueda editarlos o borrarlos.
 *
 * La forma es la misma que espera el lienzo (`FlowGraphNode` y
 * `FlowGraphEdge` en FlowCanvas.tsx). La separacion horizontal es el ancho
 * de carril del lienzo, para que caigan ya alineados en la cuadricula.
 */
const ANCHO_DE_CARRIL = 350;

function grafoInicial(flowId: string) {
  const inicioId = `n_${flowId}_inicio`;
  const bienvenidaId = `n_${flowId}_bienvenida`;

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
        id: bienvenidaId,
        tipo: "text",
        label: "Bienvenida",
        content: "",
        posX: ANCHO_DE_CARRIL,
        posY: 0,
        size: "md" as const,
      },
    ],
    edges: [
      {
        id: `e_${flowId}_inicio`,
        sourceId: inicioId,
        targetId: bienvenidaId,
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
    const userId = await requireUserId();
    await ensureFlowTable();

    const existing = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "flows" WHERE "userId" = ${userId} AND "name" = ${trimmed} LIMIT 1
    `;
    if (existing.length > 0) {
      return { success: false, message: "Ya tienes un flujo con ese nombre." };
    }

    const id = `flow_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const grafo = grafoInicial(id);
    const nodesJson = JSON.stringify(grafo.nodes) as unknown as Prisma.InputJsonValue;
    const edgesJson = JSON.stringify(grafo.edges) as unknown as Prisma.InputJsonValue;
    const rows = await db.$queryRaw<FlowSummary[]>`
      INSERT INTO "flows" ("id", "userId", "name", "nodes", "edges")
      VALUES (${id}, ${userId}, ${trimmed}, ${nodesJson}::jsonb, ${edgesJson}::jsonb)
      RETURNING "id", "name", "description", "createdAt", "updatedAt"
    `;
    return { success: true, data: rows[0] };
  } catch (error) {
    console.error("[createFlowAction]", error);
    return { success: false, message: "No se pudo crear el flujo." };
  }
}

export async function renameFlowAction(flowId: string, name: string): Promise<ActionResult<null>> {
  const trimmed = name.trim();
  if (!trimmed) return { success: false, message: "El nombre es obligatorio." };

  try {
    const userId = await requireUserId();
    await ensureFlowTable();

    const conflict = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "flows" WHERE "userId" = ${userId} AND "name" = ${trimmed} AND "id" != ${flowId} LIMIT 1
    `;
    if (conflict.length > 0) return { success: false, message: "Ya tienes un flujo con ese nombre." };

    await db.$executeRaw`
      UPDATE "flows" SET "name" = ${trimmed}, "updatedAt" = NOW()
      WHERE "userId" = ${userId} AND "id" = ${flowId}
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
    const userId = await requireUserId();
    await ensureFlowTable();

    const nodesJson = JSON.stringify(nodes) as unknown as Prisma.InputJsonValue;
    const edgesJson = JSON.stringify(edges) as unknown as Prisma.InputJsonValue;

    await db.$executeRaw`
      UPDATE "flows" SET "nodes" = ${nodesJson}::jsonb, "edges" = ${edgesJson}::jsonb, "updatedAt" = NOW()
      WHERE "userId" = ${userId} AND "id" = ${flowId}
    `;
    return { success: true, data: null };
  } catch (error) {
    console.error("[saveFlowGraphAction]", error);
    return { success: false, message: "No se pudo guardar el flujo." };
  }
}

export async function deleteFlowAction(flowId: string): Promise<ActionResult<null>> {
  try {
    const userId = await requireUserId();
    await ensureFlowTable();
    await db.$executeRaw`DELETE FROM "flows" WHERE "userId" = ${userId} AND "id" = ${flowId}`;
    return { success: true, data: null };
  } catch (error) {
    console.error("[deleteFlowAction]", error);
    return { success: false, message: "No se pudo eliminar el flujo." };
  }
}
