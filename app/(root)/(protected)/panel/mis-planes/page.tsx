import { currentUser } from "@/lib/auth";
import AccessDenied from "@/app/AccessDenied";
import { MisPlanes } from "./_components/MisPlanes";

const MisPlanesPage = async () => {
  const user = await currentUser();
  if (!user || user.role !== "reseller") return <AccessDenied />;
  return <MisPlanes />;
};

export default MisPlanesPage;
