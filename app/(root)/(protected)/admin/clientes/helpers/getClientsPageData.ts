'use server';

import { currentUser } from "@/lib/auth";
import { getEnrichedClients } from "@/actions/userClientDataActions";
import { obtenerApiKeys } from "@/actions/api-action";
import { getCountryCodes } from "@/actions/get-country-action";
import { isAdminOrReseller } from "@/lib/rbac";
import { rolConElQueReparte } from "@/lib/gestion-de-clientes";
import { db } from "@/lib/db";
import type { ClientInterface } from "@/lib/types";
import type { ApiKey } from "@prisma/client";
import type { Country } from "@/components/custom/CountryCodeSelect";
import type { ModuleWithItems } from "@/schema/module";

type ClientsPageData = {
    users: ClientInterface[];
    apikeys: ApiKey[];
    availableApikeys: ApiKey[];
    currentUserRol: string;
    /** Con qué rol reparte roles quien mira (ver el helper de Panel › Clientes). */
    rolQueReparte: string;
    countries: Country[];
    allModules: ModuleWithItems[];
};

export async function getClientsPageData(): Promise<
    | { success: true; data: ClientsPageData }
    | { success: false; message: string }
> {
    try {
        const user = await currentUser();
        if (!user) return { success: false, message: "No autorizado." };
        if (!isAdminOrReseller(user.role)) return { success: false, message: "No autorizado." };

        const rolQueReparte = await rolConElQueReparte(user);

        const usersPromise =
            user.role === "reseller"
                ? getEnrichedClients({ resellerId: user.id })
                : getEnrichedClients();

        //  Paralelo (evita “tildado” por awaits en cascada)
        const [resUsers, resApikeys, countries, allModules] = await Promise.all([
            usersPromise,
            obtenerApiKeys(),
            getCountryCodes(),
            db.module.findMany({
                where: { showInSidebar: { not: false }, adminOnly: false },
                include: { moduleItems: { orderBy: { createdAt: 'asc' } } },
                orderBy: { order: 'asc' },
            }),
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
                rolQueReparte,
                countries,
                allModules: allModules as ModuleWithItems[],
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
