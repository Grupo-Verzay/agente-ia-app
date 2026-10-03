"use server";

import { db } from "@/lib/db";
import { Plan } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { currentUser } from "@/lib/auth";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import { mandaEnLaCasaDeVerdad } from "@/lib/mando-de-la-casa";
import { comoEnteroNoNegativo, comoNumeroNoNegativo } from "@/lib/numeros-de-la-configuracion";
import { leerLosPlanes } from "@/lib/planes-de-suscripcion.server";
import { quienMandaEnLaCasa } from "@/lib/puerta-de-la-casa";
import { etiquetasDePlanesParaMarca } from "@/lib/plan-pricing";
import {
  comoFunciones,
  lasFuncionesDelPlan,
  lasFuncionesDestacadas,
  losFeaturesDeLasFunciones,
  type FuncionDelPlan,
} from "@/lib/pagina-de-plan";
import { guardarLasFunciones, lasFuncionesGuardadas } from "@/lib/plan-funciones-db";
import { PLAN_LEVEL_LABELS } from "@/types/plans";

export type SubscriptionPlanItem = {
  id: string;
  plan: Plan;
  assistanceType: string;
  isResellerPlan: boolean;
  priceUSD: number;
  /** Precio en pesos escrito a mano. Puesto, manda él y no se convierte nada. */
  priceCop: number | null;
  priceWholesale: number | null;
  priceQuarterly: number | null;
  priceYearly: number | null;
  credits: number;
  features: string[];
  description: string | null;
  isPopular: boolean;
  isActive: boolean;
  color: string | null;
  order: number;
  checkoutUrlMonthly: string | null;
  checkoutUrlQuarterly: string | null;
  checkoutUrlYearly: string | null;
  name: string | null;
  /**
   * Cada función con su categoría, su descripción, su tutorial y si está
   * encendida. Solo la trae el panel de Planes (`getAllSubscriptionPlans` para
   * la casa); el resto de pantallas leen `features`, que son las encendidas.
   */
  funciones?: FuncionDelPlan[];
  /**
   * Las funciones que salen en la tarjeta CORTA de la landing: las encendidas
   * que tienen la estrella puesta, en su orden. Solo la trae
   * `getActiveSubscriptionPlans`; la página del plan y el detalle enseñan
   * TODAS las encendidas (`features`).
   */
  destacadas?: string[];
};

/**
 * Le pone a cada plan sus funciones, emparejadas con `features`. Si
 * `plan_funciones` no se puede leer, se deducen de `features`: el panel no se
 * queda sin planes por eso, pero se dice.
 */
async function conSusFunciones(planes: SubscriptionPlanItem[]): Promise<SubscriptionPlanItem[]> {
  let guardadas = new Map<string, unknown>();
  try {
    guardadas = await lasFuncionesGuardadas(planes.map((p) => p.id));
  } catch (e) {
    console.error("[planes] no se pudieron leer las funciones guardadas; se deducen de features", e);
  }
  return planes.map((p) => ({ ...p, funciones: lasFuncionesDelPlan(p.features ?? [], guardadas.get(p.id)) }));
}

/**
 * Todos los planes, activos e inactivos. La leen dos pantallas: Planes y
 * Resellers (la casa) y «Mis planes» (un reseller, que parte de las plantillas
 * de la plataforma). Nadie más.
 *
 * Solo la casa recibe el precio MAYORISTA: es lo que la plataforma le cobra a un
 * reseller, no un precio de venta.
 */
export async function getAllSubscriptionPlans() {
  try {
    const me = await currentUser();
    const esDeLaCasa = await mandaEnLaCasaDeVerdad(me);
    const esReseller = !esDeLaCasa && !!me && (await cuentaQueManda(me)).role === "reseller";
    if (!esDeLaCasa && !esReseller) {
      console.warn("[planes] lectura de todos los planes rechazada", { persona: me?.id ?? null });
      return { success: false, data: [] as SubscriptionPlanItem[] };
    }
    const planes = await leerLosPlanes(undefined, { conMayorista: esDeLaCasa });
    return { success: true, data: esDeLaCasa ? await conSusFunciones(planes) : planes };
  } catch (e) {
    console.error("[getAllSubscriptionPlans] Error:", e);
    return { success: false, data: [] as SubscriptionPlanItem[] };
  }
}

