"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { TOPE_DEL_PROMPT_MAESTRO } from "@/lib/prompt-maestro-de-cuenta";
import { guardarPromptMaestroDeCuenta, leerPromptMaestroDeCuenta } from "@/lib/prompt-maestro-de-cuenta-db";

type Respuesta<T = undefined> = { success: boolean; message: string; data?: T };

export type PromptMaestroDeLaCuenta = {
    /** `null` = la cuenta usa el prompt maestro global. */
    texto: string | null;
    actualizadoEn: string | null;
};

/**
 * La puerta de las dos acciones: **solo el dueño de la plataforma**
 * (`esSuperAdminDeVerdad`). Ni el administrador de una cuenta, ni un reseller,
 * ni el propio cliente: este texto se pone delante de todo lo que el agente de
 * esa cuenta responde, así que es del dueño de la plataforma y de nadie más.
 * Con «Ingresar» puesto el rol propio no cuenta (ver `elRolPropioQueCuenta`),
 * así que desde dentro de la cuenta de un cliente tampoco se puede.
 *
 * El rechazo NO es mudo: el caso típico no es un ataque, es una pantalla que
 * ofrece el botón a quien no debe.
 */
async function elDuenoDeLaPlataforma() {
    const user = await currentUser();
    if (!user || !esSuperAdminDeVerdad(user)) {
        if (user) console.warn("[prompt-maestro] acceso rechazado", { quien: user.id });
        return null;
    }
    return user;
}

/** La cuenta sale de la BASE: un id que no existe no deja una fila huérfana. */
async function laCuenta(cuentaId: unknown): Promise<{ id: string } | null> {
    if (typeof cuentaId !== "string" || !cuentaId) return null;
    return db.user.findUnique({ where: { id: cuentaId }, select: { id: true } });
}

export async function leerPromptMaestroDeCuentaAction(
    cuentaId: string,
): Promise<Respuesta<PromptMaestroDeLaCuenta>> {
    try {
        if (!(await elDuenoDeLaPlataforma())) return { success: false, message: "No autorizado." };
        const cuenta = await laCuenta(cuentaId);
        if (!cuenta) return { success: false, message: "Cuenta no encontrada." };
        const guardado = await leerPromptMaestroDeCuenta(cuenta.id);
        return {
            success: true,
            message: "ok",
            data: { texto: guardado.texto, actualizadoEn: guardado.actualizadoEn?.toISOString() ?? null },
        };
    } catch (error) {
        console.error("[prompt-maestro] no se pudo leer", { cuentaId, error });
        return { success: false, message: "No se pudo leer el prompt maestro de la cuenta." };
    }
}

/** Guardar vacío la devuelve al prompt maestro global. */
export async function guardarPromptMaestroDeCuentaAction(
    cuentaId: string,
    texto: string,
): Promise<Respuesta<PromptMaestroDeLaCuenta>> {
    try {
        const user = await elDuenoDeLaPlataforma();
        if (!user) return { success: false, message: "No autorizado." };
        const cuenta = await laCuenta(cuentaId);
        if (!cuenta) return { success: false, message: "Cuenta no encontrada." };
        if (typeof texto !== "string") return { success: false, message: "El texto no es válido." };
        if (texto.length > TOPE_DEL_PROMPT_MAESTRO) {
            return {
                success: false,
                message: `El prompt no puede pasar de ${TOPE_DEL_PROMPT_MAESTRO.toLocaleString("es-CO")} caracteres (tiene ${texto.length.toLocaleString("es-CO")}).`,
            };
        }
        const limpio = await guardarPromptMaestroDeCuenta(cuenta.id, texto, laPersonaQueActua(user).id);
        return {
            success: true,
            message: limpio === null
                ? "La cuenta vuelve a usar el prompt maestro global."
                : "Prompt maestro propio guardado.",
            data: { texto: limpio, actualizadoEn: new Date().toISOString() },
        };
    } catch (error) {
        console.error("[prompt-maestro] no se pudo guardar", { cuentaId, error });
        return { success: false, message: "No se pudo guardar el prompt maestro de la cuenta." };
    }
}
