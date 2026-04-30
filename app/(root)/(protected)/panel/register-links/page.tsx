import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { getRegisterLinksAction } from "@/actions/admin/get-register-links-action";
import { RegisterLinksManager } from "./_components/RegisterLinksManager";
import Header from "@/components/shared/header";
import AccessDenied from "@/app/AccessDenied";

const RegisterLinksPage = async () => {
  const user = await currentUser();

  if (!user || !isAdminLike(user.role)) {
    return <AccessDenied />;
  }

  const result = await getRegisterLinksAction();

  if (!result.success) {
    return (
      <p className="text-sm text-destructive p-4">{result.error}</p>
    );
  }

  return (
    <>
      <Header title="Links de Registro" />
      <div className="pt-6 px-4">
        <RegisterLinksManager links={result.links} />
      </div>
    </>
  );
};

export default RegisterLinksPage;
