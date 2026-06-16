import { notFound } from "next/navigation";
import { getResellerPlansBySlug } from "@/actions/reseller-plan-actions";
import { ResellerLandingClient } from "./_components/ResellerLandingClient";

export const dynamic = "force-dynamic";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props) {
  const { businessName } = await getResellerPlansBySlug(params.slug);
  return {
    title: businessName ? `${businessName} — Planes` : "Planes",
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
    />
  );
}
