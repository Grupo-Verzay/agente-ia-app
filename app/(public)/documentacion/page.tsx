import type { Metadata } from "next";
import { DocumentacionClient } from "./_components";
import { getSiteConfig } from "@/actions/admin/site-config-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getSiteConfig();
  const favicon = config.faviconUrl?.trim() || "/favicon.ico";
  return {
    title: "Documentación — Conecta el API oficial de Meta (WhatsApp, Facebook e Instagram)",
    description:
      "Guía paso a paso para obtener tus credenciales oficiales de Meta y conectar WhatsApp Cloud API, Messenger e Instagram DM al Agente IA de Verzay.",
    icons: { icon: favicon },
    keywords: [
      "whatsapp cloud api", "credenciales meta", "conectar whatsapp api oficial",
      "phone number id", "waba id", "webhook meta", "messenger api", "instagram dm api",
    ],
    openGraph: {
      type: "website",
      locale: "es_CO",
      url: "https://agente.ia-app.com/documentacion",
      siteName: "Agente IA",
      title: "Documentación — Conecta el API oficial de Meta",
      description:
        "Guía paso a paso para obtener tus credenciales de Meta y conectar WhatsApp, Facebook e Instagram al Agente IA de Verzay.",
    },
    robots: { index: true, follow: true },
  };
}

export default async function DocumentacionPage() {
  const config = await getSiteConfig();
  return (
    <DocumentacionClient
      whatsappNumber={config.whatsappNumber}
      logoUrl={config.logoUrl}
      instagram={config.instagram}
      facebook={config.facebook}
      primaryColor={config.primaryColor}
      meetingUrl={config.meetingUrl}
    />
  );
}
