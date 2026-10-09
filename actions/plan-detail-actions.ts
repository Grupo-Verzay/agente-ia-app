"use server";

import { db } from "@/lib/db";
import { Plan } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { quienMandaEnLaCasa } from "@/lib/puerta-de-la-casa";
import {
  comoOrdenDeBloques,
  comoParaQuien,
  comoTodoIncluido,
  esLaListaDeFabrica,
  laListaQueSeGuarda,
  losDatosDelPlan,
  type BloqueDeLaPagina,
  type ParaQuienDelPlan,
  type TodoIncluidoDelPlan,
} from "@/lib/pagina-de-plan";
import { guardarLaPagina, laPaginaGuardada } from "@/lib/plan-pagina-db";
import { elParaQuienGuardado, guardarElParaQuien } from "@/lib/plan-para-quien-db";
import { elTodoIncluidoGuardado, guardarElTodoIncluido } from "@/lib/plan-todo-incluido-db";

export type FeatureSection = {
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  layout: "left" | "right";
  badge?: string;
};

export type GalleryImage = {
  url: string;
  caption: string;
  alt: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type StatItem = {
  value: string;
  label: string;
};

export type TestimonialItem = {
  name: string;
  role: string;
  company: string;
  text: string;
  avatarUrl?: string;
  rating: number;
};

export type PlanDetailData = {
  id: string;
  subscriptionPlanId: string;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
  heroBadge: string | null;
  videoUrl: string | null;
  videoTitle: string | null;
  videoThumbnailUrl: string | null;
  featureSections: FeatureSection[];
  galleryImages: GalleryImage[];
  faqs: FaqItem[];
  stats: StatItem[];
  testimonials: TestimonialItem[];
  meetingUrl: string | null;
  demoUrl: string | null;
  whatsappMessage: string | null;
  ctaTitle: string | null;
  ctaSubtitle: string | null;
  ctaButtonText: string | null;
  ctaButtonUrl: string | null;
  ctaSecondaryText: string | null;
  ctaSecondaryUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
};

function parsePlanDetail(raw: Record<string, unknown>): PlanDetailData {
  return {
    id: raw.id as string,
    subscriptionPlanId: raw.subscriptionPlanId as string,
    heroTitle: (raw.heroTitle as string) ?? null,
    heroSubtitle: (raw.heroSubtitle as string) ?? null,
    heroImageUrl: (raw.heroImageUrl as string) ?? null,
    heroBadge: (raw.heroBadge as string) ?? null,
    videoUrl: (raw.videoUrl as string) ?? null,
    videoTitle: (raw.videoTitle as string) ?? null,
    videoThumbnailUrl: (raw.videoThumbnailUrl as string) ?? null,
    featureSections: (raw.featureSections as FeatureSection[]) ?? [],
    galleryImages: (raw.galleryImages as GalleryImage[]) ?? [],
    faqs: (raw.faqs as FaqItem[]) ?? [],
    stats: (raw.stats as StatItem[]) ?? [],
    testimonials: (raw.testimonials as TestimonialItem[]) ?? [],
    meetingUrl: (raw.meetingUrl as string) ?? null,
    demoUrl: (raw.demoUrl as string) ?? null,
    whatsappMessage: (raw.whatsappMessage as string) ?? null,
    ctaTitle: (raw.ctaTitle as string) ?? null,
    ctaSubtitle: (raw.ctaSubtitle as string) ?? null,
    ctaButtonText: (raw.ctaButtonText as string) ?? null,
    ctaButtonUrl: (raw.ctaButtonUrl as string) ?? null,
    ctaSecondaryText: (raw.ctaSecondaryText as string) ?? null,
    ctaSecondaryUrl: (raw.ctaSecondaryUrl as string) ?? null,
    metaTitle: (raw.metaTitle as string) ?? null,
    metaDescription: (raw.metaDescription as string) ?? null,
    ogImageUrl: (raw.ogImageUrl as string) ?? null,
  };
}

/**
 * El detalle de un plan y, aparte, lo escrito en «Para quién es este plan»
 * (`plan_para_quien`, tabla de la App: `null` es «nunca se escribió», y la
 * página enseña lo de fábrica) y el orden de los bloques de la página con los
 * recuadros del resumen de capacidad (`plan_pagina`; sin fila, lo de fábrica)
 * y «Todo incluido, sin sorpresas» (`plan_todo_incluido`; `null`: no sale).
 * Los recuadros viajan CRUDOS (`null`: sin tocar): el panel los arma con los
 * datos del plan, que ya tiene delante (`laListaDeRecuadros`).
 * Si una de esas tablas no se puede leer, el detalle sale igual y se dice: el
 * panel no se queda sin video ni preguntas por eso.
 */
export async function getPlanDetailBySubscriptionPlanId(subscriptionPlanId: string) {
  try {
    const [detail, paraQuien, pagina, todoIncluido] = await Promise.all([
      db.planDetail.findUnique({ where: { subscriptionPlanId } }),
      elParaQuienGuardado(subscriptionPlanId).catch((e) => {
        console.error("[planes] no se pudo leer «para quién es este plan»", { subscriptionPlanId, e });
        return null;
      }),
      laPaginaGuardada(subscriptionPlanId).catch((e) => {
        console.error("[planes] no se pudo leer el orden ni los recuadros de la página", { subscriptionPlanId, e });
        return null;
      }),
      elTodoIncluidoGuardado(subscriptionPlanId).catch((e) => {
        console.error("[planes] no se pudo leer «Todo incluido, sin sorpresas»", { subscriptionPlanId, e });
        return null;
      }),
    ]);
    return {
      success: true,
      data: detail ? parsePlanDetail(detail as unknown as Record<string, unknown>) : null,
      paraQuien: paraQuien as ParaQuienDelPlan | null,
      orden: (pagina?.orden ?? comoOrdenDeBloques(null)) as BloqueDeLaPagina[],
      recuadros: (pagina?.recuadros ?? null) as unknown,
      todoIncluido: todoIncluido as TodoIncluidoDelPlan | null,
    };
  } catch (e) {
    console.error("[getPlanDetailBySubscriptionPlanId]", e);
    return {
      success: false,
      data: null,
      paraQuien: null as ParaQuienDelPlan | null,
      orden: comoOrdenDeBloques(null) as BloqueDeLaPagina[],
      recuadros: null as unknown,
      todoIncluido: null as TodoIncluidoDelPlan | null,
    };
  }
}

export async function getPlanDetailBySlug(planSlug: string, assistanceType = "IA") {
  try {
    const plan = await db.subscriptionPlan.findFirst({
      where: { plan: planSlug as Plan, assistanceType, isResellerPlan: false },
      include: { planDetail: true },
    });
    if (!plan) return { success: false, data: null };
    return {
      success: true,
      plan: {
        id: plan.id,
        plan: plan.plan,
        assistanceType: plan.assistanceType,
        priceUSD: Number(plan.priceUSD),
        priceQuarterly: plan.priceQuarterly != null ? Number(plan.priceQuarterly) : null,
        priceYearly: plan.priceYearly != null ? Number(plan.priceYearly) : null,
        credits: plan.credits,
        features: plan.features,
        description: plan.description,
        isPopular: plan.isPopular,
        checkoutUrlMonthly: plan.checkoutUrlMonthly,
        checkoutUrlQuarterly: plan.checkoutUrlQuarterly,
        checkoutUrlYearly: plan.checkoutUrlYearly,
      },
      data: plan.planDetail
        ? parsePlanDetail(plan.planDetail as unknown as Record<string, unknown>)
        : null,
    };
  } catch (e) {
    console.error("[getPlanDetailBySlug]", e);
    return { success: false, data: null, plan: null };
  }
}

export type UpsertPlanDetailInput = Omit<PlanDetailData, "id" | "subscriptionPlanId"> & {
  /** «Para quién es este plan». Vive en `plan_para_quien`, no en `plan_details`. */
  paraQuien?: string;
  /** El caso típico de negocio, al lado del anterior. */
  caso?: string;
  /** En qué orden van los bloques de la página. Vive en `plan_pagina`. */
  orden?: unknown;
  /** Los recuadros del resumen de capacidad, al lado del orden: una lista, o `null` para los de fábrica. */
  recuadros?: unknown;
  /** El título de «Todo incluido, sin sorpresas». Vive en `plan_todo_incluido`. */
  todoIncluidoTitulo?: string;
  /** Lo que trae el plan sin costo adicional, en texto libre. */
  todoIncluidoTexto?: string;
};

/**
 * Los campos que se guardan. Uno que NO llega no se toca: el panel ya no edita
 * las galerías, los testimonios ni las secciones de marketing (la página del
 * plan no las enseña), y guardar el video no puede borrarlas por debajo.
 */
const CAMPOS_DE_TEXTO = [
  "heroTitle", "heroSubtitle", "heroImageUrl", "heroBadge",
  "videoUrl", "videoTitle", "videoThumbnailUrl",
  "meetingUrl", "demoUrl", "whatsappMessage",
  "ctaTitle", "ctaSubtitle", "ctaButtonText", "ctaButtonUrl", "ctaSecondaryText", "ctaSecondaryUrl",
  "metaTitle", "metaDescription", "ogImageUrl",
] as const;
const CAMPOS_DE_LISTA = ["featureSections", "galleryImages", "faqs", "stats", "testimonials"] as const;

export async function upsertPlanDetail(
  subscriptionPlanId: string,
  data: Partial<UpsertPlanDetailInput>
) {
  try {
    // La ficha de venta de un plan es de la plataforma: la cambia la casa
    // (`lib/mando-de-la-casa.ts`). Leerla sigue abierto —es la landing—.
    if (!(await quienMandaEnLaCasa("upsertPlanDetail"))) {
      return { success: false, message: "No autorizado" };
    }
    const entrada = (data ?? {}) as Record<string, unknown>;
    const payload: Record<string, unknown> = {};
    for (const campo of CAMPOS_DE_TEXTO) {
      if (!(campo in entrada) || entrada[campo] === undefined) continue;
      const v = entrada[campo];
      payload[campo] = typeof v === "string" && v.trim() ? v.trim() : null;
    }
    for (const campo of CAMPOS_DE_LISTA) {
      if (!(campo in entrada) || entrada[campo] === undefined) continue;
      payload[campo] = Array.isArray(entrada[campo]) ? entrada[campo] : [];
    }

    await db.planDetail.upsert({
      where: { subscriptionPlanId },
      create: { subscriptionPlanId, ...payload },
      update: payload,
    });

    // Después del upsert: si el plan no existiera, la clave foránea de
    // `plan_details` ya habría dicho que no y no queda una fila huérfana.
    if (("paraQuien" in entrada && entrada.paraQuien !== undefined) || ("caso" in entrada && entrada.caso !== undefined)) {
      const limpio = comoParaQuien({ paraQuien: entrada.paraQuien ?? "", caso: entrada.caso ?? "" });
      await guardarElParaQuien(subscriptionPlanId, {
        paraQuien: entrada.paraQuien === undefined ? undefined : limpio.paraQuien,
        caso: entrada.caso === undefined ? undefined : limpio.caso,
      });
    }
    if (
      ("todoIncluidoTitulo" in entrada && entrada.todoIncluidoTitulo !== undefined) ||
      ("todoIncluidoTexto" in entrada && entrada.todoIncluidoTexto !== undefined)
    ) {
      const limpio = comoTodoIncluido({ titulo: entrada.todoIncluidoTitulo ?? "", texto: entrada.todoIncluidoTexto ?? "" });
      await guardarElTodoIncluido(subscriptionPlanId, {
        titulo: entrada.todoIncluidoTitulo === undefined ? undefined : limpio.titulo,
        texto: entrada.todoIncluidoTexto === undefined ? undefined : limpio.texto,
      });
    }
    // El orden y los recuadros, igual: solo lo que llega, y saneado en
    // `guardarLaPagina` (lo que llega del navegador no decide qué se guarda).
    if (entrada.orden !== undefined || entrada.recuadros !== undefined) {
      let recuadros: unknown = entrada.recuadros;
      // Una lista que dice exactamente lo de fábrica se guarda como «sin
      // tocar»: así sigue al plan cuando cambie (un plan que gana catálogo
      // gana su recuadro de catálogo sin que nadie lo escriba).
      const lista = recuadros === undefined ? null : laListaQueSeGuarda(recuadros);
      if (lista) {
        const plan = await db.subscriptionPlan.findUnique({ where: { id: subscriptionPlanId } });
        if (plan && esLaListaDeFabrica(lista, losDatosDelPlan(plan, []))) recuadros = null;
      }
      await guardarLaPagina(subscriptionPlanId, { orden: entrada.orden, recuadros });
    }

    revalidatePath("/planes");
    revalidatePath("/planes/[slug]", "page");
    revalidatePath("/inicio");
    return { success: true, message: "Detalle guardado" };
  } catch (e) {
    console.error("[upsertPlanDetail]", e);
    return { success: false, message: "Error al guardar el detalle" };
  }
}
