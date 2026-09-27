"use server";
import { olvidarRepeticiones } from "@/lib/repeticiones-de-flujo-db";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createWorkflowSchema, createWorkflowSchemaType } from "@/schema/workflow";
import { getWorkflowEditorPath, WorkflowStatus } from "@/types/workflow";
import { Workflow } from "@prisma/client";
import { redirect } from "next/navigation";
import { deleteAllNodes, deleteFileNode } from "./workflow-node-action";
import { currentUser } from "@/lib/auth";
import { laCuentaDeLaAccion } from "@/lib/cuenta-de-la-accion";
import { laCuentaDelFlujo } from "@/lib/dueno-del-dato.server";

/*
 * # Un flujo se toca por su DUEÑO, y el dueño sale de la fila
 *
 * Las acciones que reciben el id de un flujo pasan por `laCuentaDelFlujo`
 * (`lib/dueno-del-dato.server.ts`), la misma puerta que los pasos de
 * `workflow-node-action.ts`. Antes unas comprobaban `userId: user.id`, otras
 * nada (`updateWorkflow` dejaba cambiar cualquier columna de un flujo ajeno,
 * `userId` incluido), y **borrar un flujo entero vaciaba sus archivos y sus
 * pasos ANTES de comprobar de quién era**: la comprobación estaba en el último
 * paso, cuando ya no quedaba nada que proteger.
 */
const NO_ES_TUYO = { success: false as const, message: "Flujo no encontrado." };

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
    if (!(await laCuentaDelFlujo(workflowId))) return null;
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
        // El `userId` llega del navegador (los paneles de Reglas lo mandan): se
        // comprueba antes de listar, como su hermana `getWorkFlowByUserIds`.
        const cuenta = await laCuentaDeLaAccion(userId);
        if (!cuenta) return { success: false, error: "No autorizado.", message: "No autorizado." };
        const workflows = await db.workflow.findMany({
            where: { userId: cuenta },
            orderBy: [{ triggerOnNewSession: "desc" }, { order: "asc" }, { createdAt: "asc" }],
        }).catch(() => db.workflow.findMany({
            where: { userId: cuenta },
            orderBy: [{ createdAt: "asc" }],
        }));

        return { success: true, data: workflows };
    } catch (error) {
        console.error("Error al obtener los workflows:", error);
        return { success: false, error: "Hubo un problema al obtener los workflows.", message: "Hubo un problema al obtener los workflows." };
    }
};

/**
 * Igual que getWorkFlowByUser pero para varias cuentas (scope de equipo): el
 * dueño + las cuentas vinculadas. Permite que un agente/admin vea y envíe los
 * workflows del dueño de la línea principal desde su propio usuario.
 */
export const getWorkFlowByUserIds = async (userIds: string[]): Promise<GetWorkFlowResponse> => {
    const pedidos = Array.from(new Set((userIds ?? []).filter(Boolean)));
    if (!pedidos.length) {
        return { success: false, error: "No autenticado.", message: "No autenticado." };
    }

    try {
        // Una acción ES un endpoint, y esta no preguntaba nada: con sesión y el
        // id de otra cuenta devolvía sus workflows. La lista se **filtra** —como
        // `getAllRRsByUserIds`, su hermana de la bandeja—: lo que no se alcanza
        // se cae y no arrastra a los buenos.
        const ids: string[] = [];
        for (const pedido of pedidos) {
            const cuenta = await laCuentaDeLaAccion(pedido);
            if (cuenta) ids.push(cuenta);
        }
        if (!ids.length) return { success: true, data: [] };

        const workflows = await db.workflow.findMany({
            where: { userId: { in: ids } },
            orderBy: [{ triggerOnNewSession: "desc" }, { order: "asc" }, { createdAt: "asc" }],
        }).catch(() => db.workflow.findMany({
            where: { userId: { in: ids } },
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

        if (!(await laCuentaDelFlujo(workflowId))) return NO_ES_TUYO;

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
        const alcanzado = await laCuentaDelFlujo(id);
        if (!alcanzado) return NO_ES_TUYO;

        const deleted = await db.workflow.delete({
            where: {
                id,
                userId: alcanzado.flujo.userId,
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
        // #0. De quién es, ANTES de tocar nada. Antes esta comprobación estaba
        // dentro del último paso (`deleteWorkflow`), así que con el id de un
        // flujo ajeno se le borraban los archivos y todos los pasos y solo
        // entonces salía «no es tuyo», con el flujo ya vacío.
        if (!(await laCuentaDelFlujo(workflowId))) return { ...NO_ES_TUYO, stage: "auth" };

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

        // #6. Su ajuste de repeticiones (tabla de la App, sin clave foránea).
        // No puede tumbar un borrado que ya se hizo, pero tampoco es mudo.
        await olvidarRepeticiones(workflowId).catch((error) =>
            console.warn("[flujos] no se pudo borrar el ajuste de repeticiones", { workflowId, error }),
        );

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

        const alcanzado = await laCuentaDelFlujo(workflowId);
        if (!alcanzado) return NO_ES_TUYO;

        await db.workflow.update({
            where: { id: workflowId, userId: alcanzado.flujo.userId },
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

        // El flujo tiene que ser de una cuenta que se alcanza, y la bienvenida
        // que se apaga es la de ESA cuenta —la del flujo—, no la de quien pulsa.
        const alcanzado = await laCuentaDelFlujo(workflowId);
        if (!alcanzado) return NO_ES_TUYO;
        const dueno = alcanzado.flujo.userId;

        await db.$transaction([
            db.workflow.updateMany({
                where: { userId: dueno, triggerOnNewSession: true },
                data: { triggerOnNewSession: false },
            }),
            db.workflow.update({
                where: { id: workflowId, userId: dueno },
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

        const alcanzado = await laCuentaDelFlujo(workflowId);
        if (!alcanzado) return NO_ES_TUYO;

        await db.workflow.update({
            where: { id: workflowId, userId: alcanzado.flujo.userId },
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

        if (!(await laCuentaDelFlujo(id))) return NO_ES_TUYO;

        // Lo que llega es un `Partial<Workflow>` del navegador: sin quitar la
        // identidad, se podía mover un flujo a otra cuenta cambiando su `userId`.
        const { id: _id, userId: _userId, createdAt: _createdAt, ...cambios } =
            (data ?? {}) as Partial<Workflow>;
        void _id; void _userId; void _createdAt;

        await db.workflow.update({
            where: { id },
            data: cambios,
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
