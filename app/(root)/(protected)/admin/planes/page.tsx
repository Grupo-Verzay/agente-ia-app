import dynamic from "next/dynamic";
import { currentUser } from "@/lib/auth";
import AccessDenied from "@/app/AccessDenied";
import { mandaEnLaCasaDeVerdad } from "@/lib/mando-de-la-casa";

const PlanesMain = dynamic(
  () => import("./_components/PlanesMain").then((m) => m.PlanesMain),
  { ssr: false }
);

const PlanesAdminPage = async () => {
  const user = await currentUser();
  // La MISMA puerta que sus acciones (`lib/mando-de-la-casa.ts`).
  if (!(await mandaEnLaCasaDeVerdad(user))) return <AccessDenied />;
  return <PlanesMain />;
};

export default PlanesAdminPage;
