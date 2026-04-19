"use server"
import { buildLinearExecutionOrder } from "@/app/(root)/workflow/[workflowId]/helpers/buildLinearExecutionOrder";
import { auth } from "@/auth";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { minioClient } from "@/lib/minio";
import { createNodeflowSchema, createNodeflowSchemaType } from "@/schema/nodeflow";
import {
  MAX_NODES_PER_WORKFLOW,
  MAX_SEGUIMIENTOS_PER_WORKFLOW,
  UpdateNodePositionInput,
} from "@/types/workflow";
import { WorkflowNode } from "@prisma/client";
import { redirect } from "next/navigation";

export async function createNode(form: createNodeflowSchemaType) {
  const user = await currentUser();

  if (!user) return {
    success: false,
    message: "Usuario no encontrado."
  };

  const { success, data } = createNodeflowSchema.safeParse(form);

  if (!success) return {
    success: false,
    message: "Datos del formulario inválidos."
  };

  const totalNodes = await db.workflowNode.count({
    where: { workflowId: data.workflowId },
  });

  // Si el flujo ya está en 10 (o más), no permitir agregar más (incluye flujos antiguos > 10)
  if (totalNodes >= MAX_NODES_PER_WORKFLOW) return {
    success: false,
    message: `Este flujo ya alcanzó el límite de ${MAX_NODES_PER_WORKFLOW} nodos. Elimina un nodo existente para poder agregar uno nuevo.`
  };

  const requestedTipo = (data.tipo ?? "").toLowerCase();
  const isSeguimiento = requestedTipo.startsWith("seguimiento-");
  if (isSeguimiento) {
    const totalSeguimientos = await db.workflowNode.count({
      where: {
        workflowId: data.workflowId,
        tipo: { startsWith: "seguimiento-" },
      },
    });

    if (totalSeguimientos >= MAX_SEGUIMIENTOS_PER_WORKFLOW) return {
      success: false,
      message: `Este flujo ya alcanzó el límite de ${MAX_SEGUIMIENTOS_PER_WORKFLOW} seguimientos.`,
    };
  }

  const maxOrder = await db.workflowNode.aggregate({
    where: { workflowId: data.workflowId },
    _max: { order: true },
  });

  const parseMaxOrder = (maxOrder._max.order ?? 0) as number;

  const result = await db.workflowNode.create({
    data: {
      ...data,
      order: parseMaxOrder + 1, // siguiente orden disponible
    },
  });

  if (!result) return {
    success: false,
    message: 'Falló la creación del nodo.'
  }
  redirect(`/flow/${data.workflowId}`);
}

// Método para editar un nodo
export async function updateNode(nodeId: string, newMessage?: string) {
  try {
    if (!nodeId) {
      return {
        success: false,
        message: 'Parámetro "nodeId" es requerido.',
      };
    }

    const updatedNode = await db.workflowNode.update({
      where: { id: nodeId },
      data: { message: newMessage ?? '' }, // Guarda string vacío si es null/undefined
    });

    return {
      success: true,
      message: 'Nodo actualizado con éxito.',
      data: updatedNode,
    };
  } catch (error: any) {
    return {
      success: false,
      message: 'Error al actualizar el nodo' + error?.message || error,
    };
  }
}

/* TODO: DEPRECATED */
export async function updateNodeOrder(nodeId: string, order: number) {
  try {
    if (!nodeId) {
      return {
        success: false,
        message: 'Parámetro "nodeId" requerido.',
      };
    }

    const updatedNode = await db.workflowNode.update({
      where: { id: nodeId },
      data: { order }, // 👈 solo se actualiza el orden
    });

    return {
      success: true,
      message: 'Orden del nodo actualizado con éxito.',
      data: updatedNode,
    };
  } catch (error: any) {
    console.error("Error updateNodeOrder:", error);
    return {
      success: false,
      message: 'Error al actualizar el orden: ' + (error.message || error),
    };
  }
}

export async function updateUrlNode(nodeId: string, url: string) {
  try {
    if (!nodeId || !url) {
      return {
        success: false,
        message: 'Parámetros inválidos.'
      }
    }

    const updatedNode = await db.workflowNode.update({
      where: { id: nodeId },
      data: { url },
    });

    return {
      success: true,
      message: 'Archivo subido con éxito.',
      data: updatedNode
    }
  } catch (error) {
    console.error('Error update node', error);
    return {
      success: false,
      message: 'Ocurrió un error al intentar actualizar la url del nodo.',
    };
  }
}

