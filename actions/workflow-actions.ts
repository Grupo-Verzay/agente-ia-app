"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createWorkflowSchema, createWorkflowSchemaType } from "@/schema/workflow";
import { getWorkflowEditorPath, WorkflowStatus } from "@/types/workflow";
import { Workflow } from "@prisma/client";
import { redirect } from "next/navigation";
import { deleteAllNodes, deleteFileNode } from "./workflow-node-action";
import { currentUser } from "@/lib/auth";

interface GetWorkFlowResponse {
    success: boolean;
    error?: string;
    message?: string;
    data?: Workflow[];
};
interface RROperationResponse {
    success: boolean;
    message: string;
    data?: Workflow[];
};

export async function getWorkflowNameById(workflowId: string) {
    const wf = await db.workflow.findUnique({
        where: { id: workflowId },
        select: { name: true },
    });

    return wf?.name ?? null;
}

export const getWorkFlowByUser = async (userId?: string): Promise<GetWorkFlowResponse> => {
    if (!userId) {
        return { success: false, error: "No autenticado.", message: "No autenticado." };
    }

    try {
        const workflows = await db.workflow.findMany({
            where: { userId },
            orderBy: [{ triggerOnNewSession: "desc" }, { order: "asc" }, { createdAt: "asc" }],
        }).catch(() => db.workflow.findMany({
            where: { userId },
            orderBy: [{ createdAt: "asc" }],
        }));

        return { success: true, data: workflows };
    } catch (error) {
        console.error("Error al obtener los workflows:", error);
        return { success: false, error: "Hubo un problema al obtener los workflows.", message: "Hubo un problema al obtener los workflows." };
    }
};

export interface CreateWorkflowTriggerPayload {
    name: string;
    mode: "keywords" | "prompt";
    condition: string;
}

export const createWorkflow = async (
    form: createWorkflowSchemaType,
    trigger?: CreateWorkflowTriggerPayload | null,
) => {
    const user = await currentUser();
    if (!user) return { success: false, message: 'Usuario no autenticado.' };

    const { success, data } = createWorkflowSchema.safeParse(form);

    if (!success) return { success: false, message: 'Datos del formulario inválidos.' };

    const maxOrder = await db.workflow.aggregate({
        where: { userId: user.id },
        _max: {
            order: true,
        },
    });

    const nextOrder = (maxOrder._max.order ?? 0) + 1;

    if (data.triggerOnNewSession) {
        // Si ya existe un flujo con ese nombre, activarlo en lugar de crear uno nuevo
        const existing = await db.workflow.findUnique({
            where: { name_userId: { name: data.name.toUpperCase(), userId: user.id } },
        });
        if (existing) {
            await db.workflow.updateMany({
                where: { userId: user.id, triggerOnNewSession: true },
                data: { triggerOnNewSession: false },
            });
            await db.workflow.update({
                where: { id: existing.id },
                data: { triggerOnNewSession: true },
            });
            redirect(getWorkflowEditorPath(existing.id, existing.isPro));
        }
        await db.workflow.updateMany({
            where: { userId: user.id, triggerOnNewSession: true },
            data: { triggerOnNewSession: false },
        });
    }

    const result = await db.workflow.create({
        data: {
            userId: user?.id!,
            status: WorkflowStatus.DRAFT,
            definition: "workflow",
            order: nextOrder,
            ...data,
        },
    });
    if (!result) return { success: false, message: 'Fallo la creación del flujo.' };

    if (trigger?.name?.trim() && trigger?.condition?.trim()) {
        await db.intentTrigger.create({
            data: {
                userId: user.id,
                workflowId: result.id,
                name: trigger.name.trim(),
                mode: trigger.mode,
                condition: trigger.condition.trim(),
                isActive: true,
            },
        });
    }

    redirect(getWorkflowEditorPath(result.id, result.isPro));
};

export async function updateWorkflowOrder(workflowId: string, order: number): Promise<RROperationResponse> {
    try {
        if (!workflowId) {
            return { success: false, message: "Identificador no proporcionado." };
        }

        await db.workflow.update({
            where: { id: workflowId },
            data: { order },
        });

        return {
            success: true,
            message: 'Orden del flujo actualizado correctamente.',
        };
    } catch (error) {
        console.error("Error updateWorkflowOrder:", error);
        return {
            success: false,
            message: 'Error al actualizar el orden del flujo.',
        };
    }
};

