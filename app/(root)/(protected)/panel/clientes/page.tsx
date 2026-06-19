import { redirect } from "next/navigation";
import { ClientsManager } from "./_components/clients-manager";
import { getClientsPageData } from "./helpers/getClientsPageData";
import AccessDenied from "@/app/AccessDenied";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ClientesPage({ searchParams }: { searchParams?: { search?: string } }) {
  const user = await currentUser();
  if (user?.role === "reseller") redirect("/panel/mis-clientes");

  const res = await getClientsPageData();

  if (!res.success) {
    if (res.message === "No autorizado.") return <AccessDenied />;
    return <h1>{res.message}</h1>;
  }

  const { users, apikeys, availableApikeys, currentUserRol, countries, allModules } = res.data;

  return (
    <ClientsManager
      users={users}
      apikeys={apikeys}
      availableApikeys={availableApikeys}
      currentUserRol={currentUserRol}
      countries={countries}
      allModules={allModules}
      initialSearch={searchParams?.search}
    />
  );
}
