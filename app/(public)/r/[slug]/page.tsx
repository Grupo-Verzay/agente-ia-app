import { notFound } from "next/navigation";
import { getResellerPlansBySlug } from "@/actions/reseller-plan-actions";
import { getSiteConfig } from "@/actions/admin/site-config-actions";
import { ResellerLandingClient } from "./_components/ResellerLandingClient";

export const dynamic = "force-dynamic";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props) {
  const [{ businessName, faviconUrl }, siteConfig] = await Promise.all([
    getResellerPlansBySlug(params.slug),
    getSiteConfig(),
  ]);
  // Favicon del reseller; si no tiene, el de la plataforma (SiteConfig); si no, el default.
  const favicon = faviconUrl?.trim() || siteConfig.faviconUrl?.trim() || "/favicon.ico";
  // PWA con la marca del reseller resuelta por el slug de la landing.
  return {
    title: businessName ? `${businessName} — Planes` : "Planes",
    icons: {
      icon: favicon,
      apple: `/api/brand-icon?size=180&r=${encodeURIComponent(params.slug)}`,
    },
    manifest: `/manifest.webmanifest?r=${encodeURIComponent(params.slug)}`,
    appleWebApp: { capable: true, statusBarStyle: "default", title: businessName || "Verzay" },
  };
}

export default async function ResellerLandingPage({ params }: Props) {
  const result = await getResellerPlansBySlug(params.slug);
  if (!result.success) notFound();

  return (
    <ResellerLandingClient
      plans={result.plans}
      businessName={result.businessName}
      slug={params.slug}
      whatsappNumber={result.whatsappNumber}
      meetingUrl={result.meetingUrl}
      primaryColor={result.primaryColor}
      bgColor={result.bgColor}
      headline={result.headline}
      subheadline={result.subheadline}
      logoUrl={result.logoUrl}
      instagram={result.instagram}
      facebook={result.facebook}
      videoUrl={result.videoUrl}
      ctaHeadline={result.ctaHeadline}
      ctaSubtitle={result.ctaSubtitle}
      testimonials={result.testimonials}
      stats={result.stats}
      showAssistanceIA={result.showAssistanceIA}
      showAssistanceHUMANO={result.showAssistanceHUMANO}
    />
  );
}
