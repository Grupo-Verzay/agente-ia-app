import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolverLasCuentasDelCrm } from "@/lib/cuentas-del-crm";
import { MainDashboard } from "../dashboard/components/MainDashboard";

/*
 * El filtro por cuenta se resuelve AQUÍ, en el servidor, y baja como dato.
 *
 * Las cinco pantallas del CRM son la misma (`MainDashboard`) con otra vista
 * abierta, así que las cinco leen su `?cuentas=` igual. Y lo resuelve
 * `resolverLasCuentasDelCrm`, que es la misma puerta por la que pasan las
 * acciones: esconder el filtro no cierra la petición directa, y dos formas de
 * decidir «qué cuentas alcanza esta pantalla» son una que se afina y otra que
 * se queda atrás.
 *
 * Sin parámetro se devuelven TODAS las de la familia, que es la diferencia
 * entera con Finanzas — ver `lib/crm-de-la-familia.ts`.
 */
const KanbanPage = async ({
    searchParams,
}: {
    searchParams?: { cuentas?: string | string[] };
}) => {
    const user = await currentUser();
    if (!user) redirect("/login");

    const cuentas = await resolverLasCuentasDelCrm(user.effectiveId, searchParams?.cuentas);

    return <MainDashboard userId={user.effectiveId} initialView="kanban" cuentas={cuentas} />;
};

export default KanbanPage;
