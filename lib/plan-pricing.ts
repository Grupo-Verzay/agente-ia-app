import { Plan } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * Qué se le cobra a una cuenta por un plan, y en qué moneda.
 *
 * Vive aquí y no dentro de una server action porque lo usan dos caminos
 * distintos: el registro desde la landing (el cliente elige plan antes de
 * existir) y la elección de plan desde dentro (el que venía de la prueba
 * gratis). Si cada uno calculara su precio, tarde o temprano cobrarían
 * distinto por lo mismo.
 */
export type PrecioDePlan = { plan: Plan; price: number; currency: string };

/**
 * Pasa el precio de referencia a la moneda en la que de verdad entra el dinero.
 *
 * Los planes se publican en USD, pero el cobro es en pesos: Wompi es una
 * pasarela colombiana. Si la cuenta queda facturada en USD y el comprobante
 * llega en COP, la validación de monto —que exige que la moneda coincida— manda
 * todos los pagos a revisión manual y no renueva ninguno.
 *
 * Sin tasa configurada no se convierte nada y todo queda como antes.
 */
export async function convertirAMonedaDeCobro(
    precioUSD: number,
): Promise<{ price: number; currency: string }> {
    const cfg = await db.siteConfig
        .findUnique({ where: { id: 1 }, select: { usdToCopRate: true } })
        .catch(() => null);

    const tasa = Number(cfg?.usdToCopRate ?? 0);
    if (!Number.isFinite(tasa) || tasa <= 0) return { price: precioUSD, currency: "USD" };

    // Wompi cobra en pesos enteros; un monto con decimales invalida el enlace.
    return { price: Math.round(precioUSD * tasa), currency: "COP" };
}

/** El nivel llega por URL o por un formulario, así que se valida contra el enum. */
export function normalizarPlan(valor: string | undefined | null): Plan | null {
    const slug = valor?.trim().toLowerCase();
    if (!slug) return null;
    return (Object.values(Plan) as string[]).includes(slug) ? (slug as Plan) : null;
}

export function normalizarAsistencia(valor: string | undefined | null): "IA" | "HUMANO" {
    return valor?.trim().toUpperCase() === "HUMANO" ? "HUMANO" : "IA";
}

/**
 * Precio de un plan para una cuenta concreta.
 *
 * Si la cuenta es de un reseller manda el precio que ese reseller le puso a su
 * plan: cada marca vende lo mismo a su precio, y cobrarle el de la plataforma
 * sería cobrarle el de otra marca.
 */
export async function precioDePlanParaCuenta(
    planSlug: string | undefined | null,
    assistanceType: string | undefined | null,
    resellerUserId: string | null,
): Promise<PrecioDePlan | null> {
    const plan = normalizarPlan(planSlug);
    if (!plan) return null;

    const tipo = normalizarAsistencia(assistanceType);

    if (resellerUserId) {
        const propio = await db.resellerPlan
            .findFirst({
                where: { resellerUserId, plan, assistanceType: tipo, isActive: true },
                select: { priceMonthly: true },
            })
            .catch(() => null);
        if (propio) return { plan, ...(await convertirAMonedaDeCobro(Number(propio.priceMonthly))) };
    }

    const dePlataforma = await db.subscriptionPlan
        .findFirst({
            where: { plan, assistanceType: tipo, isResellerPlan: false, isActive: true },
            select: { priceUSD: true },
        })
        .catch(() => null);

    return { plan, ...(await convertirAMonedaDeCobro(Number(dePlataforma?.priceUSD ?? 0))) };
}
