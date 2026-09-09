'use server';

import { currentUser } from "@/lib/auth";
import { getEnrichedClients } from "@/actions/userClientDataActions";
import { obtenerApiKeys } from "@/actions/api-action";
import { getCountryCodes } from "@/actions/get-country-action";
import { clientesDelAsesor } from "@/lib/clientes-del-asesor";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
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

        // Por qué cuenta se pregunta. El administrador de una cuenta actúa por
        // ella: ve sus clientes sin que se los asignen uno a uno, y con el
        // mismo criterio —si la cuenta es un reseller, los del reseller; si es
        // de la casa, los de la casa sin los de ningún reseller—.
        const cuenta = await cuentaQueManda(user);

        // Un colaborador del equipo no tiene rol de admin, pero puede tener
        // clientes asignados: entonces ve esos y solo esos. Es lo que le permite
        // entrar a arreglar una cuenta concreta sin abrirle la plataforma.
        const cartera = await clientesDelAsesor(user);
        if (cartera && cartera.length === 0) {
            return { success: false, message: "No autorizado." };
        }

        let usersPromise;
        if (cartera) {
            usersPromise = getEnrichedClients({ userIds: cartera });
        } else if (cuenta.role === "reseller") {
            // Combinar sistema viejo (reseller table) y nuevo (demoResellerId)
            const [oldAssignments, newClients] = await Promise.all([
                db.reseller.findMany({ where: { resellerid: cuenta.id }, select: { userId: true } }),
                // Sin filtrar por isDemo: las cuentas de prueba tambien son
                // suyas y tienen que verse. Quedaban fuera de esta lista, y la
                // unica pantalla que las mostraba —Mis Clientes— se dio de baja
                // y hoy solo redirige aqui: se creaban y no aparecian en ningun
                // sitio de la App. En la tabla se distinguen por su etiqueta.
                db.user.findMany({ where: { demoResellerId: cuenta.id }, select: { id: true } }),
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

        const poolsPromise = cuenta.role === 'reseller'
            ? db.resellerLicensePool.findMany({
                where: { resellerUserId: cuenta.id },
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
        const licenseUsage = cuenta.role === 'reseller'
            ? await db.user.groupBy({
                by: ['resellerSubscriptionPlanId'],
                where: { demoResellerId: cuenta.id, isDemo: false, resellerSubscriptionPlanId: { not: null } },
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
                // El rol que decide qué botones se ven es el de la CUENTA por la
                // que se actúa, no el de la persona. Un administrador se crea
                // con rol `user`, así que en el menú de cada fila solo le
                // quedaba «Ingresar»: sin Editar, sin Módulos, sin Asignar y
                // sin Eliminar, que es justo lo que se le pide que haga.
                //
                // Enseñar el botón no basta: cada acción de servidor comprueba
                // lo mismo por su cuenta (`puedeGestionarAlCliente`), así que
                // esto es la fachada de una puerta que ya está abierta, no la
                // puerta.
                currentUserRol: cuenta.role,
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
