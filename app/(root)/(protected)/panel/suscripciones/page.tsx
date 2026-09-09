import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { SuscripcionesMain } from "../../admin/suscripciones/_components/SuscripcionesMain";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";

const SuscripcionesPage = async () => {
  const user = await currentUser();
  // Quien manda aqui es la CUENTA, no la persona: su administrador actua por
  // ella (ver `lib/cuenta-que-manda.ts`). Con su propio rol —`user`— esta
  // pantalla le contestaba «Acceso Denegado» aunque el menu se la enseñara.
  const cuenta = user ? await cuentaQueManda(user) : null;
  if (!user || !cuenta || !isAdminLike(cuenta.role)) return <AccessDenied />;
  return <SuscripcionesMain />;
};

export default SuscripcionesPage;
