import dynamic from "next/dynamic";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";

const PlanesMain = dynamic(
  () => import("../../admin/planes/_components/PlanesMain").then((m) => m.PlanesMain),
  { ssr: false }
);

const PlanesPage = async () => {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) return <AccessDenied />;
  return <PlanesMain />;
};

export default PlanesPage;
