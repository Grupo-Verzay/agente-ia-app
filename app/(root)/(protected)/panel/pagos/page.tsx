import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { PagosMain } from "../../admin/pagos/_components/PagosMain";

const PagosPage = async () => {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) return <AccessDenied />;
  return <PagosMain />;
};

export default PagosPage;
