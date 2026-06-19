import dynamic from "next/dynamic";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";

const PlanesMain = dynamic(
  () => import("./_components/PlanesMain").then((m) => m.PlanesMain),
  { ssr: false }
);

const PlanesAdminPage = async () => {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) return <AccessDenied />;
  return <PlanesMain />;
};

export default PlanesAdminPage;
