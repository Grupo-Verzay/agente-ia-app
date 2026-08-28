"use server";

import { currentUser } from "@/lib/auth";
import { enlaceDePagoDe } from "@/lib/pay-code";

import { assertBillingScope } from "./helpers/billing-helpers.server";

export interface EnlacePagoClienteResult {
    success: boolean;
    message: string;
    url?: string;
}

/**
 * El enlace de pago corto de un cliente, para pegarlo en su ficha o mandárselo
 * por chat.
 *
 * Se pide desde el panel y no se genera solo al crear la cuenta: hay cuentas
 * viejas que nunca pasarían por ahí, y así se cubren todas sin migrar nada.
 */
export async function obtenerEnlacePagoCliente(
    userId: string,
): Promise<EnlacePagoClienteResult> {
    const actor = await currentUser();
    if (!actor) return { success: false, message: "No autorizado." };

    try {
        // Mismo guardián que el resto de billing: un reseller solo toca los
        // suyos. Sin esto, el enlace de pago de cualquier cliente quedaría a un
        // identificador de distancia.
        const objetivo = await assertBillingScope(
            { id: actor.id, role: actor.role },
            userId,
        );

        const enlace = await enlaceDePagoDe(objetivo);
        if ("error" in enlace) {
            return { success: false, message: enlace.error };
        }

        return { success: true, message: "Enlace listo.", url: enlace.url };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "No autorizado.",
        };
    }
}
