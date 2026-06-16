import { currentUser } from "@/lib/auth";
import AccessDenied from "@/app/AccessDenied";
import { MiLanding } from "./_components/MiLanding";

const MiLandingPage = async () => {
  const user = await currentUser();
  if (!user || user.role !== "reseller") return <AccessDenied />;
  return <MiLanding />;
};

export default MiLandingPage;
