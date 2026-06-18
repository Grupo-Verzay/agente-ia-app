import type { Metadata } from "next";
import { ResellerLandingClient } from "./_components/ResellerLandingClient";
import { getSiteConfig } from "@/actions/admin/site-config-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conviértete en Reseller de Agente IA — Programa White Label",
  description:
    "Ofrece Agente IA con tu propia marca. Vende la plataforma de automatización de WhatsApp más completa y genera ingresos recurrentes con tu propio negocio de IA.",
  keywords: [
    "reseller agente ia", "white label whatsapp ia", "revender chatbot whatsapp",
    "programa de resellers ia", "negocio de inteligencia artificial", "vender ia whatsapp",
  ],
  openGraph: {
    type: "website",
    locale: "es_CO",
    url: "https://agente.ia-app.com/resellers",
    siteName: "Agente IA",
    title: "Conviértete en Reseller de Agente IA",
    description:
      "Ofrece la plataforma con tu propia marca y genera ingresos recurrentes. Sin límite de clientes. Soporte dedicado.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Conviértete en Reseller de Agente IA",
    description:
      "Ofrece la plataforma con tu propia marca y genera ingresos recurrentes.",
  },
  robots: { index: true, follow: true },
};

export default async function ResellersPage() {
  const config = await getSiteConfig();
  return (
    <ResellerLandingClient
      whatsappNumber={config.whatsappNumber}
      logoUrl={config.logoUrl}
      instagram={config.instagram}
      facebook={config.facebook}
      ctaHeadline={config.ctaHeadline}
      ctaSubtitle={config.ctaSubtitle}
      testimonials={config.testimonials}
      stats={config.stats}
    />
  );
}
