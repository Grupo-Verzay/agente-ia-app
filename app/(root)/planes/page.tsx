import { getActiveSubscriptionPlans } from "@/actions/subscription-plan-actions";
import { getActivePaymentMethodConfigs } from "@/actions/payment-method-config-actions";
import { getSiteConfig } from "@/actions/admin/site-config-actions";
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

  // Visibilidad de tipos de asistencia: misma cascada que la landing
  // (reseller del usuario → SiteConfig → default true). Sin esto, /planes
  // mostraba pestañas de asistencia deshabilitadas en "Sección de planes".
  let showAssistanceIA = true;
  let showAssistanceHUMANO = true;

  if (user) {
    const [activeSub, dbUser] = await Promise.all([
      db.userSubscription.findFirst({
        where: { userId: user.id, status: "ACTIVE" },
        include: { subscriptionPlan: { select: { assistanceType: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.user.findUnique({ where: { id: user.id }, select: { demoResellerId: true } }),
    ]);
    if (activeSub?.subscriptionPlan?.assistanceType) {
      defaultAssistanceType = activeSub.subscriptionPlan.assistanceType as "IA" | "HUMANO";
      showToggle = false; // tiene suscripción activa — se oculta el toggle
    }

    const targetResellerId = dbUser?.demoResellerId ?? user.id;
    const reseller = await db.reseller.findFirst({
      where: { resellerid: targetResellerId },
      select: { showAssistanceIA: true, showAssistanceHUMANO: true },
    });
    if (reseller) {
      showAssistanceIA = reseller.showAssistanceIA;
      showAssistanceHUMANO = reseller.showAssistanceHUMANO;
    } else {
      const site = await getSiteConfig();
      showAssistanceIA = site.showAssistanceIA ?? true;
      showAssistanceHUMANO = site.showAssistanceHUMANO ?? true;
    }
  }

  return (
    <PlanesClient
      plans={plansRes.data}
      paymentMethods={paymentRes.data}
      defaultPlan={searchParams.plan}
      defaultAssistanceType={defaultAssistanceType}
      showToggle={showToggle}
      showAssistanceIA={showAssistanceIA}
      showAssistanceHUMANO={showAssistanceHUMANO}
    />
  );
}
