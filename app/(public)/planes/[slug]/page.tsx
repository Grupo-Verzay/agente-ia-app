import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPlanDetailBySlug } from "@/actions/plan-detail-actions";
import { PlanDetailPage } from "./_components/PlanDetailPage";

const PLAN_LABELS: Record<string, string> = {
  lite: "Lite", basico: "Básico", intermedio: "Intermedio",
  avanzado: "Avanzado", enterprise: "Enterprise", personalizado: "Planes mixtos",
};

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ tipo?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { tipo = "IA" } = await searchParams;
  const res = await getPlanDetailBySlug(slug, tipo);
  if (!res.success || !res.plan) return { title: "Plan | Agente IA" };

  const planName = PLAN_LABELS[res.plan.plan] ?? res.plan.plan;
  const detail = res.data;

  return {
    title: detail?.metaTitle ?? `Plan ${planName} | Agente IA`,
    description: detail?.metaDescription ?? `Todo lo que incluye el plan ${planName} de Agente IA`,
    openGraph: detail?.ogImageUrl ? { images: [{ url: detail.ogImageUrl }] } : undefined,
  };
}

export default async function PlanSlugPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { tipo = "IA" } = await searchParams;
  const res = await getPlanDetailBySlug(slug, tipo);

  if (!res.success || !res.plan) notFound();

  return (
    <PlanDetailPage
      plan={res.plan}
      detail={res.data}
      planLabel={PLAN_LABELS[res.plan.plan] ?? res.plan.plan}
    />
  );
}