// Las dos de abajo las abren páginas PÚBLICAS (la landing y la de resellers) y
// /planes: son el precio de venta y tienen que poder leerse sin permiso. Lo que
// no viaja es el mayorista.
export async function getActiveSubscriptionPlans() {
  try {
    const planes = await leerLosPlanes({ isActive: true, isResellerPlan: false }, { conMayorista: false });
    return { success: true, data: await conSusDestacadas(planes) };
  } catch (e) {
    console.error("[planes] no se pudieron leer los planes activos", e);
    return { success: false, data: [] as SubscriptionPlanItem[] };
  }
}

/**
 * Le pone a cada plan las funciones de su tarjeta corta (`destacadas`). Si
 * `plan_funciones` no se puede leer, la tarjeta enseña todas las encendidas
 * —que es lo que enseñaba antes de existir la estrella— y se dice: la landing
 * no se queda sin planes por eso.
 */
async function conSusDestacadas(planes: SubscriptionPlanItem[]): Promise<SubscriptionPlanItem[]> {
  let guardadas = new Map<string, unknown>();
  try {
    guardadas = await lasFuncionesGuardadas(planes.map((p) => p.id));
  } catch (e) {
    console.error("[planes] no se pudieron leer las funciones destacadas; la tarjeta enseña todas", e);
    return planes.map((p) => ({ ...p, destacadas: p.features ?? [] }));
  }
  return planes.map((p) => ({
    ...p,
    destacadas: lasFuncionesDestacadas(lasFuncionesDelPlan(p.features ?? [], guardadas.get(p.id))),
  }));
}

export async function getActiveResellerAccessPlans() {
  try {
    return {
      success: true,
      data: await leerLosPlanes({ isActive: true, isResellerPlan: true }, { conMayorista: false }),
    };
  } catch {
    return { success: false, data: [] as SubscriptionPlanItem[] };
  }
}

