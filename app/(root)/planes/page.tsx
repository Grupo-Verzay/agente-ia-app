import { getActiveSubscriptionPlans } from "@/actions/subscription-plan-actions";
import { getActivePaymentMethodConfigs } from "@/actions/payment-method-config-actions";
import { PlanesClient } from "./_components/PlanesClient";

export default async function PlanesPage() {
  const [plansRes, paymentRes] = await Promise.all([
    getActiveSubscriptionPlans(),
    getActivePaymentMethodConfigs(),
  ]);

  return (
    <PlanesClient
      plans={plansRes.data}
      paymentMethods={paymentRes.data}
    />
  );
}
