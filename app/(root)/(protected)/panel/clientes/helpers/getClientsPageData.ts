'use server';

import { currentUser } from "@/lib/auth";
import { getEnrichedClients } from "@/actions/userClientDataActions";
import { obtenerApiKeys } from "@/actions/api-action";
import { getCountryCodes } from "@/actions/get-country-action";
import { isAdminOrReseller } from "@/lib/rbac";
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

        let usersPromise;
        if (user.role === "reseller") {
            // Combinar sistema viejo (reseller table) y nuevo (demoResellerId)
            const [oldAssignments, newClients] = await Promise.all([
                db.reseller.findMany({ where: { resellerid: user.id }, select: { userId: true } }),
                db.user.findMany({ where: { demoResellerId: user.id, isDemo: false }, select: { id: true } }),
            ]);
            const allIds = [...new Set([
                ...oldAssignments.map(r => r.userId).filter(Boolean) as string[],
                ...newClients.map(c => c.id),
            ])];
            usersPromise = allIds.length > 0
                ? getEnrichedClients({ userIds: allIds })
                : Promise.resolve({ success: true, data: [] as ClientInterface[] });
        } else {
            usersPromise = getEnrichedClients();
        }

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