export async function upsertSubscriptionPlan(data: {
  plan: Plan;
  assistanceType: string;
  isResellerPlan?: boolean;
  priceUSD: number;
  priceCop?: number | null;
  priceWholesale?: number | null;
  priceQuarterly?: number | null;
  priceYearly?: number | null;
  credits: number;
  features: string[];
  /**
   * La lista estructurada del editor. Si llega, MANDA: `features` se rehace con
   * las encendidas, en su orden, y lo demás se guarda en `plan_funciones`.
   */
  funciones?: unknown;
  description?: string;
  isPopular?: boolean;
  isActive?: boolean;
  color?: string;
  order?: number;
  checkoutUrlMonthly?: string;
  checkoutUrlQuarterly?: string;
  checkoutUrlYearly?: string;
  name?: string | null;
}) {
  try {
    // El precio y los créditos de un plan los ve y los paga TODA la plataforma:
    // lo cambia la casa y nadie más (`lib/mando-de-la-casa.ts`).
    if (!(await quienMandaEnLaCasa("upsertSubscriptionPlan"))) {
      return { success: false, message: "No autorizado" };
    }
    const priceUSD = comoNumeroNoNegativo(data.priceUSD);
    const credits = comoEnteroNoNegativo(data.credits);
    if (priceUSD === null) return { success: false, message: "El precio no es válido" };
    if (credits === null) return { success: false, message: "Los créditos no son válidos" };
    const isResellerPlan = data.isResellerPlan ?? false;
    const funciones = data.funciones !== undefined ? comoFunciones(data.funciones) : null;
    const features = funciones
      ? losFeaturesDeLasFunciones(funciones)
      : (Array.isArray(data.features) ? data.features : []).filter((f) => typeof f === "string" && f.trim());
    const payload = {
      priceUSD,
      priceCop: comoNumeroNoNegativo(data.priceCop),
      priceWholesale: comoNumeroNoNegativo(data.priceWholesale),
      priceQuarterly: comoNumeroNoNegativo(data.priceQuarterly),
      priceYearly: comoNumeroNoNegativo(data.priceYearly),
      credits,
      features,
      description: data.description ?? null,
      isPopular: data.isPopular ?? false,
      isActive: data.isActive ?? true,
      color: data.color ?? null,
      order: data.order ?? 0,
      checkoutUrlMonthly: data.checkoutUrlMonthly ?? null,
      checkoutUrlQuarterly: data.checkoutUrlQuarterly ?? null,
      checkoutUrlYearly: data.checkoutUrlYearly ?? null,
      name: data.name ?? null,
    };
    const existing = await db.subscriptionPlan.findFirst({
      where: { plan: data.plan, assistanceType: data.assistanceType, isResellerPlan },
    });
    const guardado = existing
      ? await db.subscriptionPlan.update({ where: { id: existing.id }, data: payload, select: { id: true } })
      : await db.subscriptionPlan.create({
          data: { plan: data.plan, assistanceType: data.assistanceType, isResellerPlan, ...payload },
          select: { id: true },
        });
    let aviso: string | null = null;
    if (funciones) {
      try {
        await guardarLasFunciones(guardado.id, funciones);
      } catch (e) {
        // El plan ya quedó guardado con sus funciones encendidas; lo que se
        // pierde es la categoría, la descripción y el tutorial. Se dice.
        console.error("[planes] el plan se guardó pero sus funciones no", { plan: guardado.id, e });
        aviso = "El plan se guardó, pero no las categorías ni los tutoriales de sus funciones. Vuelve a guardar.";
      }
    }
    revalidarLasPaginasDelPlan();
    return aviso ? { success: false, message: aviso } : { success: true, message: "Plan guardado" };
  } catch (e) {
    console.error("[upsertSubscriptionPlan]", e);
    return { success: false, message: "Error al guardar el plan" };
  }
}

/** Lo que enseña un plan: la lista de planes, su página de detalle y la landing. */
function revalidarLasPaginasDelPlan() {
  revalidatePath("/planes");
  revalidatePath("/planes/[slug]", "page");
  revalidatePath("/inicio");
}

export async function toggleSubscriptionPlanActive(id: string, isActive: boolean) {
  try {
    if (!(await quienMandaEnLaCasa("toggleSubscriptionPlanActive"))) return { success: false };
    await db.subscriptionPlan.update({ where: { id }, data: { isActive } });
    revalidarLasPaginasDelPlan();
    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * Cómo llama SU marca a cada nivel, para los desplegables que los listan todos.
 *
 * El de "Crear cliente" usaba la tabla interna de nombres, que dice "Agencias"
 * para el nivel 6 y "Enterprise" para el 5. Ninguna marca los vende así, y quien
 * está dando de alta un cliente no reconoce lo que está eligiendo.
 *
 * Un reseller ve los suyos; el dueño de la plataforma, los de la plataforma. Al
 * nivel sin nombre le queda su número, que es lo único cierto que se puede decir
 * de él sin ponerle el nombre comercial de otra marca.
 */
export async function getPlanLabelsForMyBrand(): Promise<Record<string, string>> {
  try {
    const me = await currentUser();
    if (!me) return {};

    const yo = await db.user
      .findUnique({ where: { id: me.id }, select: { role: true, demoResellerId: true } })
      .catch(() => null);

    // Un reseller vende sus propios planes; un cliente suyo ve los de él.
    const resellerId = yo?.role === "reseller" ? me.id : yo?.demoResellerId ?? null;

    const etiquetas = await etiquetasDePlanesParaMarca(resellerId);
    return { ...PLAN_LEVEL_LABELS, ...etiquetas };
  } catch {
    return {};
  }
}