export const deleteWorkflow = async (id: string) => {
    try {
        const user = await currentUser();
        if (!user) return { success: false, message: 'Usuario no autenticado.' };

        const deleted = await db.workflow.delete({
            where: {
                id,
                userId: user.id,
            },
        });

        return {
            success: true,
            message: `Flujo "${deleted.name}" eliminado correctamente.`,
            data: deleted,
        };
    } catch (error: any) {
        console.error("Error al eliminar el flujo:", error);

        return {
            success: false,
            message: "Ocurrió un error al eliminar el flujo.",
            error: error?.message || error,
        };
    }
};

export const deleteEntireWorkflow = async (userId: string, workflowId: string) => {
    try {
        // #1. Se obtienen todos los nodos
        const nodes = await db.workflowNode.findMany({ where: { workflowId } });

        if (nodes.length > 0) {
            const nodesWithFile = nodes.filter((n) => !!n.url);

            // #2. Eliminar archivos de todos los nodos en paralelo
            const deleteResults = await Promise.all(
                nodesWithFile.map((node) => deleteFileNode(node.url!, node.id))
            );

            // #3. Verificar si alguno falló
            const failed = deleteResults.find((res) => !res.success);

            if (failed) {
                return {
                    success: false,
                    message: "Error al eliminar uno o más archivos del flujo.",
                    stage: "files",
                    detail: failed.message || "Error desconocido en la eliminación de archivos.",
                };
            }
        }

        // #4. Eliminar nodos
        const nodesRes = await deleteAllNodes(workflowId);
        if (!nodesRes.success) {
            return {
                success: false,
                message: "Error al eliminar los nodos del flujo.",
                stage: "nodes",
                detail: nodesRes.message,
            };
        }

        // #5. Eliminar el flujo
        const workflowRes = await deleteWorkflow(workflowId);
        if (!workflowRes.success) {
            return {
                success: false,
                message: "Error al eliminar el flujo.",
                stage: "workflow",
                detail: workflowRes.message,
            };
        }

        return {
            success: true,
            message: "Flujo y datos relacionados eliminados correctamente.",
        };
    } catch (error) {
        console.error("Error inesperado en deleteEntireWorkflow:", error);
        return {
            success: false,
            message: "Error inesperado al eliminar el flujo completo.",
            stage: "general",
            detail: error instanceof Error ? error.message : String(error),
        };
    }
};

export const toggleFunnelStep = async (workflowId: string, active: boolean): Promise<RROperationResponse> => {
    try {
        const user = await currentUser();
        if (!user) return { success: false, message: "Usuario no autenticado." };

        await db.workflow.update({
            where: { id: workflowId, userId: user.id },
            data: { isFunnelStep: active },
        });

        return { success: true, message: active ? "Flujo marcado como paso de embudo." : "Flujo quitado del embudo." };
    } catch (error) {
        console.error("Error toggleFunnelStep:", error);
        return { success: false, message: "Error al actualizar el paso de embudo." };
    }
};

export const setWelcomeWorkflow = async (workflowId: string): Promise<RROperationResponse> => {
    try {
        const user = await currentUser();
        if (!user) return { success: false, message: "Usuario no autenticado." };

        await db.$transaction([
            db.workflow.updateMany({
                where: { userId: user.id, triggerOnNewSession: true },
                data: { triggerOnNewSession: false },
            }),
            db.workflow.update({
                where: { id: workflowId },
                data: { triggerOnNewSession: true },
            }),
        ]);

        return { success: true, message: "Flujo de bienvenida configurado." };
    } catch (error) {
        console.error("Error setWelcomeWorkflow:", error);
        return { success: false, message: "Error al configurar el flujo de bienvenida." };
    }
};

export const unsetWelcomeWorkflow = async (workflowId: string): Promise<RROperationResponse> => {
    try {
        const user = await currentUser();
        if (!user) return { success: false, message: "Usuario no autenticado." };

        await db.workflow.update({
            where: { id: workflowId, userId: user.id },
            data: { triggerOnNewSession: false },
        });

        return { success: true, message: "Flujo de bienvenida desactivado." };
    } catch (error) {
        console.error("Error unsetWelcomeWorkflow:", error);
        return { success: false, message: "Error al desactivar el flujo de bienvenida." };
    }
};

export const updateWorkflow = async (id: string, data: Partial<Workflow>): Promise<RROperationResponse> => {
    try {
        if (!id) {
            return { success: false, message: "Identificador no proporcionado." };
        };

        await db.workflow.update({
            where: { id },
            data,
        });

        return {
            success: true,
            message: 'Registro actualizado correctamente.',
        };

    } catch (error) {
        return {
            success: false,
            message: 'Error al actualizar el registro.',
        };
    }
};
