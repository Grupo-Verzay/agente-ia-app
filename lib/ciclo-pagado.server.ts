import "server-only";

import { db } from "@/lib/db";
import { renovarLosCreditos } from "@/lib/renovar-creditos";
import { devolverElAcceso } from "@/lib/devolver-el-acceso.server";
import { apagarElRobotPorImpago, devolverElRobotAlPagar } from "@/lib/robot-por-facturacion";
import {
    getBillingUserRecord,
    loadBillingDispatcherForUser,
    sendBillingStateChangeMessage,
    setUserBillingWebhookEnabled,
} from "@/actions/billing/helpers/billing-notifications.server";

/**
 * Escribir un ciclo pagado, y avisar del cambio. La regla está en
 * `lib/ciclo-pagado.ts`; aquí vive **la única escritura**.
 *
 * La usan los cuatro caminos por los que se paga —Wompi, «Marcar pagado» de
 * Instancias, «Aprobar» una suscripción y la fecha que avanza en «Editar
 * pagos»—. Con la escritura copiada en cada uno es como se llegó a que uno
 * moviera el vencimiento y otro no: la tabla de `lib/ciclo-pagado.ts`.
 *
 * Sin sesión y sin puerta, a propósito: la comprueba quien llama. Por eso es
 * `server-only` y no una acción — exportada desde un fichero `'use server'`
 * sería un POST con el que cualquiera se daría por pagado.
 */

export type EstadoDeCobroAnterior = {
    billingStatus: string | null;
    accessStatus: string | null;
    dueDate: Date | null;
};

export type CicloPagado = {
    /** Cómo estaba ANTES, para decidir qué se avisa. */
    antes: EstadoDeCobroAnterior | null;
    /** Hasta cuándo queda pagado. */
    vence: Date;
};

export async function darElCicloPorPagado(
    userId: string,
    args: {
        vence: Date;
        /** Crear la fila de créditos si no existe: solo al activar un plan. */
        crearCreditosSiFaltan?: boolean;
        ahora?: Date;
    },
): Promise<CicloPagado> {
    const ahora = args.ahora ?? new Date();
    const existente = await db.userBilling.findUnique({
        where: { userId },
        select: { billingStatus: true, accessStatus: true, dueDate: true, serviceStartAt: true },
    });

    // Los créditos van ANTES de la escritura del cobro y nunca revientan: un
    // fallo ahí no puede dejar sin pagar un ciclo que sí se pagó.
    await renovarLosCreditos(userId, args.vence, { crearSiFalta: args.crearCreditosSiFaltan });

    await db.userBilling.upsert({
        where: { userId },
        create: {
            userId,
            currencyCode: "COP",
            billingStatus: "PAID",
            accessStatus: "ACTIVE",
            lastPaymentAt: ahora,
            graceDays: 0,
            serviceStartAt: ahora,
            serviceEndAt: null,
            dueDate: args.vence,
            serviceEndsAt: args.vence,
        },
        update: {
            billingStatus: "PAID",
            accessStatus: "ACTIVE",
            lastPaymentAt: ahora,
            suspendedAt: null,
            suspendedReason: null,
            serviceStartAt: existente?.serviceStartAt ?? ahora,
            serviceEndAt: null,
            dueDate: args.vence,
            serviceEndsAt: args.vence,
            // El anti-spam de los recordatorios es del ciclo viejo: sin
            // borrarlo, el primer aviso del ciclo nuevo nace mudo.
            lastReminderAt: null,
            lastReminderDueDate: null,
        },
    });

    // La cuenta vuelve a estar habilitada, por el motivo que fuera. Sin esto
    // queda «Pagado / Activo» con `status` en falso: invisible en Instancias,
    // fuera de «Activos» y fuera del cobro diario.
    await devolverElAcceso(userId);

    await db.session.updateMany({
        where: { userId },
        data: { clientStatus: "ACTIVO" },
    });

    return {
        antes: existente
            ? {
                  billingStatus: existente.billingStatus ?? null,
                  accessStatus: existente.accessStatus ?? null,
                  dueDate: existente.dueDate ?? null,
              }
            : null,
        vence: args.vence,
    };
}

export type AvisoDeCambio = {
    billing: Awaited<ReturnType<typeof getBillingUserRecord>>;
    changed: boolean;
    notificationSent: boolean;
    notificationFailed: boolean;
    webhookFailed: boolean;
};

/**
 * Lo que pasa cuando el estado de cobro CAMBIA: el webhook encendido, el
 * mensaje al cliente y el Robot apagado o devuelto.
 *
 * Una sola versión para los caminos manuales y los de la pasarela. Eran dos
 * copias casi iguales, y la manual elegía la línea de Verzay para avisar
 * también a un cliente de un reseller, que por regla solo puede recibirlo por
 * la línea de SU reseller (`loadBillingDispatcherForUser`).
 */
export async function avisarDelCambioDeCobro(args: {
    userId: string;
    previousBillingStatus?: string | null;
    previousAccessStatus?: string | null;
    source: string;
}): Promise<AvisoDeCambio> {
    const updated = await getBillingUserRecord(args.userId);
    const nada: AvisoDeCambio = {
        billing: updated,
        changed: false,
        notificationSent: false,
        notificationFailed: false,
        webhookFailed: false,
    };
    if (!updated) return nada;

    const changed =
        updated.billingStatus !== (args.previousBillingStatus ?? null) ||
        updated.accessStatus !== (args.previousAccessStatus ?? null);
    if (!changed) return nada;

    const dispatcher = await loadBillingDispatcherForUser(updated.userId);
    // El webhook va SIEMPRE encendido: es lo que trae los avisos en vivo y lo
    // que guarda el historial. Lo que calla al agente es el Robot.
    const webhookResult = await setUserBillingWebhookEnabled({ userId: updated.userId, enable: true });
    const notificationResult = await sendBillingStateChangeMessage({
        billing: updated,
        dispatcher,
        source: args.source,
    });

    if (!webhookResult.success && !webhookResult.skipped) {
        console.warn("[billing:webhook]", args.source, webhookResult);
    }
    if (!notificationResult.success) {
        console.warn("[billing:notification]", args.source, notificationResult);
    }

    if (args.previousAccessStatus !== "SUSPENDED" && updated.accessStatus === "SUSPENDED") {
        await apagarElRobotPorImpago(updated.userId);
    }
    if (args.previousAccessStatus === "SUSPENDED" && updated.accessStatus === "ACTIVE") {
        await devolverElRobotAlPagar(updated.userId);
    }

    return {
        billing: updated,
        changed: true,
        notificationSent: notificationResult.success,
        notificationFailed: !notificationResult.success,
        webhookFailed: !webhookResult.success && !webhookResult.skipped,
    };
}
