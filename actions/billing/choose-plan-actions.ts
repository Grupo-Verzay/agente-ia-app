"use server";

import { revalidatePath } from "next/cache";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLAN_LABELS, PLANS } from "@/types/plans";
import {
    normalizarAsistencia,
    normalizarPlan,
    precioDePlanParaCuenta,
} from "@/lib/plan-pricing";

/**
 * Elegir plan y quedar listo para pagar, desde dentro de la App.
 *
 * Es lo que le faltaba a quien entra por la prueba gratis: esa cuenta nace sin
 * plan comprado y con precio 0, así que al vencerle la prueba se quedaba
 * bloqueada sin un solo botón que le permitiera pagar. Tenía que escribir por
 * WhatsApp y esperar a que alguien le pusiera el precio a mano.
 *
 * Los planes que ve son los de su marca: si su cuenta es de un reseller, los de
 * ese reseller con sus nombres y sus precios.
 */

export type PlanDisponible = {
    plan: string;
    assistanceType: string;
    label: string;
    description: string | null;
    credits: number;
    features: string[];
    price: number;
    currency: string;
    /**
     * El mismo precio en dólares, que es como se publica y como lo vio en la
     * landing. Se cobra en pesos, pero seis cifras a secas asustan y le hacen
     * dudar de si le están cobrando lo que eligió.
     */
    priceUsd: number | null;
    isPopular: boolean;
    isCurrent: boolean;
};

/** El reseller dueño de la cuenta, si lo hay. */
async function resellerDeLaCuenta(userId: string): Promise<string | null> {
    const u = await db.user
        .findUnique({ where: { id: userId }, select: { demoResellerId: true } })
        .catch(() => null);
    return u?.demoResellerId ?? null;
}

export async function getPlanesParaPagar(): Promise<{
    success: boolean;
    data: PlanDisponible[];
    message?: string;
}> {
    try {
        const me = await currentUser();
        if (!me) return { success: false, data: [], message: "No autorizado." };

        const resellerUserId = await resellerDeLaCuenta(me.id);

        const propios = resellerUserId
            ? await db.resellerPlan.findMany({
                where: { resellerUserId, isActive: true },
                orderBy: { order: "asc" },
            })
            : [];

        const dePlataforma = await db.subscriptionPlan.findMany({
            where: { isActive: true, isResellerPlan: false },
            orderBy: [{ assistanceType: "asc" }, { order: "asc" }],
        });

        // Los del reseller mandan; los de la plataforma solo rellenan lo que ese
        // reseller no vende. Mezclarlos al revés le pondría al cliente precios
        // de otra marca.
        const fuente = propios.length
            ? propios.map((p) => ({
                plan: p.plan as string,
                assistanceType: p.assistanceType,
                name: p.name,
                description: p.description,
                credits: p.credits,
                features: p.features,
                isPopular: p.isPopular,
                precioReferencia: Number(p.priceMonthly),
            }))
            : dePlataforma.map((p) => ({
                plan: p.plan as string,
                assistanceType: p.assistanceType,
                name: p.name,
                description: p.description,
                credits: p.credits,
                features: p.features,
                isPopular: p.isPopular,
                precioReferencia: Number(p.priceUSD),
            }));

        const data: PlanDisponible[] = [];
        for (const p of fuente) {
            // Sin precio es una tarjeta de "a consultar": no se puede pagar sola,
            // así que no tiene sentido ofrecerla aquí.
            if (!(p.precioReferencia > 0)) continue;

            const precio = await precioDePlanParaCuenta(p.plan, p.assistanceType, resellerUserId);
            if (!precio || !(precio.price > 0)) continue;

            data.push({
                plan: p.plan,
                assistanceType: p.assistanceType,
                label: p.name?.trim() || PLAN_LABELS[p.plan as keyof typeof PLAN_LABELS] || p.plan,
                description: p.description,
                credits: p.credits,
                features: p.features ?? [],
                price: precio.price,
                currency: precio.currency,
                // El de referencia, no una reconversión: es el número exacto
                // que el dueño escribió en Planes.
                priceUsd: precio.currency === "COP" ? p.precioReferencia : null,
                isPopular: p.isPopular,
                isCurrent: p.plan === me.plan,
            });
        }

        // Orden por nivel: la lista tiene que leerse como una escalera.
        data.sort((a, b) => PLANS.indexOf(a.plan as never) - PLANS.indexOf(b.plan as never));

        return { success: true, data };
    } catch (e) {
        console.error("[getPlanesParaPagar]", e);
        return { success: false, data: [], message: "No se pudieron cargar los planes." };
    }
}

export async function elegirPlanParaPagar(
    planSlug: string,
    assistanceType: string,
): Promise<{ success: boolean; message: string }> {
    try {
        const me = await currentUser();
        if (!me) return { success: false, message: "No autorizado." };

        const plan = normalizarPlan(planSlug);
        if (!plan) return { success: false, message: "Plan no válido." };

        const resellerUserId = await resellerDeLaCuenta(me.id);
        const precio = await precioDePlanParaCuenta(
            plan,
            normalizarAsistencia(assistanceType),
            resellerUserId,
        );

        if (!precio || !(precio.price > 0)) {
            return {
                success: false,
                message: "Ese plan no tiene precio publicado. Escríbenos y lo cerramos contigo.",
            };
        }

        // Solo se deja lo que hay que cobrar. La activación —fecha, estado,
        // créditos— la hace la confirmación del pago; adelantarla aquí sería
        // dar el servicio antes de cobrarlo.
        await db.$transaction(async (tx) => {
            await tx.user.update({ where: { id: me.id }, data: { plan } });
            await tx.userBilling.update({
                where: { userId: me.id },
                data: { price: precio.price, currencyCode: precio.currency, licenseDays: 30 },
            });
        });

        revalidatePath("/profile");
        return { success: true, message: "Plan seleccionado. Ya puedes pagar." };
    } catch (e) {
        console.error("[elegirPlanParaPagar]", e);
        return { success: false, message: "No se pudo seleccionar el plan." };
    }
}
