import "server-only";

import { db } from "@/lib/db";
import { conLosNombresVigentes } from "@/lib/nombre-del-nivel.server";
import type { Prisma } from "@prisma/client";
import type { SubscriptionPlanItem } from "@/actions/subscription-plan-actions";

/**
 * Lee los planes de suscripción de la plataforma, sin puerta.
 *
 * Vivía dentro de `getAllSubscriptionPlans`, que es una acción de servidor —o
 * sea un endpoint— y la usaba también la landing pública de un reseller, que no
 * tiene sesión. Para poder poner la puerta en la acción sin apagar esa página,
 * la lectura se mudó aquí: `server-only`, sin endpoint, y la llama quien ya
 * decidió que puede.
 *
 * `conMayorista` decide si viaja el precio mayorista, que es lo que la
 * plataforma le cobra a un reseller por licencia. Es un dato de la CASA: en una
 * página pública o en el panel de un cliente no tiene nada que hacer.
 *
 * El `name` de cada fila sale con el nombre VIGENTE de su nivel
 * (`lib/nombre-del-nivel.ts`): un nivel tiene un solo nombre, y la fila que no
 * se editó la última vez no puede seguir vendiendo el anterior.
 */
export async function leerLosPlanes(
    where: Prisma.SubscriptionPlanWhereInput | undefined,
    { conMayorista }: { conMayorista: boolean },
): Promise<SubscriptionPlanItem[]> {
    const plans = await db.subscriptionPlan.findMany({
        where,
        orderBy: [{ assistanceType: "asc" }, { order: "asc" }],
    });
    const conNombre = await conLosNombresVigentes(plans);
    return conNombre.map((p) => ({
        ...p,
        priceUSD: Number(p.priceUSD),
        priceCop: p.priceCop != null ? Number(p.priceCop) : null,
        priceWholesale: conMayorista && p.priceWholesale != null ? Number(p.priceWholesale) : null,
        priceQuarterly: p.priceQuarterly != null ? Number(p.priceQuarterly) : null,
        priceYearly: p.priceYearly != null ? Number(p.priceYearly) : null,
    })) as SubscriptionPlanItem[];
}
