import "server-only";

/**
 * Esto NO es un fichero de acciones, aunque viva en `actions/`.
 *
 * Llevaba `"use server"`, que convierte cada funcion exportada en un endpoint
 * POST al que se llega desde el navegador. Aqui eso dejaba a cualquiera con
 * una sesion **darse por pagado**: `markUserAsPaidInternal` y
 * `setUserBillingDueDateInternal` mueven el vencimiento al mes siguiente, le
 * devuelven el agente a la cuenta y le reponen los creditos. Es la puerta de
 * atras de la caja.
 *
 * Sus dos llamadores son `/api/payment/confirm` —que pide `CRON_SECRET`— y
 * `/api/payment/wompi`, que verifica la firma del evento de la pasarela.
 * Ninguno es un navegador.
 */

/**
 * Helpers internos de billing SIN autenticación de sesión.
 * Solo deben ser llamados desde rutas internas protegidas por CRON_SECRET
 * (ej: /api/payment/confirm).
 *
 * NO exponer estas funciones directamente en server actions accesibles al cliente.
 */

import { db } from "@/lib/db";
import { PaymentSource } from "@prisma/client";

// Un ciclo pagado se escribe en UN sitio para los cuatro caminos por los que se
// paga (ver `lib/ciclo-pagado.ts`). Aquí vivían `markUserAsPaidInternal` y
// `setUserBillingDueDateInternal`, que hacían cada una la mitad; «Marcar
// pagado» de Instancias tenía su propia copia de la primera y ninguna de la
// segunda, y por eso no movía el vencimiento.
import { darElCicloPorPagado, avisarDelCambioDeCobro } from "@/lib/ciclo-pagado.server";
import { elSiguienteVencimiento } from "@/lib/ciclo-pagado";
import { activarLaSuscripcionPagadaPorWompi } from "@/lib/suscripcion-activa.server";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type ConfirmPaymentInput = {
    clientUserId: string;
    amount: number;
    currencyCode: string;
    source: PaymentSource;
    externalReference: string;
    notes?: string | null;
};

export type ConfirmPaymentResult = {
    success: boolean;
    message: string;
    newDueDate?: string;
    alreadyProcessed?: boolean;
};

// ---------------------------------------------------------------------------
// createPaymentTransaction — crea el registro en FinanceTransaction
// ---------------------------------------------------------------------------

async function createPaymentTransaction(args: {
    userId: string;
    amount: number;
    currencyCode: string;
    source: PaymentSource;
    externalReference: string;
    notes?: string | null;
}) {
    // Busca cuenta por defecto del usuario; si no existe no crea la transacción
    // para no romper la constraint de accountId NOT NULL.
    const account = await db.financeAccount.findFirst({
        where: { userId: args.userId, isDefault: true },
        select: { id: true },
    });

    if (!account) {
        console.warn(
            `[billing-payment-internal] Sin cuenta por defecto para userId=${args.userId}. Transacción no registrada.`
        );
        return;
    }

    await db.financeTransaction.create({
        data: {
            userId: args.userId,
            type: "SALE",
            status: "ACTIVE",
            occurredAt: new Date(),
            amount: args.amount,
            currencyCode: args.currencyCode,
            accountId: account.id,
            title: "Pago confirmado",
            description: args.notes ?? null,
            paymentSource: args.source,
            externalReference: args.externalReference,
        },
    });
}

// ---------------------------------------------------------------------------
// Validación de monto contra el precio configurado del cliente
// ---------------------------------------------------------------------------

/**
 * Tolerancia de redondeo permitida al comparar el monto del comprobante contra
 * el precio configurado (2%). El sobrepago siempre se acepta.
 */
const RECEIPT_AMOUNT_TOLERANCE = 0.02;

/**
 * Verifica que el monto del comprobante coincida con el precio configurado del
 * cliente en /panel/client-billing. Se acepta un pago igual o mayor (con
 * tolerancia de redondeo); un pago menor o en otra moneda no renueva y se
 * envía a revisión manual.
 */
function checkReceiptAmountMatches(args: {
    paidAmount: number;
    paidCurrency: string;
    expectedAmount: number;
    expectedCurrency: string;
}): { ok: true } | { ok: false; reason: string } {
    const paidCurrency = args.paidCurrency.toUpperCase();
    const expectedCurrency = args.expectedCurrency.toUpperCase();

    // Sin precio válido configurado no hay contra qué comparar.
    if (!Number.isFinite(args.expectedAmount) || args.expectedAmount <= 0) {
        return { ok: true };
    }

    // La moneda del comprobante debe coincidir con la configurada; no
    // convertimos divisas automáticamente.
    if (paidCurrency !== expectedCurrency) {
        return {
            ok: false,
            reason: `Moneda del comprobante (${paidCurrency}) no coincide con la configurada (${expectedCurrency}). Requiere revisión manual.`,
        };
    }

    // Se acepta pago igual o mayor (con tolerancia). El pago insuficiente no
    // renueva.
    const minAcceptable = args.expectedAmount * (1 - RECEIPT_AMOUNT_TOLERANCE);
    if (args.paidAmount < minAcceptable) {
        return {
            ok: false,
            reason: `Monto del comprobante (${args.paidAmount} ${paidCurrency}) es menor al precio configurado (${args.expectedAmount} ${expectedCurrency}). Requiere revisión manual.`,
        };
    }

    return { ok: true };
}

