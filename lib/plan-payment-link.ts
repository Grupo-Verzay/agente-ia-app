import { Plan } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * El link de pago de un plan, para los avisos de cobro.
 *
 * Antes el link salía SOLO de la ficha de cada cliente ("Medio de pago"), así
 * que había que escribirlo cliente por cliente y, si se olvidaba, el aviso de
 * vencimiento salía con un guion en vez de por dónde pagar.
 *
 * Guardado en el plan se escribe una vez y le sirve a todos los que tengan ese
 * plan. Es el mismo campo "URL de checkout (mensual)" que ya existe en la
 * pantalla de Planes.
 *
 * Sale TAL CUAL está escrito, con su manita o sin ella. El adorno lo pone quien
 * llena el campo y no el sistema: así se cambia desde la pantalla, sin tocar
 * código, y sirve igual para un link que para unos datos de transferencia.
 */
export async function enlaceDePagoDelPlan(
    plan: Plan | string | null | undefined,
    resellerUserId?: string | null,
): Promise<string | null> {
    if (!plan) return null;

    try {
        // La marca manda sobre la plataforma: cada reseller cobra por su propia
        // pasarela y mandarle a su cliente el link de Verzay sería cobrarle a
        // otro.
        if (resellerUserId) {
            const propios = await db.resellerPlan.findMany({
                where: { resellerUserId, plan: plan as Plan },
                select: { checkoutUrlMonthly: true, isActive: true },
                orderBy: { assistanceType: "asc" },
            });
            const propio = elPrimeroConLink(propios);
            if (propio) return propio;
        }

        const dePlataforma = await db.subscriptionPlan.findMany({
            where: { plan: plan as Plan, isResellerPlan: false },
            select: { checkoutUrlMonthly: true, isActive: true },
            orderBy: { assistanceType: "asc" },
        });
        return elPrimeroConLink(dePlataforma);
    } catch {
        return null;
    }
}

/**
 * Cada nivel tiene dos filas —IA y Humano— y solo una suele estar a la venta.
 * Manda la que esté activa; si ninguna lo está, vale cualquiera con link antes
 * que dejar el aviso sin por dónde pagar.
 */
function elPrimeroConLink(
    filas: { checkoutUrlMonthly: string | null; isActive: boolean }[],
): string | null {
    const conLink = filas.filter((fila) => fila.checkoutUrlMonthly?.trim());
    const activa = conLink.find((fila) => fila.isActive);
    return (activa ?? conLink[0])?.checkoutUrlMonthly?.trim() || null;
}
