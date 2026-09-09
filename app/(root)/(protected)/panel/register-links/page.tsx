import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { getRegisterLinksAction } from "@/actions/admin/get-register-links-action";
import { RegisterLinksManager } from "./_components/RegisterLinksManager";
import Header from "@/components/shared/header";
import AccessDenied from "@/app/AccessDenied";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";

const RegisterLinksPage = async () => {
  const user = await currentUser();

  // Quien manda aqui es la CUENTA, no la persona: su administrador actua por
  // ella (ver `lib/cuenta-que-manda.ts`). Con su propio rol —`user`— esta
  // pantalla le contestaba «Acceso Denegado» aunque el menu se la enseñara.
  const cuenta = user ? await cuentaQueManda(user) : null;
  if (!user || !cuenta || !isAdminLike(cuenta.role)) {
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
