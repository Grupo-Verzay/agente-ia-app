import { currentUser } from "@/lib/auth";
import AccessDenied from "@/app/AccessDenied";
import { mandaEnLaCasaDeVerdad } from "@/lib/mando-de-la-casa";
import { PagosMain } from "./_components/PagosMain";

const PagosAdminPage = async () => {
  const user = await currentUser();
  // La MISMA puerta que sus acciones (`lib/mando-de-la-casa.ts`).
  if (!(await mandaEnLaCasaDeVerdad(user))) return <AccessDenied />;
  return <PagosMain />;
};

export default PagosAdminPage;
