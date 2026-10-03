import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { laPaginaDelPlan } from "@/lib/pagina-de-plan.server";
import { PlanDetailPage } from "./_components/PlanDetailPage";

/**
 * `/planes/<plan>?tipo=IA|HUMANO`: la página pública de un plan. Es PÚBLICA
 * (`middleware.ts`), así que solo enseña planes ACTIVOS de la plataforma: uno
 * apagado da 404, igual que no sale en la landing.
 *
 * Todo lo que se ve se arma en cada petición con lo que hay hoy en el panel de
 * Planes (`lib/pagina-de-plan.server.ts`), y guardar en el panel la revalida.
 */

// Lo que enseña cambia en cuanto se guarda el panel: nada de foto estática.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ tipo?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { tipo } = await searchParams;
  const pagina = await laPaginaDelPlan(slug, tipo ?? null);
  if (!pagina) return { title: "Plan no disponible", robots: { index: false } };
  return {
    title: pagina.meta.titulo,
    description: pagina.meta.descripcion,
    icons: { icon: pagina.favicon ?? "/favicon.ico" },
    openGraph: {
      title: pagina.meta.titulo,
      description: pagina.meta.descripcion,
      ...(pagina.meta.imagen ? { images: [{ url: pagina.meta.imagen }] } : {}),
    },
  };
}

export default async function PlanSlugPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { tipo } = await searchParams;
  const pagina = await laPaginaDelPlan(slug, tipo ?? null);
  if (!pagina) notFound();
  return <PlanDetailPage pagina={pagina} />;
}
