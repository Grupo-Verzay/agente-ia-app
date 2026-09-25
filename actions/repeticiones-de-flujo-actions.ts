"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { laCuentaDeLaAccion } from "@/lib/cuenta-de-la-accion";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { comoRepeticiones, type RepeticionesDeFlujo } from "@/lib/repeticiones-de-flujo";
import { guardarRepeticiones, leerRepeticiones } from "@/lib/repeticiones-de-flujo-db";

type Respuesta<T = undefined> = { success: boolean; message: string; data?: T };

/**
 * De quién es el flujo se lee de la FILA, nunca del navegador, y se comprueba
 * con la puerta de siempre (`laCuentaDeLaAccion` → `assertCanAccessTargetUser`).
 * Un flujo que no se alcanza se contesta como si no existiera.
 */
async function elFlujoQueSeAlcanza(workflowId: unknown): Promise<{ id: string; userId: string } | null> {
    if (typeof workflowId !== "string" || !workflowId) return null;
    const flujo = await db.workflow.findUnique({ where: { id: workflowId }, select: { id: true, userId: true } });
    if (!flujo) return null;
    const cuenta = await laCuentaDeLaAccion(flujo.userId);
    return cuenta ? flujo : null;
}

export async function leerRepeticionesDelFlujoAction(workflowId: string): Promise<Respuesta<RepeticionesDeFlujo>> {
    try {
        const flujo = await elFlujoQueSeAlcanza(workflowId);
        if (!flujo) return { success: false, message: "Flujo no encontrado." };
        const mapa = await leerRepeticiones([flujo.id]);
        return { success: true, message: "ok", data: mapa[flujo.id] };
    } catch (error) {
        console.error("[flujos] no se pudieron leer las repeticiones", { workflowId, error });
        return { success: false, message: "No se pudieron leer las repeticiones del flujo." };
    }
}

/**
 * Guardar es de quien MANDA en la cuenta (`canManageWorkspace`): un `agente`
 * participa, no configura cómo se comporta el agente de toda la cuenta.
 */
export async function guardarRepeticionesDelFlujoAction(
    workflowId: string,
    entrada: RepeticionesDeFlujo,
): Promise<Respuesta<RepeticionesDeFlujo>> {
    try {
        const user = await currentUser();
        if (!user) return { success: false, message: "No autorizado." };
        const flujo = await elFlujoQueSeAlcanza(workflowId);
        if (!flujo) return { success: false, message: "Flujo no encontrado." };
        if (!canManageWorkspace(user)) {
            console.warn("[flujos] un agente intentó cambiar las repeticiones", { workflowId, quien: user.id });
            return { success: false, message: "Solo el dueño o un administrador puede cambiar las repeticiones." };
        }

        const limpio = comoRepeticiones(entrada);
        await guardarRepeticiones(flujo.id, limpio);
        revalidatePath("/flow");
        revalidatePath("/workflow");
        return { success: true, message: "Repeticiones guardadas.", data: limpio };
    } catch (error) {
        console.error("[flujos] no se pudieron guardar las repeticiones", { workflowId, error });
        return { success: false, message: "No se pudieron guardar las repeticiones del flujo." };
    }
}

/**
 * Las repeticiones de una lista de flujos, en UNA consulta. Solo devuelve las
 * de los flujos que quien llama alcanza: los ids llegan de fuera.
 */
export async function leerRepeticionesDeLosFlujosAction(
    workflowIds: string[],
): Promise<Record<string, RepeticionesDeFlujo>> {
    const pedidos = Array.isArray(workflowIds)
        ? Array.from(new Set(workflowIds.filter((id): id is string => typeof id === "string" && !!id))).slice(0, 500)
        : [];
    if (pedidos.length === 0) return {};
    const filas = await db.workflow.findMany({ where: { id: { in: pedidos } }, select: { id: true, userId: true } });
    const cuentas = new Map<string, boolean>();
    const alcanzados: string[] = [];
    for (const f of filas) {
        if (!cuentas.has(f.userId)) cuentas.set(f.userId, !!(await laCuentaDeLaAccion(f.userId)));
        if (cuentas.get(f.userId)) alcanzados.push(f.id);
    }
    return leerRepeticiones(alcanzados);
}
