import { CreditMain } from "./_components";
import AccessDenied from "@/app/AccessDenied";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";

interface Props {
  searchParams: {
    userId?: string;
  };
}

const CreditPage = async ({ searchParams }: Props) => {
  const user = await currentUser();

  // Quien manda aqui es la CUENTA, no la persona: su administrador actua por
  // ella (ver `lib/cuenta-que-manda.ts`). Con su propio rol —`user`— esta
  // pantalla le contestaba «Acceso Denegado» aunque el menu se la enseñara.
  const cuenta = user ? await cuentaQueManda(user) : null;
  if (!user || !cuenta || !isAdminLike(cuenta.role)) {
    return <AccessDenied />;
  }

  const userId = searchParams.userId;

  if (!userId) {
    return <p className="text-red-500">Error: userId no proporcionado</p>;
  }

  return <CreditMain userId={userId} />;
};

export default CreditPage;
