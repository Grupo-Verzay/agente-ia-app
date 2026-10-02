"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { esElDuenoDeLaCuenta, laCuentaDelDueno } from "@/lib/dueno-de-la-cuenta";
import { SENTIMIENTO_POR_DEFECTO } from "@/lib/sentimiento";
import { guardarLosAjustesDelSentimiento, leerLosAjustesDelSentimiento } from "@/lib/sentimiento-db";

/**
 * El interruptor del ANÁLISIS DE SENTIMIENTO de la cuenta.
 *
 * Es del DUEÑO y de nadie más (`esElDuenoDeLaCuenta`): juzga a los clientes y
 * gasta los créditos de la cuenta. Ni un administrador del equipo, ni un
 * agente, ni quien entra con «Ingresar». La puerta va AQUÍ y no solo en la
 * pantalla: una acción ES un endpoint.
 *
 * Nace apagado: sin fila en `sentimiento_ajustes` está apagado, y así quedaron
 * todas las cuentas que existían.
 */

type Resultado = { success: boolean; message?: string };

export async function getAjustesDelSentimiento(): Promise<{ activa: boolean; puedeCambiar: boolean }> {
    const user = await currentUser();
    if (!user?.id || !esElDuenoDeLaCuenta(user)) return { ...SENTIMIENTO_POR_DEFECTO, puedeCambiar: false };
    const cuenta = laCuentaDelDueno(user);
    if (!cuenta) return { ...SENTIMIENTO_POR_DEFECTO, puedeCambiar: false };
    const ajustes = await leerLosAjustesDelSentimiento(cuenta);
    return { ...ajustes, puedeCambiar: true };
}

export async function guardarSentimientoActivo(activa: boolean): Promise<Resultado> {
    const user = await currentUser();
    if (!user?.id || !esElDuenoDeLaCuenta(user)) {
        console.warn("[sentimiento] alguien que no es el dueño quiso cambiar el interruptor", { id: user?.id ?? null });
        return { success: false, message: "Solo el dueño de la cuenta puede cambiar esto." };
    }
    if (typeof activa !== "boolean") return { success: false, message: "Valor no válido." };
    const cuenta = laCuentaDelDueno(user);
    if (!cuenta) return { success: false, message: "No autorizado." };
    try {
        await guardarLosAjustesDelSentimiento(cuenta, activa);
        revalidatePath("/profile");
        return {
            success: true,
            message: activa ? "Análisis de sentimiento activado." : "Análisis de sentimiento desactivado.",
        };
    } catch (error) {
        console.error("[sentimiento] no se pudo guardar el interruptor", error);
        return { success: false, message: "No se pudo guardar." };
    }
}