export async function updateDelayNode(nodeId: string, delay: string) {
  try {
    if (!nodeId || !delay) {
      return {
        success: false,
        message: 'Parámetros inválidos.'
      }
    }

    const updatedNode = await db.workflowNode.update({
      where: { id: nodeId },
      data: { delay },
    });

    return {
      success: true,
      message: 'Seguimiento actualizado con éxito.',
      data: updatedNode
    }
  } catch (error) {
    console.error('Error update node', error);
    return {
      success: false,
      message: 'Ocurrió un error al actualizar el seguimiento.',
    };
  }
}

export async function updateInactivityNode(nodeId: string, inactividad: boolean) {
  try {
    if (!nodeId) {
      return {
        success: false,
        message: 'Parámetros inválidos.'
      }
    };

    const updatedNode = await db.workflowNode.update({
      where: { id: nodeId },
      data: { inactividad },
    });

    return {
      success: true,
      message: 'Seguimiento actualizado con éxito.',
      data: updatedNode
    }
  } catch (error) {
    console.error('Error update node', error);
    return {
      success: false,
      message: 'Ocurrió un error al actualizar el seguimiento.',
    };
  }
}

export async function updateNodeAiEnabled(nodeId: string, aiEnabled: boolean) {
  try {
    if (!nodeId) {
      return {
        success: false,
        message: 'Parámetros inválidos.',
      };
    }

    const updatedNode = await db.workflowNode.update({
      where: { id: nodeId },
      data: { aiEnabled },
    });

    return {
      success: true,
      message: 'Configuración de IA actualizada con éxito.',
      data: updatedNode,
    };
  } catch (error) {
    console.error('Error update node ai enabled', error);
    return {
      success: false,
      message: 'Ocurrió un error al actualizar la configuración de IA.',
    };
  }
}

// Método para eliminar un nodo
export async function deleteNode(nodeId: string, workflowId: string) {
  try {
    if (!nodeId) {
      return {
        success: false,
        message: "ID del nodo no proporcionado.",
      }
    }

    const deletedNode = await db.workflowNode.delete({
      where: { id: nodeId },
    })

    return {
      success: true,
      message: "Nodo eliminado con éxito.",
      data: deletedNode,
    }
  } catch (error) {
    console.error("Error al eliminar el nodo:", error)
    return {
      success: false,
      message: "Ocurrió un error al eliminar el nodo.",
    }
  }
}

//Método para eliminar TODOS los nodos asociados a un workflowId
export async function deleteAllNodes(workflowId: string) {
  try {
    if (!workflowId) {
      return {
        success: false,
        message: "ID del flujo no proporcionado.",
      }
    }

    const deletedNode = await db.workflowNode.deleteMany({
      where: { workflowId },
    })

    return {
      success: true,
      message: "Nodos eliminados con éxito.",
      data: deletedNode,
    }
  } catch (error) {
    console.error("Error al intentar eliminar los nodos:", error)
    return {
      success: false,
      message: "Ocurrió un error al eliminar los nodos.",
    }
  }
}

export async function deleteFileNode(minIoUrl: string, nodeId: string) {
  try {
    if (!minIoUrl || !nodeId) {
      return {
        success: false,
        message: "Faltan parámetros necesarios.",
      }
    }

    const url = new URL(minIoUrl)
    const parts = url.pathname.split('/').filter(Boolean)

    const bucket = parts[0]
    const objectName = decodeURIComponent(parts.slice(1).join('/'))

    await minioClient.removeObject(bucket, objectName)

    //  Limpiar la URL del nodo en la base de datos
    const updatedNode = await db.workflowNode.update({
      where: { id: nodeId },
      data: { url: null },
    })

    return {
      success: true,
      message: "Archivo eliminado y nodo actualizado con éxito.",
      data: updatedNode,
    }
  } catch (error) {
    console.error("Error al eliminar archivo o actualizar nodo:", error)
    return {
      success: false,
      message: "Ocurrió un error al eliminar el archivo o actualizar el nodo.",
    }
  }
}

