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
  const { success, plans, businessName } = await getResellerPlansBySlug(params.slug);
  if (!success) notFound();

  return (
    <ResellerLandingClient
      plans={plans}
      businessName={businessName}
      slug={params.slug}
    />
  );
}
