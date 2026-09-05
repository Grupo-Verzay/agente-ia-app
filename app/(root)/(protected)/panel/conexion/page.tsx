'use server'

import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { obtenerApiKeys } from "@/actions/api-action";
import { obtenerServidorWaha } from "@/actions/admin/waha-server-actions";
import { MainConnection } from "./_components";
import AccessDenied from "@/app/AccessDenied";

interface Props {
  searchParams: { [key: string]: string | undefined }
}

const ConnectionPage = async ({ searchParams }: Props) => {
  const user = await currentUser();

  if (!user || !isAdminLike(user.role)) {
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