/* TODO: DEFECTUOSO */
export async function deleteWorkflowFiles(userId: string, workflowId: string) {
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) return {
    success: false,
    message: 'Falta S3_BUCKET_NAME en variables de entorno.'
  }
  const basePrefix = `verzay-media/${userId}`;

  try {
    const stream = minioClient.listObjectsV2(bucket, basePrefix, true);
    const objectsToDelete: string[] = [];

    for await (const obj of stream) {
      if (obj.name?.startsWith(`${basePrefix}${workflowId}/`)) {
        objectsToDelete.push(obj.name);
      }
    }

    if (objectsToDelete.length === 0) {
      return {
        success: true,
        message: "No se encontraron archivos asociados al flujo.",
        data: [],
      };
    }

    await minioClient.removeObjects(bucket, objectsToDelete);

    return {
      success: true,
      message: `Se eliminaron ${objectsToDelete.length} archivo(s) del flujo.`,
      data: objectsToDelete,
    };
  } catch (error) {
    console.error("Error al eliminar archivos del flujo:", error);
    return {
      success: false,
      message: "Ocurrió un error al eliminar archivos del flujo.",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getNodeforUser(workflowId: string) {
  return db.workflowNode.findMany({
    where: {
      workflowId,
    },
    orderBy: { order: "asc" },
  })
}

/* SE UTILIZA PARA SABER EL ORDEN DE LOS NODOS */
export async function getExecutionNodesForWorkflow(workflowId: string): Promise<WorkflowNode[]> {
  const [nodes, edges] = await Promise.all([
    db.workflowNode.findMany({
      where: { workflowId },
    }),
    db.workflowEdge.findMany({
      where: { workflowId },
      select: { sourceId: true, targetId: true },
    }),
  ]);

  const orderedIds = buildLinearExecutionOrder(nodes, edges);

  const byId = new Map<string, WorkflowNode>(nodes.map((n) => [n.id, n]));

  const orderedNodes = orderedIds
    .map((id) => byId.get(id))
    .filter((n): n is WorkflowNode => n !== undefined);

  return orderedNodes;
}

export async function createWorkflowEdge(params: {
  workflowId: string;
  sourceId: string;
  targetId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}) {
  const user = await currentUser();

  const { workflowId, sourceId, targetId } = params;

  const sourceHandle = params.sourceHandle ?? "out";
  const targetHandle = params.targetHandle ?? "in";

  if (sourceId === targetId) {
    return { success: false, message: "No puedes conectar un nodo consigo mismo." };
  }

  //  MVP: impedir múltiples conexiones desde el MISMO handle del mismo nodo
  const existing = await db.workflowEdge.findFirst({
    where: {
      workflowId,
      sourceId,
      sourceHandle, // 👈 ahora valida por handle
    },
    select: { id: true },
  });

  if (existing) {
    return { success: false, message: "Nodo ya relacionado (salida ocupada)." };
  }

  // ownership
  const wf = await db.workflow.findFirst({
    where: { id: workflowId, userId: user.id },
    select: { id: true },
  });
  if (!wf) return { success: false, message: "Workflow no encontrado." };

  // nodos válidos
  const nodes = await db.workflowNode.findMany({
    where: { id: { in: [sourceId, targetId] }, workflowId },
    select: { id: true },
  });
  if (nodes.length !== 2) return { success: false, message: "Nodos inválidos para este workflow." };

  const edge = await db.workflowEdge.create({
    data: { workflowId, sourceId, targetId, sourceHandle, targetHandle },
    select: { id: true, sourceId: true, targetId: true, sourceHandle: true, targetHandle: true },
  });

  return { success: true, edge };
}

export async function deleteWorkflowEdge(params: {
  workflowId: string;
  edgeId: string;
}) {
  const user = await currentUser();
  const { workflowId, edgeId } = params;

  //  validar ownership del workflow
  const wf = await db.workflow.findFirst({
    where: { id: workflowId, userId: user.id },
    select: { id: true },
  });
  if (!wf) return { success: false, message: 'Workflow no encontrado.' };

  // borrar solo si el edge pertenece al workflow
  await db.workflowEdge.deleteMany({
    where: { id: edgeId, workflowId },
  });

  return { success: true, message: 'Se eliminó la relación correctamente.' };
}

export async function getWorkflowEdges(workflowId: string) {
  const user = await currentUser();
  if (!user) return { success: false, message: 'Usuario no autenticado.' };

  const wf = await db.workflow.findFirst({
    where: { id: workflowId, userId: user.id },
    select: { id: true },
  });
  if (!wf) return { success: false, message: "Workflow no encontrado." };

  const edges = await db.workflowEdge.findMany({
    where: { workflowId },
    select: {
      id: true,
      sourceId: true,
      targetId: true,
      sourceHandle: true,
      targetHandle: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return { success: true, message: "ok", data: edges };
}

export async function updateWorkflowNodePosition(input: UpdateNodePositionInput) {
  const user = await currentUser();
  if (!user) return { success: false, message: 'Usuario no autenticado.' };

  const { nodeId, posX, posY } = input;

  const node = await db.workflowNode.findFirst({
    where: {
      id: nodeId,
    },
    select: { id: true },
  });

  if (!node) return {
    success: false,
    message: 'No se encontró un nodo.'
  }

  await db.workflowNode.update({
    where: { id: nodeId },
    data: { posX, posY },
  });

  return { ok: true };
}

export async function createNodeFromCanvas(form: createNodeflowSchemaType & { posX: number; posY: number }) {
  const user = await currentUser();
  if (!user) return { success: false, message: 'Usuario no autenticado.' };

  const totalNodes = await db.workflowNode.count({ where: { workflowId: form.workflowId } });
  if (totalNodes >= MAX_NODES_PER_WORKFLOW) return {
    success: false,
    message: `Este flujo ya alcanzó el límite de ${MAX_NODES_PER_WORKFLOW} nodos...`
  };

  const requestedTipo = (form.tipo ?? "").toLowerCase();
  const isSeguimiento = requestedTipo.startsWith("seguimiento-");
  if (isSeguimiento) {
    const totalSeguimientos = await db.workflowNode.count({
      where: {
        workflowId: form.workflowId,
        tipo: { startsWith: "seguimiento-" },
      },
    });

    if (totalSeguimientos >= MAX_SEGUIMIENTOS_PER_WORKFLOW) return {
      success: false,
      message: `Este flujo ya alcanzó el límite de ${MAX_SEGUIMIENTOS_PER_WORKFLOW} seguimientos.`,
    };
  }

  const maxOrder = await db.workflowNode.aggregate({
    where: { workflowId: form.workflowId },
    _max: { order: true },
  });

  const result = await db.workflowNode.create({
    data: {
      workflowId: form.workflowId,
      tipo: form.tipo,
      message: form.message ?? "",
      url: form.url ?? null,
      posX: form.posX,
      posY: form.posY,
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });

  return { success: true, data: result };
}

export async function updateIntentionNodeConfig(params: {
  nodeId: string;

  message?: string;

  // existentes
  keywords?: string[];
  miniPrompt?: string;
  threshold?: number;
  noMatchMessage?: string;

  // intention
  intentionPrompt?: string;
  intentionMaxAttempts?: number;
}) {
  const user = await currentUser();
  if (!user) return { success: false, message: 'Usuario no autenticado.' };

  const { nodeId } = params;
  if (!nodeId) return { success: false, message: "nodeId requerido" };

  const data: any = {};

  if (params.message !== undefined) {
    const msg = params.message.trim();
    if (msg.length < 1) return { success: false, message: "NO_TOAST El mensaje es requerido" };
    data.message = msg;
  }

  // --- embedding/intention config existente (si aplica)
  if (params.threshold !== undefined) {
    if (params.threshold < 0 || params.threshold > 1)
      return { success: false, message: "threshold debe ser 0..1" };
    data.threshold = params.threshold;
  }

  if (params.miniPrompt !== undefined) {
    if (params.miniPrompt.length > 280)
      return { success: false, message: "miniPrompt muy largo (máx 280)" };
    data.miniPrompt = params.miniPrompt;
  }

  if (params.noMatchMessage !== undefined) data.noMatchMessage = params.noMatchMessage;

  if (params.keywords) {
    data.keywords = JSON.stringify(params.keywords.map(k => k.trim()).filter(Boolean));
  }

  // --- intention
  if (params.intentionPrompt !== undefined) {
    if (params.intentionPrompt.trim().length < 3)
      return { success: false, message: "NO_TOAST El prompt es muy corto" };
    data.intentionPrompt = params.intentionPrompt.trim();
  }

  if (params.intentionMaxAttempts !== undefined) {
    const n = Number(params.intentionMaxAttempts);
    if (!Number.isFinite(n) || n < 1 || n > 10)
      return { success: false, message: "intentionMaxAttempts debe ser 1..10" };
    data.intentionMaxAttempts = n;
  }

  const updated = await db.workflowNode.update({
    where: { id: nodeId },
    data,
  });

  return { success: true, message: "Configuración guardada", data: updated };
}

export async function updateFollowUpNodeConfig(params: {
  nodeId: string;
  followUpMode?: "static" | "ai";
  followUpPrompt?: string;
  followUpGoal?: string;
  followUpCancelOnReply?: boolean;
  followUpMaxAttempts?: number;
}) {
  const user = await currentUser();
  if (!user) return { success: false, message: 'Usuario no autenticado.' };

  const data: Record<string, unknown> = {};

  if (params.followUpMode !== undefined) {
    data.followUpMode = params.followUpMode === "ai" ? "ai" : "static";
  }

  if (params.followUpPrompt !== undefined) {
    data.followUpPrompt = params.followUpPrompt.trim();
  }

  if (params.followUpGoal !== undefined) {
    data.followUpGoal = params.followUpGoal.trim();
  }

  if (params.followUpCancelOnReply !== undefined) {
    data.followUpCancelOnReply = Boolean(params.followUpCancelOnReply);
  }

  if (params.followUpMaxAttempts !== undefined) {
    const maxAttempts = Number(params.followUpMaxAttempts);
    if (!Number.isFinite(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
      return {
        success: false,
        message: "followUpMaxAttempts debe ser 1..10",
      };
    }

    data.followUpMaxAttempts = maxAttempts;
  }

  const updated = await db.workflowNode.update({
    where: { id: params.nodeId },
    data,
  });

  return { success: true, message: "Configuracion guardada", data: updated };
}


