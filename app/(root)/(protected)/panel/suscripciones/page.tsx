import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { SuscripcionesMain } from "../../admin/suscripciones/_components/SuscripcionesMain";

const SuscripcionesPage = async () => {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) return <AccessDenied />;
  return <SuscripcionesMain />;
};

export default SuscripcionesPage;
