import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { SuscripcionesMain } from "./_components/SuscripcionesMain";

const SuscripcionesAdminPage = async () => {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) return <AccessDenied />;
  return <SuscripcionesMain />;
};

export default SuscripcionesAdminPage;
