import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { VerzayLanding } from "./_components/VerzayLanding";

const LandingAdminPage = async () => {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) return <AccessDenied />;
  return <VerzayLanding />;
};

export default LandingAdminPage;
