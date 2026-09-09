'use server'

import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { obtenerApiKeys } from "@/actions/api-action";
import { obtenerServidorWaha } from "@/actions/admin/waha-server-actions";
import { MainConnection } from "./_components";
import AccessDenied from "@/app/AccessDenied";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";

interface Props {
  searchParams: { [key: string]: string | undefined }
}

const ConnectionPage = async ({ searchParams }: Props) => {
  const user = await currentUser();

  // Quien manda aqui es la CUENTA, no la persona: su administrador actua por
  // ella (ver `lib/cuenta-que-manda.ts`). Con su propio rol —`user`— esta
  // pantalla le contestaba «Acceso Denegado» aunque el menu se la enseñara.
  const cuenta = user ? await cuentaQueManda(user) : null;
  if (!user || !cuenta || !isAdminLike(cuenta.role)) {
    return <AccessDenied />;
  };

  const [result, servidorWaha] = await Promise.all([
    obtenerApiKeys(),
    obtenerServidorWaha(),
  ]);

  if (!result.data) {
    return <h1>Error al cargar las apikey</h1>;
  }

  return (
    <>
      <MainConnection
        searchParams={searchParams}
        user={user}
        apiKeys={result.data}
        servidorWaha={servidorWaha}
      />
    </>
  );
};

export default ConnectionPage;