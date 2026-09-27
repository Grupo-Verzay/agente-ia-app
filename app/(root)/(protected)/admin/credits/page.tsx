import { CreditMain } from "./_components";
import AccessDenied from "@/app/AccessDenied";
import { currentUser } from "@/lib/auth";
import { mandaEnLaCasaDeVerdad } from "@/lib/mando-de-la-casa";

interface Props {
  searchParams: {
    userId?: string;
  };
}

const CreditPage = async ({ searchParams }: Props) => {
  const user = await currentUser();

  // Los créditos de cada plan son de la plataforma: la MISMA puerta que
  // `getAllPlanConfigs` y `updatePlanConfigAction` (`lib/mando-de-la-casa.ts`).
  if (!(await mandaEnLaCasaDeVerdad(user))) {
    return <AccessDenied />;
  }

  return <CreditMain userId={searchParams.userId} />;
};

export default CreditPage;
