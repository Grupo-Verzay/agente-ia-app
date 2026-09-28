"use server";

import { revalidatePath } from "next/cache";

import { currentUser } from "@/lib/auth";
import { laCuentaDeLaAccion } from "@/lib/cuenta-de-la-accion";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { elOrigenDeLaApp } from "@/lib/origen-de-la-app";
import { comoPropuesta, type Propuesta } from "@/lib/propuestas";
import {
    borrarPropuesta,
    crearPropuesta,
    editarPropuesta,
    lasPropuestasDe,
} from "@/lib/propuestas-db";

/**
 * Las acciones de Panel › Propuestas.
 *
 * **Ninguna recibe un id de cuenta**: la cuenta sale de la sesión
 * (`laCuentaDeLaAccion()` sin nada pedido, o sea la fila efectiva) y toda
 * consulta va acotada por ella. Así una propuesta de otra cuenta se contesta
 * igual que una que no existe, pidan el id que pidan.
 *
 * Y es de quien ADMINISTRA la cuenta (`canManageWorkspace`): una propuesta
 * comercial pone precios, así que un `agente` no la crea ni la cambia. Es la
 * misma puerta que el resto de ajustes de una cuenta.
 */

type Respuesta<T> = { success: true; data: T } | { success: false; message: string };

const RUTA = "/panel/propuestas";

async function quienManda(): Promise<{ cuenta: string; personaId: string } | null> {
    const user = await currentUser();
    if (!user || !canManageWorkspace(user)) return null;
    const cuenta = await laCuentaDeLaAccion();
    if (!cuenta) return null;
    return { cuenta, personaId: laPersonaQueActua(user).id };
}

const NO_AUTORIZADO = { success: false as const, message: "No autorizado." };

export async function listarPropuestasAction(): Promise<Respuesta<{ propuestas: Propuesta[]; origen: string }>> {
    const q = await quienManda();
    if (!q) return NO_AUTORIZADO;
    try {
        const [propuestas, origen] = await Promise.all([lasPropuestasDe(q.cuenta), elOrigenDeLaApp()]);
        return { success: true, data: { propuestas, origen } };
    } catch (error) {
        console.error("[propuestas] no se pudieron leer", { cuenta: q.cuenta, error: String(error) });
        return { success: false, message: "No se pudieron cargar las propuestas." };
    }
}

export async function crearPropuestaAction(raw: unknown): Promise<Respuesta<Propuesta>> {
    const q = await quienManda();
    if (!q) return NO_AUTORIZADO;
    const v = comoPropuesta(raw);
    if (!v.ok) return { success: false, message: v.motivo };
    try {
        const p = await crearPropuesta({ ...v.datos, cuentaId: q.cuenta, creadoPorId: q.personaId || null });
        revalidatePath(RUTA);
        return { success: true, data: p };
    } catch (error) {
        console.error("[propuestas] no se pudo crear", { cuenta: q.cuenta, error: String(error) });
        return { success: false, message: "No se pudo crear la propuesta." };
    }
}

export async function editarPropuestaAction(id: unknown, raw: unknown): Promise<Respuesta<Propuesta>> {
    const q = await quienManda();
    if (!q) return NO_AUTORIZADO;
    if (typeof id !== "string" || !id.trim()) return { success: false, message: "Propuesta no encontrada." };
    const v = comoPropuesta(raw);
    if (!v.ok) return { success: false, message: v.motivo };
    try {
        const p = await editarPropuesta(q.cuenta, id, v.datos);
        if (!p) return { success: false, message: "Propuesta no encontrada." };
        revalidatePath(RUTA);
        return { success: true, data: p };
    } catch (error) {
        console.error("[propuestas] no se pudo editar", { cuenta: q.cuenta, id, error: String(error) });
        return { success: false, message: "No se pudo guardar la propuesta." };
    }
}

export async function borrarPropuestaAction(id: unknown): Promise<Respuesta<null>> {
    const q = await quienManda();
    if (!q) return NO_AUTORIZADO;
    if (typeof id !== "string" || !id.trim()) return { success: false, message: "Propuesta no encontrada." };
    try {
        const ok = await borrarPropuesta(q.cuenta, id);
        if (!ok) return { success: false, message: "Propuesta no encontrada." };
        revalidatePath(RUTA);
        return { success: true, data: null };
    } catch (error) {
        console.error("[propuestas] no se pudo borrar", { cuenta: q.cuenta, id, error: String(error) });
        return { success: false, message: "No se pudo eliminar la propuesta." };
    }
}
