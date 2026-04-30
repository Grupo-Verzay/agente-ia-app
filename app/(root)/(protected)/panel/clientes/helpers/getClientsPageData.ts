'use server';

import { currentUser } from "@/lib/auth";
import { getEnrichedClients } from "@/actions/userClientDataActions";
import { obtenerApiKeys } from "@/actions/api-action";
import { getCountryCodes } from "@/actions/get-country-action";
import { isAdminOrReseller } from "@/lib/rbac";
import type { ClientInterface } from "@/lib/types";
import type { ApiKey } from "@prisma/client";
import type { Country } from "@/components/custom/CountryCodeSelect";

type ClientsPageData = {
    users: ClientInterface[];
    apikeys: ApiKey[];
    availableApikeys: ApiKey[];
    currentUserRol: string;
    countries: Country[];
};

export async function getClientsPageData(): Promise<
    | { success: true; data: ClientsPageData }
    | { success: false; message: string }
> {
    try {
        const user = await currentUser();
        if (!user) return { success: false, message: "No autorizado." };
        if (!isAdminOrReseller(user.role)) return { success: false, message: "No autorizado." };

        const usersPromise =
            user.role === "reseller"
                ? getEnrichedClients({ resellerId: user.id })
                : getEnrichedClients();

        //  Paralelo (evita “tildado” por awaits en cascada)
        const [resUsers, resApikeys, countries] = await Promise.all([
            usersPromise,
            obtenerApiKeys(),
            getCountryCodes(),
        ]);

        const users = resUsers?.data ?? [];
        const apikeys = resApikeys?.data ?? [];

        // contar uso por apiKeyId
        const usage: Record<string, number> = {};
        for (const u of users) {
            if (u.apiKeyId) usage[u.apiKeyId] = (usage[u.apiKeyId] || 0) + 1;
        }

        const availableApikeys = apikeys.filter((k) => (usage[k.id] || 0) < 100);

        return {
            success: true,
            data: {
                users,
                apikeys,
                availableApikeys,
                currentUserRol: user.role,
                countries,
            },
        };
    } catch (e) {
        console.error("[getClientsPageData]", e);
        return {
            success: false,
            message: "Error cargando Clientes. Recarga la página e intenta de nuevo.",
        };
    }
}
