import "server-only";

import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { COOKIE_DE_ASISTENCIA, comoAsistencia, elegirLaAsistencia, elNivelDelSlug, type Asistencia } from "@/lib/enlaces-de-planes";

/**
 * La modalidad que el cliente eligió (IA o Humano), leída de la cookie que
 * ponen la landing, la página del plan y el middleware (`lib/enlaces-de-planes.ts`).
 * `null` si no hay o no se entiende: eso NO es «IA», es «no se sabe».
 */
export function laAsistenciaElegida(): Asistencia | null {
    try {
        return comoAsistencia(cookies().get(COOKIE_DE_ASISTENCIA)?.value);
    } catch (e) {
        console.warn("[planes] no se pudo leer la modalidad elegida; se usa la que esté a la venta", e);
        return null;
    }
}

/**
 * La modalidad con la que de verdad se vende ese nivel a esta cuenta: la
 * pedida si está activa, y si no la que lo esté (`elegirLaAsistencia`). Para
 * el cliente de un reseller mandan los planes del reseller si tiene alguno
 * activo en ese nivel; si no, los de la plataforma, que es lo mismo que hace
 * `precioDePlanParaCuenta` con el precio.
 *
 * Es lo que impide que una cookie vieja —o la falta de cookie— le ponga a una
 * cuenta la modalidad que ese nivel no vende y, con ella, un precio de cero.
 */
export async function laAsistenciaQueSeVende(
    planSlug: string | null | undefined,
    pedida: string | null | undefined,
    resellerUserId: string | null,
): Promise<Asistencia> {
    const valida = comoAsistencia(pedida);
    const plan = elNivelDelSlug(planSlug);
    if (!plan) return valida ?? "IA";
    try {
        if (resellerUserId) {
            const propios = await db.resellerPlan.findMany({
                where: { resellerUserId, plan, isActive: true },
                select: { assistanceType: true },
            });
            const suyos = new Set(propios.map((p) => comoAsistencia(p.assistanceType)).filter((t): t is Asistencia => !!t));
            if (suyos.size > 0) return elegirLaAsistencia(valida, suyos);
        }
        const dePlataforma = await db.subscriptionPlan.findMany({
            where: { plan, isResellerPlan: false, isActive: true },
            select: { assistanceType: true },
        });
        const activas = new Set(dePlataforma.map((p) => comoAsistencia(p.assistanceType)).filter((t): t is Asistencia => !!t));
        return elegirLaAsistencia(valida, activas);
    } catch (e) {
        console.error("[planes] no se pudo comprobar qué modalidad se vende; se usa la pedida", { plan, e });
        return valida ?? "IA";
    }
}
