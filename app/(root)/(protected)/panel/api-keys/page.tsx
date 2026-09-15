import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import AccessDenied from "@/app/AccessDenied";
import { LlavesDeVerzay } from "./_components/LlavesDeVerzay";

/**
 * Panel › API keys. El registro de las llaves de OpenAI de Verzay.
 *
 * Quien manda aquí es la CUENTA, no la persona: su administrador actúa por ella
 * (`lib/cuenta-que-manda.ts`). Con su propio rol —`user`— esta pantalla le
 * contestaría «Acceso Denegado» aunque el menú se la enseñara, que es el fallo
 * que ya costó las veinte páginas del panel.
 *
 * La puerta de verdad la llevan las acciones (`actions/llaves-de-verzay-actions.ts`),
 * cada una por su lado: enseñar el botón no es abrir la puerta.
 */
const ApiKeysPage = async () => {
  const user = await currentUser();
  const cuenta = user ? await cuentaQueManda(user) : null;
  if (!user || !cuenta || !isAdminLike(cuenta.role)) return <AccessDenied />;
  return <LlavesDeVerzay />;
};

export default ApiKeysPage;
