import { getActiveSubscriptionPlans } from "@/actions/subscription-plan-actions";
import { getActivePaymentMethodConfigs } from "@/actions/payment-method-config-actions";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PlanesClient } from "./_components/PlanesClient";

interface Props {
  searchParams: { plan?: string };
}

export default async function PlanesPage({ searchParams }: Props) {
  const user = await currentUser();

  const [plansRes, paymentRes] = await Promise.all([
    getActiveSubscriptionPlans(),
    getActivePaymentMethodConfigs(),
  ]);

  // Detectar tipo de asistencia del usuario según su suscripción activa
  let defaultAssistanceType: "IA" | "HUMANO" = "IA";
  let showToggle = true;

  if (user) {
    const activeSub = await db.userSubscription.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      include: { subscriptionPlan: { select: { assistanceType: true } } },
      orderBy: { createdAt: "desc" },
    });
    if (activeSub?.subscriptionPlan?.assistanceType) {
      defaultAssistanceType = activeSub.subscriptionPlan.assistanceType as "IA" | "HUMANO";
      showToggle = false; // tiene suscripción activa — se oculta el toggle
    }
  }

  return (
    <PlanesClient
      plans={plansRes.data}
      paymentMethods={paymentRes.data}
      defaultPlan={searchParams.plan}
      defaultAssistanceType={defaultAssistanceType}
      showToggle={showToggle}
    />
  );
}
