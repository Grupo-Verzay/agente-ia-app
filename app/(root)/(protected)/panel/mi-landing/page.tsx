import { currentUser } from "@/lib/auth";
import AccessDenied from "@/app/AccessDenied";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import { MiLanding } from "./_components/MiLanding";

const MiLandingPage = async () => {
  const user = await currentUser();
  // Es de un reseller, y la cuenta manda: su administrador la lleva por el, y
  // preguntandole SU rol —`user`— esta pantalla se le cerraba.
  const cuenta = user ? await cuentaQueManda(user) : null;
  if (!user || !cuenta || cuenta.role !== "reseller") return <AccessDenied />;
  return <MiLanding />;
};

export default MiLandingPage;