// ---------------------------------------------------------------------------
// confirmPaymentInternal — orquesta el flujo completo
// ---------------------------------------------------------------------------

export async function confirmPaymentInternal(
    input: ConfirmPaymentInput
): Promise<ConfirmPaymentResult> {
    const { clientUserId, amount, currencyCode, source, externalReference, notes } = input;

    // 1. Deduplicación: verificar que la referencia no haya sido procesada ya
    const existing = await db.financeTransaction.findUnique({
        where: { externalReference },
        select: { id: true },
    });
    if (existing) {
        return {
            success: true,
            message: "Pago ya procesado anteriormente.",
            alreadyProcessed: true,
        };
    }

    // 2. Verificar que el cliente existe
    const billing = await db.userBilling.findUnique({
        where: { userId: clientUserId },
        select: {
            price: true,
            currencyCode: true,
            dueDate: true,
            licenseDays: true,
            billingStatus: true,
            accessStatus: true,
        },
    });

    if (!billing) {
        const userExists = await db.user.findUnique({
            where: { id: clientUserId },
            select: { id: true },
        });
        if (!userExists) {
            return { success: false, message: "Cliente no encontrado." };
        }
    }

    // 2.b. Validación de monto para TODO pago automático.
    //
    // Antes solo se validaba el comprobante de WhatsApp, dando por hecho que un
    // pago por pasarela "trae el monto exacto". Eso vale cuando el enlace lo
    // genera la App con el precio del cliente dentro, pero NO cuando el cobro
    // vive en una tienda abierta —WooCommerce— donde el comprador elige el
    // producto: ahí nada impide pagar el de menor importe y renovar igual un
    // plan caro. Sin esta comprobación, el precio de la renovación lo decide el
    // cliente.
    //
    // MANUAL se queda fuera a propósito: ahí el importe lo decide un
    // administrador, que es quien puede aceptar un pago parcial o un ajuste.
    if (source !== "MANUAL" && billing?.price != null) {
        const amountCheck = checkReceiptAmountMatches({
            paidAmount: amount,
            paidCurrency: currencyCode,
            expectedAmount: Number(billing.price),
            expectedCurrency: billing.currencyCode ?? "COP",
        });
        if (!amountCheck.ok) {
            return { success: false, message: amountCheck.reason };
        }
    }

    // 3. Hasta cuándo queda pagado: la MISMA cuenta que «Marcar pagado».
    const newDueDate = elSiguienteVencimiento(billing ?? {});

    // 3.b. Si el cliente pidió un plan en /planes y eligió Wompi, esa
    // suscripción se quedaba en «Pendiente de pago» para siempre: nadie la
    // miraba al entrar el dinero. Se activa ANTES de escribir el ciclo, porque
    // es de ella de donde sale el cupo de créditos que se repone.
    if (source === "WOMPI_WEBHOOK") {
        await activarLaSuscripcionPagadaPorWompi({
            userId: clientUserId,
            inicio: new Date(),
            vence: newDueDate,
            nota: `Wompi · ${externalReference}`,
        });
    }

    // 4. Pagado, con el vencimiento movido y los créditos repuestos.
    await darElCicloPorPagado(clientUserId, { vence: newDueDate });
    await avisarDelCambioDeCobro({
        userId: clientUserId,
        previousBillingStatus: billing?.billingStatus ?? null,
        previousAccessStatus: billing?.accessStatus ?? null,
        source: "payment-confirm-internal",
    });

    // 5. Registrar la transacción financiera
    await createPaymentTransaction({
        userId: clientUserId,
        amount,
        currencyCode,
        source,
        externalReference,
        notes,
    });

    // 6. Comisión de afiliado: si el cliente fue referido, generar comisión pendiente
    await createAffiliateCommissionIfApplies({
        referredUserId: clientUserId,
        amount,
        currencyCode,
        paymentRef: externalReference,
    }).catch(() => null);

    return {
        success: true,
        message: "Pago confirmado exitosamente.",
        newDueDate: newDueDate.toISOString(),
    };
}

// ---------------------------------------------------------------------------
// createAffiliateCommissionIfApplies — uso interno
// ---------------------------------------------------------------------------

async function createAffiliateCommissionIfApplies(args: {
    referredUserId: string;
    amount: number;
    currencyCode: string;
    paymentRef: string;
}) {
    const referral = await db.affiliateReferral.findUnique({
        where: { referredUserId: args.referredUserId },
        include: { affiliate: { select: { id: true, commissionRate: true } } },
    });
    if (!referral) return;

    const commissionAmount = Math.round(args.amount * referral.affiliate.commissionRate * 100) / 100;
    if (commissionAmount <= 0) return;

    await db.affiliateCommission.create({
        data: {
            affiliateId: referral.affiliateId,
            referralId: referral.id,
            amount: commissionAmount,
            currencyCode: args.currencyCode,
            status: "pending",
            paymentRef: args.paymentRef,
        },
    });
}
