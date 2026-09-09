'use server'

import AccessDenied from "@/app/AccessDenied";
import { getClientsWithBilling } from "@/actions/billing/billing-page-actions";
import { BillingCrmClient } from "./ui/BillingCrmClient";

interface Props {
    searchParams: { [key: string]: string | undefined }
}

// Quién entra lo decide la cartera, no el rol: quien tiene clientes asignados
// ve los suyos. La regla vive en la consulta (`getClientsWithBilling`), que es
// la que acota las filas, para que la pantalla no pueda abrir de más.
const BillingCrmPage = async ({ searchParams }: Props) => {
    const res = await getClientsWithBilling();

    if (!res.success && res.message === "No autorizado.") {
        return <AccessDenied />;
    }


    return (
        <BillingCrmClient initial={res} />
    );
};

export default BillingCrmPage;
