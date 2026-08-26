import { MainTemplate } from "./_components";
import AccessDenied from "@/app/AccessDenied";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";

export default async function TemplatesPage() {
  const user = await currentUser();

  if (!user || !isAdminLike(user.role)) {
    return <AccessDenied />;
  };

  return (
    // <div className="flex flex-1 flex-wrap gap-4 items-center justify-center">
    //   <UnderConstruction />
    // </div>
    <MainTemplate userRole={user.role}/>
  )
}
