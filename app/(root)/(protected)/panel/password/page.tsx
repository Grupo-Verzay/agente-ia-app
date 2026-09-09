import { ChangeUserPasswordForm } from "./ChangeUserPasswordForm";
import { ResetAllPasswords } from "./ResetAllPasswords";
import AccessDenied from "@/app/AccessDenied";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";

export default async function PasswordPage({
  searchParams,
}: {
  searchParams?: { userId?: string };
}) {
  const user = await currentUser();
  // Quien manda aqui es la CUENTA, no la persona: su administrador actua por
  // ella (ver `lib/cuenta-que-manda.ts`). Con su propio rol —`user`— esta
  // pantalla le contestaba «Acceso Denegado» aunque el menu se la enseñara.
  const cuenta = user ? await cuentaQueManda(user) : null;
  if (!user || !cuenta || !isAdminLike(cuenta.role)) {
    return <AccessDenied />;
  }

  const userId = searchParams?.userId;

  return (
    <div className="flex flex-1 w-full h-full">
      {userId ? <ChangeUserPasswordForm userId={userId} /> : <ResetAllPasswords />}
    </div>
  );
}
