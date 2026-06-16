import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { VerzayLanding } from "../../admin/landing/_components/VerzayLanding";

const LandingPanelPage = async () => {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) return <AccessDenied />;
  return <VerzayLanding />;
};

export default LandingPanelPage;
