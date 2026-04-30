'use server'

import { currentUser } from "@/lib/auth";
import { isAdminOrReseller } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { getClientsWithBilling } from "@/actions/billing/billing-page-actions";
import { BillingCrmClient } from "./ui/BillingCrmClient";

interface Props {
    searchParams: { [key: string]: string | undefined }
}

const BillingCrmPage = async ({ searchParams }: Props) => {
    const user = await currentUser();

    if (!user || !isAdminOrReseller(user.role)) {
        return <AccessDenied />;
    };

    const res = await getClientsWithBilling();


    return (
        <BillingCrmClient initial={res} />
    );
};

export default BillingCrmPage;
