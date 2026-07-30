import { db } from "@/lib/db";
import { DEFAULT_TRIAL_DAYS, resolveTrialDays } from "@/lib/trial-defaults";

/**
 * Cuántos días dura la prueba gratis de una marca.
 *
 * Estaba fija en 7 para todo el mundo. Verzay y Aizen-Bot venden distinto y
 * necesitan pruebas de distinta duración, así que cada marca guarda la suya en
 * su fila de seguimientos —la misma pantalla donde ya edita esos mensajes— y
 * aquí solo se resuelve cuál toca.
 *
 * Sin configurar, 7 días: lo de siempre.
 */
export async function diasDePruebaDeMarca(resellerUserId: string | null): Promise<number> {
    try {
        if (resellerUserId) {
            const propia = await db.trialFollowUpConfig.findUnique({
                where: { resellerId: resellerUserId },
                select: { trialDays: true },
            });
            // Solo si ese reseller la configuró. Si no, cae a la de la
            // plataforma: heredar es mejor que inventarle una duración distinta
            // a la que ve el resto.
            if (propia?.trialDays) return resolveTrialDays(propia);
        }

        // Config central: la del super admin (Verzay). Es la misma fila que usa
        // el cron de seguimientos para los clientes directos.
        const admins = await db.user.findMany({
            where: { role: "super_admin" },
            select: { id: true },
        });
        if (!admins.length) return DEFAULT_TRIAL_DAYS;

        const central = await db.trialFollowUpConfig.findFirst({
            where: { resellerId: { in: admins.map((a) => a.id) } },
            select: { trialDays: true },
        });
        return resolveTrialDays(central);
    } catch {
        return DEFAULT_TRIAL_DAYS;
    }
}
