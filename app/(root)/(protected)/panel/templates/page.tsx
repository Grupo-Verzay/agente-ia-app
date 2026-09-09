import { MainTemplate } from "./_components";
import AccessDenied from "@/app/AccessDenied";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";

export default async function TemplatesPage() {
  const user = await currentUser();

  // Quien manda aqui es la CUENTA, no la persona: su administrador actua por
  // ella (ver `lib/cuenta-que-manda.ts`). Con su propio rol —`user`— esta
  // pantalla le contestaba «Acceso Denegado» aunque el menu se la enseñara.
  const cuenta = user ? await cuentaQueManda(user) : null;
  if (!user || !cuenta || !isAdminLike(cuenta.role)) {
    return <AccessDenied />;
  };

  return (
    // <div className="flex flex-1 flex-wrap gap-4 items-center justify-center">
    //   <UnderConstruction />
    // </div>
    <MainTemplate userRole={user.role}/>
  )
}
