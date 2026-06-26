'use server';

import { currentUser } from "@/lib/auth";
import { getEnrichedClients } from "@/actions/userClientDataActions";
import { obtenerApiKeys } from "@/actions/api-action";
import { getCountryCodes } from "@/actions/get-country-action";
import { isAdminOrReseller } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PLAN_LABELS } from "@/types/plans";
import type { ClientInterface } from "@/lib/types";
import type { ApiKey, Plan } from "@prisma/client";
import type { Country } from "@/components/custom/CountryCodeSelect";
import type { ModuleWithItems } from "@/schema/module";

export type ResellerPoolOption = {
    subscriptionPlanId: string;
    plan: Plan;
    planLabel: string;
    availableLicenses: number;
};

type ClientsPageData = {
    users: ClientInterface[];
    apikeys: ApiKey[];
    availableApikeys: ApiKey[];
    currentUserRol: string;
    countries: Country[];
    allModules: ModuleWithItems[];
    resellerPools: ResellerPoolOption[];
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
            const allIds = Array.from(new Set([
                ...oldAssignments.map(r => r.userId).filter(Boolean) as string[],
                ...newClients.map(c => c.id),
            ]));
            usersPromise = allIds.length > 0
                ? getEnrichedClients({ userIds: allIds })
                : Promise.resolve({ success: true, data: [] as ClientInterface[] });
        } else {
            // Admin/super_admin: excluir clientes asignados a resellers (solo se
            // ve la cuenta principal del reseller, no sus clientes).
            usersPromise = getEnrichedClients({ excludeResellerClients: true });
        }

        const poolsPromise = user.role === 'reseller'
            ? db.resellerLicensePool.findMany({
                where: { resellerUserId: user.id },
                include: { subscriptionPlan: true },
              })
            : Promise.resolve([] as { subscriptionPlanId: string; totalLicenses: number; usedLicenses: number; subscriptionPlan: { plan: Plan } }[]);

        //  Paralelo (evita “tildado” por awaits en cascada)
        const [resUsers, resApikeys, countries, allModules, pools] = await Promise.all([
            usersPromise,
            obtenerApiKeys(),
            getCountryCodes(),
            db.module.findMany({
                where: { showInSidebar: { not: false }, adminOnly: false },
                include: { moduleItems: { orderBy: { createdAt: 'asc' } } },
                orderBy: { order: 'asc' },
            }),
            poolsPromise,
        ]);

        const users = resUsers?.data ?? [];
        const apikeys = resApikeys?.data ?? [];

        // contar uso por apiKeyId
        const usage: Record<string, number> = {};
        for (const u of users) {
            if (u.apiKeyId) usage[u.apiKeyId] = (usage[u.apiKeyId] || 0) + 1;
        }

        const availableApikeys = apikeys.filter((k) => (usage[k.id] || 0) < 100);

        // Uso DINÁMICO por pool: clientes activos reales etiquetados con cada plan.
        const licenseUsage = user.role === 'reseller'
            ? await db.user.groupBy({
                by: ['resellerSubscriptionPlanId'],
                where: { demoResellerId: user.id, isDemo: false, resellerSubscriptionPlanId: { not: null } },
                _count: { _all: true },
            })
            : [];
        const usedByPlan = new Map<string, number>();
        for (const row of licenseUsage) {
            if (row.resellerSubscriptionPlanId) usedByPlan.set(row.resellerSubscriptionPlanId, row._count._all);
        }

        const resellerPools: ResellerPoolOption[] = pools.map(p => ({
            subscriptionPlanId: p.subscriptionPlanId,
            plan: p.subscriptionPlan.plan,
            planLabel: PLAN_LABELS[p.subscriptionPlan.plan],
            availableLicenses: p.totalLicenses - (usedByPlan.get(p.subscriptionPlanId) ?? 0),
        }));

        return {
            success: true,
            data: {
                users,
                apikeys,
                availableApikeys,
                currentUserRol: user.role,
                countries,
                allModules: allModules as ModuleWithItems[],
                resellerPools,
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
