import type { Metadata } from "next";
import { LandingClient } from "./_components/LandingClient";
import { getSiteConfig } from "@/actions/admin/site-config-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agente IA — Automatiza tu WhatsApp con Inteligencia Artificial",
  description:
    "Transforma WhatsApp en un sistema automático de ventas y atención al cliente. CRM integrado, reservas, seguimientos y respuestas 24/7. Listo en 5 minutos.",
  keywords: [
    "agente ia whatsapp", "automatizar whatsapp", "crm whatsapp", "chatbot whatsapp colombia",
    "respuestas automaticas whatsapp", "ventas whatsapp ia", "agente virtual whatsapp",
  ],
  openGraph: {
    type: "website",
    locale: "es_CO",
    url: "https://agente-ia.app/inicio",
    siteName: "Agente IA",
    title: "Agente IA — Automatiza tu WhatsApp con Inteligencia Artificial",
    description:
      "Transforma WhatsApp en un sistema automático de ventas y atención al cliente. CRM integrado, reservas, seguimientos y respuestas 24/7. Listo en 5 minutos.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agente IA — Automatiza tu WhatsApp con Inteligencia Artificial",
    description:
      "Transforma WhatsApp en un sistema automático de ventas y atención al cliente. CRM integrado, reservas, seguimientos y respuestas 24/7.",
  },
  robots: { index: true, follow: true },
};

export default async function InicioPage() {
  const config = await getSiteConfig();
  return (
    <LandingClient
      whatsappNumber={config.whatsappNumber}
      meetingUrl={config.meetingUrl}
      primaryColor={config.primaryColor}
      bgColor={config.bgColor}
      headline={config.headline}
      subheadline={config.subheadline}
      logoUrl={config.logoUrl}
      instagram={config.instagram}
      facebook={config.facebook}
      videoUrl={config.videoUrl}
      ctaHeadline={config.ctaHeadline}
      ctaSubtitle={config.ctaSubtitle}
      testimonials={config.testimonials}
      stats={config.stats}
      showAssistanceIA={config.showAssistanceIA}
      showAssistanceHUMANO={config.showAssistanceHUMANO}
    />
  );
}
