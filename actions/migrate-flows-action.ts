"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

/**
 * Migra los flujos del editor de lista (isPro=false) al creador visual
 * (isPro=true), creando las conexiones que el motor visual necesita.
 *
 * El editor de lista es LINEAL (por `order`); el motor visual sigue las
 * conexiones (edges). Para conservar la misma ejecución:
 *  - nodo normal / seguimiento → 1 conexión al siguiente (handle "out").
 *  - nodo "intention"          → 2 conexiones ("yes" y "no") al MISMO
 *    siguiente nodo (ambas ramas van al mismo lado).
 *  - último nodo               → sin conexión (cierra el flujo).
 *
 * Solo toca flujos isPro=false que tengan nodos y NO tengan conexiones aún
 * (para no pisar flujos ya armados). Los nodos se conservan intactos.
 */
export async function migrateFlowsToVisual(): Promise<{
  ok: boolean;
  error?: string;
  migrated: { name: string; nodes: number; edges: number }[];
  skipped: { name: string; reason: string }[];
}> {
  const user = await currentUser();
  if (!user?.id) {
    return { ok: false, error: "No autorizado.", migrated: [], skipped: [] };
  }
  const userId = user.effectiveId ?? user.id;

  const flows = await db.workflow.findMany({
    where: { userId, isPro: false },
    include: {
      nodes: { orderBy: { order: "asc" } },
      workflowEdges: { select: { id: true } },
    },
  });

  const migrated: { name: string; nodes: number; edges: number }[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const wf of flows) {
    if (wf.nodes.length === 0) {
      skipped.push({ name: wf.name, reason: "sin nodos" });
      continue;
    }
    if (wf.workflowEdges.length > 0) {
      skipped.push({ name: wf.name, reason: "ya tenía conexiones" });
      continue;
    }

    const ordered = [...wf.nodes].sort((a, b) => a.order - b.order);
    const edgesData: {
      workflowId: string;
      sourceId: string;
      targetId: string;
      sourceHandle: string;
    }[] = [];

    for (let i = 0; i < ordered.length - 1; i++) {
      const cur = ordered[i];
      const nxt = ordered[i + 1];
      if (cur.tipo === "intention") {
        edgesData.push({ workflowId: wf.id, sourceId: cur.id, targetId: nxt.id, sourceHandle: "yes" });
        edgesData.push({ workflowId: wf.id, sourceId: cur.id, targetId: nxt.id, sourceHandle: "no" });
      } else {
        edgesData.push({ workflowId: wf.id, sourceId: cur.id, targetId: nxt.id, sourceHandle: "out" });
      }
    }

    await db.$transaction([
      ...edgesData.map((data) => db.workflowEdge.create({ data })),
      db.workflow.update({ where: { id: wf.id }, data: { isPro: true } }),
    ]);

    migrated.push({ name: wf.name, nodes: ordered.length, edges: edgesData.length });
  }

  revalidatePath("/flow");
  revalidatePath("/workflow");
  return { ok: true, migrated, skipped };
}
