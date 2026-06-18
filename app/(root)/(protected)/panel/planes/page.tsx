import { Suspense } from "react";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { PlanesMain } from "../../admin/planes/_components/PlanesMain";

const PlanesPage = async () => {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) return <AccessDenied />;
  return (
    <Suspense>
      <PlanesMain />
    </Suspense>
  );
};

export default PlanesPage;
