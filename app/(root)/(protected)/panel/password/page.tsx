import { ChangeUserPasswordForm } from "./ChangeUserPasswordForm";
import { ResetAllPasswords } from "./ResetAllPasswords";
import AccessDenied from "@/app/AccessDenied";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";

export default async function PasswordPage({
  searchParams,
}: {
  searchParams?: { userId?: string };
}) {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) {
    return <AccessDenied />;
  }

  const userId = searchParams?.userId;

  return (
    <div className="flex flex-1 w-full h-full">
      {userId ? <ChangeUserPasswordForm userId={userId} /> : <ResetAllPasswords />}
    </div>
  );
}
