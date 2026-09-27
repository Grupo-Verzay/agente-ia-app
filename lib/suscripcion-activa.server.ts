import "server-only";

import { SubscriptionStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { elPlanQueQueda, ESTADOS_PENDIENTES } from "@/lib/ciclo-pagado";

/**
 * Activar una suscripción de /planes. **Una sola escritura para los dos
 * caminos**: «Aprobar» en Panel › Suscripciones y el pago que confirma Wompi.
 *
 * Activar la suscripción es solo la mitad: el cobro de la cuenta —vencimiento,
 * acceso y créditos— lo escribe `darElCicloPorPagado`, y quien llama hace las
 * dos. Esto se ocupa de la fila de la suscripción y del plan de la cuenta.
 *
 * `server-only` y sin puerta, a propósito: la comprueba quien llama.
 */

/** Las que todavía esperan algo (la lista vive en `lib/ciclo-pagado.ts`). */
export const SUSCRIPCION_PENDIENTE: SubscriptionStatus[] = [...ESTADOS_PENDIENTES];

export async function activarLaSuscripcion(args: {
    id: string;
    inicio: Date;
    vence: Date;
    aprobadoPor: string | null;
    nota?: string | null;
}) {
    const sub = await db.userSubscription.update({
        where: { id: args.id },
        data: {
            status: SubscriptionStatus.ACTIVE,
            approvedBy: args.aprobadoPor,
            approvedAt: new Date(),
            startDate: args.inicio,
            expiresAt: args.vence,
            adminNotes: args.nota ?? null,
        },
        include: { subscriptionPlan: { select: { plan: true, credits: true } } },
    });

    // El plan de la cuenta pasa a ser el de la suscripción, SALVO que sea
    // `personalizado`: ese es un acuerdo hecho a mano, y cambiárselo era la
    // mitad de cómo aprobar pisaba los créditos pactados.
    const cuenta = await db.user.findUnique({ where: { id: sub.userId }, select: { plan: true } });
    const plan = elPlanQueQueda(cuenta?.plan ?? null, sub.subscriptionPlan.plan);
    if (plan !== cuenta?.plan) {
        await db.user.update({ where: { id: sub.userId }, data: { plan } });
    }

    return sub;
}

/**
 * La suscripción que el cliente pidió pagando por Wompi, cuando el dinero entra.
 *
 * Se quedaba en «Pendiente de pago» para siempre: el aviso de Wompi renovaba la
 * cuenta y nadie miraba la suscripción. Se activa la MÁS RECIENTE que siga
 * esperando el pago por Wompi; si no hay ninguna —un pago de renovación
 * normal—, no se toca nada.
 */
export async function activarLaSuscripcionPagadaPorWompi(args: {
    userId: string;
    inicio: Date;
    vence: Date;
    nota: string;
}): Promise<string | null> {
    try {
        const pendiente = await db.userSubscription.findFirst({
            where: {
                userId: args.userId,
                status: SubscriptionStatus.PENDING_PAYMENT,
                paymentMethod: "WOMPI",
            },
            orderBy: { createdAt: "desc" },
            select: { id: true },
        });
        if (!pendiente) return null;

        await activarLaSuscripcion({
            id: pendiente.id,
            inicio: args.inicio,
            vence: args.vence,
            aprobadoPor: null,
            nota: args.nota,
        });
        console.info("[wompi] suscripcion activada con el pago", {
            userId: args.userId,
            suscripcion: pendiente.id,
        });
        return pendiente.id;
    } catch (error) {
        // El pago ya entró y la cuenta se renueva igual: un fallo aquí no puede
        // tumbar la renovación. Pero se dice, o la suscripción vuelve a
        // quedarse pendiente sin que nadie sepa por qué.
        console.error("[wompi] no se pudo activar la suscripcion pagada", {
            userId: args.userId,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
