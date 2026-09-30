import { currentUser } from '@/lib/auth';
import AccessDenied from '@/app/AccessDenied';
import { correoParaCompartirLaHoja, getMyForms } from '@/actions/forms-actions';
import { MisFormulariosClient } from './_components/MisFormulariosClient';

/**
 * Mis formularios. Pedía `isAdminOrReseller`, o sea el rol de la PERSONA, y la
 * pantalla está en el menú de los CLIENTES (Apps Externas): un cliente con el
 * módulo concedido abría «Acceso denegado». Quién llega lo decide el módulo
 * —el menú y el guardián del layout—, y lo que se ve lo decide la acción, que
 * acota por la cuenta.
 */
export default async function MisFormulariosPage() {
  const user = await currentUser();
  if (!user) return <AccessDenied />;

  const [result, correoDeLaHoja] = await Promise.all([getMyForms(), correoParaCompartirLaHoja()]);

  return (
    <MisFormulariosClient
      initialForms={result.success ? (result.forms ?? []) : []}
      correoDeLaHoja={correoDeLaHoja}
    />
  );
}
