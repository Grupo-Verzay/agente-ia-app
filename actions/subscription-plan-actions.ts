"use server";

import { db } from "@/lib/db";
import { Plan, type Prisma } from "@prisma/client";
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
import { lasFuncionesGuardadas } from "@/lib/plan-funciones-db";
import {
  AUDIENCIAS,
  comoAudiencia,
  laAudienciaDelPlan,
  type Audiencia,
  type FuncionDeLaPlantilla,
} from "@/lib/plantilla-de-funciones";
import { LA_PLANTILLA_CAMBIO, sincronizarLaAudiencia } from "@/lib/plantilla-de-funciones-db";
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
 * La plantilla maestra de una audiencia, como la ve el panel: el inventario,
 * la versión con la que se guarda y en cuántos planes está encendida cada
 * función (lo que dice el aviso de borrarla).
 */
export type PlantillaDelPanel = {
  plantilla: FuncionDeLaPlantilla[];
  version: number;
  encendidas: Record<string, number>;
};

/**
 * Pone cada plantilla y sus planes de acuerdo antes de enseñarlos: la primera
 * vez arma la plantilla con el inventario de lo que tiene cada plan hoy, y
 * después recoge lo que haya entrado por otro camino. Si una no se puede, el
 * panel sigue con lo guardado —sin plantilla para esa audiencia, que es como
 * funcionaba antes— y se dice.
 */
async function lasPlantillas(): Promise<Partial<Record<Audiencia, PlantillaDelPanel>>> {
  const fuera: Partial<Record<Audiencia, PlantillaDelPanel>> = {};
  let hubo = false;
  for (const audiencia of AUDIENCIAS) {
    try {
      const r = await sincronizarLaAudiencia(audiencia);
      if (!r.ok) {
        console.warn("[planes] la plantilla de funciones no se pudo poner al día", { audiencia, motivo: r.motivo });
        continue;
      }
      fuera[audiencia] = { plantilla: r.plantilla, version: r.version, encendidas: r.encendidas };
      if (r.hubo) {
        hubo = true;
        console.info("[planes] plantilla de funciones puesta al día", {
          audiencia,
          agregadas: r.agregadas,
          planesTocados: r.planesTocados,
        });
      }
    } catch (e) {
      console.error("[planes] no se pudo leer la plantilla de funciones; el panel sigue sin ella", { audiencia, e });
    }
  }
  if (hubo) {
    try {
      revalidarLasPaginasDelPlan();
    } catch (e) {
      // Se llama mientras se pinta el panel, y ahí Next no deja revalidar: las
      // páginas públicas leen en vivo igual.
      console.warn("[planes] no se pudieron revalidar las páginas de los planes", e);
    }
  }
  return fuera;
}

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
    if (!esDeLaCasa) {
      return { success: true, data: await leerLosPlanes(undefined, { conMayorista: false }) };
    }
    // Las plantillas primero: pueden reescribir las funciones de los planes, y
    // lo que se lee después ya es lo de ahora.
    const plantillas = await lasPlantillas();
    const planes = await leerLosPlanes(undefined, { conMayorista: true });
    return { success: true, data: await conSusFunciones(planes), plantillas };
  } catch (e) {
    console.error("[getAllSubscriptionPlans] Error:", e);
    return { success: false, data: [] as SubscriptionPlanItem[] };
  }
}

/**
 * Guarda la plantilla maestra de una audiencia y la reparte en todos sus
 * planes: una función nueva entra apagada en todos, un cambio de nombre,
 * descripción, categoría o tutorial llega a todos, y una función borrada sale
 * de todos. Lo que es de cada plan —encendida, destacada, orden— no se toca.
 *
 * `version` es la que vio quien guarda: si la plantilla cambió desde entonces,
 * no se guarda nada (dos pestañas no se pisan).
 */
