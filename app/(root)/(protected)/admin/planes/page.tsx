import { Suspense } from "react";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { PlanesMain } from "./_components/PlanesMain";

const PlanesAdminPage = async () => {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) return <AccessDenied />;
  return (
    <Suspense>
      <PlanesMain />
    </Suspense>
  );
};

export default PlanesAdminPage;
