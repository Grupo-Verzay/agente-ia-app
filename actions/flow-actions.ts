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
  /** Cuantos nodos tiene dibujados. Para que la tarjeta del listado diga algo. */
  nodeCount: number;
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
    await db.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "flows_user_name_unique" ON "flows" ("userId", "name")
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "flows_prompt_idx" ON "flows" ("userId", "promptId")
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
    // El conteo se hace en la base y no trayendo los nodos: el listado solo
    // necesita el numero, y un diagrama grande son varios kB de JSON por fila.
    // El CASE es por si algun diagrama viejo guardo algo que no es una lista.
    const rows = await db.$queryRaw<FlowSummary[]>`
      SELECT "id", "name", "description", "createdAt", "updatedAt",
             CASE WHEN jsonb_typeof("nodes") = 'array' THEN jsonb_array_length("nodes") ELSE 0 END AS "nodeCount"
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
 * `FlowGraphEdge` en FlowCanvas.tsx). La separacion horizontal tiene que
 * coincidir con COL_W de ese mismo archivo, para que los dos nodos caigan ya
 * alineados en la cuadricula: si alla se cambia el carril, aqui tambien.
 */
const ANCHO_DE_CARRIL = 132;

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
      RETURNING "id", "name", "description", "createdAt", "updatedAt",
                jsonb_array_length("nodes") AS "nodeCount"
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