export async function guardarLaPlantillaDeFunciones(audienciaRaw: unknown, lista: unknown, versionRaw: unknown) {
  try {
    // La plantilla la ven y la pagan todos los planes: la toca la casa y nadie más.
    if (!(await quienMandaEnLaCasa("guardarLaPlantillaDeFunciones"))) {
      return { success: false as const, message: "No autorizado" };
    }
    const audiencia = comoAudiencia(audienciaRaw);
    if (!audiencia) return { success: false as const, message: "Esa plantilla no existe." };
    const version = Number(versionRaw);
    if (!Number.isInteger(version) || version < 0) return { success: false as const, message: LA_PLANTILLA_CAMBIO };

    const r = await sincronizarLaAudiencia(audiencia, { tipo: "plantilla", lista, version });
    if (!r.ok) return { success: false as const, message: r.motivo };
    if (r.hubo) revalidarLasPaginasDelPlan();
    return {
      success: true as const,
      message: r.hubo ? "Plantilla guardada en todos los planes" : "No había nada que cambiar",
      plantilla: { plantilla: r.plantilla, version: r.version, encendidas: r.encendidas } satisfies PlantillaDelPanel,
      planesTocados: r.planesTocados,
    };
  } catch (e) {
    console.error("[planes] no se pudo guardar la plantilla de funciones", e);
    return { success: false as const, message: "No se pudo guardar la plantilla de funciones." };
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
   * La lista estructurada del editor. Si llega, MANDA: es el estado de cada
   * función de la plantilla en ESTE plan (encendida, destacada y orden), y
   * `features` se rehace con las encendidas. Una función que la plantilla no
   * tenga entra en ella, apagada en los demás planes.
   */
  funciones?: unknown;
  /**
   * La versión de la plantilla con la que se abrió el editor. Si llega y la
   * plantilla cambió desde entonces, no se guarda nada. `null` es «el panel
   * no tenía plantilla» (no se comprueba).
   */
  versionDeLaPlantilla?: number | null;
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
    const nombre = data.name === undefined ? undefined : data.name?.trim() || null;
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
      // El nombre es del NIVEL, no de la fila (`lib/nombre-del-nivel.ts`): sin
      // `name` en la petición no se toca —antes se ponía a nulo, y por eso
      // «Inicializar» borraba los nombres—, y con él se escribe en todas las
      // filas del nivel, abajo.
      ...(nombre !== undefined ? { name: nombre } : {}),
    };
    // La fila del plan se escribe DENTRO de la transacción de la plantilla: con
    // la fila guardada y sus funciones no, el plan quedaría a medias.
    const guardarLaFila = async (tx: Prisma.TransactionClient): Promise<string> => {
      const existing = await tx.subscriptionPlan.findFirst({
        where: { plan: data.plan, assistanceType: data.assistanceType, isResellerPlan },
        select: { id: true },
      });
      // Con `funciones` las encendidas las escribe la plantilla, en esta misma
      // transacción (`undefined` es «no tocar» para Prisma); la fila nueva nace
      // con las que manda el editor.
      const guardado = existing
        ? await tx.subscriptionPlan.update({
            where: { id: existing.id },
            data: funciones ? { ...payload, features: undefined } : payload,
            select: { id: true },
          })
        : await tx.subscriptionPlan.create({
            data: { plan: data.plan, assistanceType: data.assistanceType, isResellerPlan, ...payload },
            select: { id: true },
          });
      if (nombre !== undefined) {
        // Un nivel tiene UN nombre: el de IA, el de Humano y el que se vende a
        // los resellers. Renombrar una sola fila dejaba las demás —la que está
        // a la venta y pinta la landing— con el nombre anterior.
        await tx.subscriptionPlan.updateMany({ where: { plan: data.plan }, data: { name: nombre } });
      }
      return guardado.id;
    };

    const version =
      typeof data.versionDeLaPlantilla === "number" && Number.isFinite(data.versionDeLaPlantilla)
        ? data.versionDeLaPlantilla
        : null;
    const r = await sincronizarLaAudiencia(laAudienciaDelPlan({ isResellerPlan }), {
      tipo: "plan",
      guardarLaFila,
      ...(funciones ? { funciones, version } : {}),
    });
    if (!r.ok) return { success: false, message: r.motivo };
    revalidarLasPaginasDelPlan();
    return { success: true, message: "Plan guardado" };
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
