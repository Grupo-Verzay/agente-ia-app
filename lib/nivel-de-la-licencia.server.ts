import "server-only";

import { db } from "@/lib/db";
import { elNivelDeLaLicencia, type LicenciaDeReseller } from "@/lib/nivel-de-la-licencia";

/**
 * Lee de la base lo que `elNivelDeLaLicencia` necesita y contesta: el nivel que
 * le da su licencia de reseller a esta cuenta, o `null` si no consume ninguna.
 *
 * La usan TODOS los sitios que guardan el nivel de una cuenta que puede ser
 * cliente de un reseller —editar la ficha, elegir un plan para pagar, aprobar
 * una suscripción—. Con la condición escrita en cada uno, el quinto se olvida.
 */
export async function elNivelDeSuLicencia(userId: string): Promise<string | null> {
    const cliente = await db.user.findUnique({
        where: { id: userId },
        select: { isDemo: true, demoResellerId: true, resellerSubscriptionPlanId: true },
    });
    if (!cliente?.demoResellerId || !cliente.resellerSubscriptionPlanId || cliente.isDemo) return null;

    const licencia = await db.resellerLicensePool.findUnique({
        where: {
            resellerUserId_subscriptionPlanId: {
                resellerUserId: cliente.demoResellerId,
                subscriptionPlanId: cliente.resellerSubscriptionPlanId,
            },
        },
        select: { resellerUserId: true, subscriptionPlanId: true, subscriptionPlan: { select: { plan: true } } },
    });
    const licencias: LicenciaDeReseller[] = licencia
        ? [{ resellerUserId: licencia.resellerUserId, subscriptionPlanId: licencia.subscriptionPlanId, plan: licencia.subscriptionPlan.plan }]
        : [];
    return elNivelDeLaLicencia(cliente, licencias);
}

/**
 * El nivel de licencia de MUCHAS cuentas de una vez, para la lista de Clientes:
 * una consulta de licencias para todas, no una por fila.
 */
export async function losNivelesDeSusLicencias(
    clientes: { id: string; isDemo: boolean | null; demoResellerId: string | null; resellerSubscriptionPlanId: string | null }[],
): Promise<Map<string, string>> {
    const conLicencia = clientes.filter((c) => !c.isDemo && c.demoResellerId && c.resellerSubscriptionPlanId);
    const niveles = new Map<string, string>();
    if (conLicencia.length === 0) return niveles;

    const filas = await db.resellerLicensePool.findMany({
        where: {
            resellerUserId: { in: Array.from(new Set(conLicencia.map((c) => c.demoResellerId as string))) },
            subscriptionPlanId: { in: Array.from(new Set(conLicencia.map((c) => c.resellerSubscriptionPlanId as string))) },
        },
        select: { resellerUserId: true, subscriptionPlanId: true, subscriptionPlan: { select: { plan: true } } },
    });
    const licencias: LicenciaDeReseller[] = filas.map((f) => ({
        resellerUserId: f.resellerUserId,
        subscriptionPlanId: f.subscriptionPlanId,
        plan: f.subscriptionPlan.plan,
    }));
    for (const c of conLicencia) {
        const nivel = elNivelDeLaLicencia(c, licencias);
        if (nivel) niveles.set(c.id, nivel);
    }
    return niveles;
}
