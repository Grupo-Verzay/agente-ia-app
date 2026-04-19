// app/actions/billing-message-templates.ts

import { AccessStatus, BillingStatus, BillingTemplateType } from "@/types/billing";
import { fmtDateDDMMYYYY, fmtPriceLine } from "./helpers/billing-helpers";

export function buildBillingMessage(args: {
    type: BillingTemplateType;
    dueDate?: Date | null;
    daysRemaining?: number | null;
    planLabel: string;
    licenseLabel: string;
    price: any;
    currencyCode: string;
    currencyFlag?: string | null;
    paymentLinkOrText: string;
    companyName?: string | null;
    billingStatus?: BillingStatus | null;
    accessStatus?: AccessStatus | null;
}) {
    const {
        type,
        dueDate,
        daysRemaining,
        planLabel,
        licenseLabel,
        price,
        currencyCode,
        currencyFlag,
        paymentLinkOrText,
        companyName,
        billingStatus,
        accessStatus,
    } = args;

    const dueDateLine = dueDate ? `📆 *Vence:* ${fmtDateDDMMYYYY(dueDate)}` : "📆 *Vence:* Sin fecha";
    const daysRemainingLine =
        typeof daysRemaining === "number"
            ? daysRemaining < 0
                ? `⚠️ *Dias de vencido:* ${Math.abs(daysRemaining)}`
                : daysRemaining === 0
                    ? `⏳ *Vence:* Hoy`
                    : `⏳ *Dias restantes:* ${daysRemaining}`
            : "⏳ *Dias restantes:* Sin calcular";

    if (type === "STATUS_ACTIVE") {
        return [
            `✅ *Estado de su servicio actualizado*`,
            // `${companyName || "Cliente"}, su servicio se encuentra activo.`,
            `--------•--------•--------•--------`,
            dueDateLine,
            daysRemainingLine,
            `--------•--------•--------•--------`,
            `🛠️ ${planLabel}`,
            `🗓️ ${licenseLabel}`,
            `💵 ${fmtPriceLine({ price, currencyCode, currencyFlag })}`,
            // `📌 *Billing:* ${billingStatus ?? "PAID"}`,
            // `📌 *Acceso:* ${accessStatus ?? "ACTIVE"}`,
            `--------•--------•--------•--------`,
            `Gracias por su pago, ${companyName}, su servicio se encuentra activo.`,
        ].join("\n");
    }

    if (type === "STATUS_PENDING") {
        return [
            `🟡 *Estado de su servicio actualizado*`,
            // `${companyName || "Cliente"}, su servicio sigue activo pero el pago figura pendiente.`,
            `--------•--------•--------•--------`,
            dueDateLine,
            daysRemainingLine,
            `--------•--------•--------•--------`,
            `🛠️ ${planLabel}`,
            `🗓️ ${licenseLabel}`,
            `💵 ${fmtPriceLine({ price, currencyCode, currencyFlag })}`,
            // `📌 *Billing:* ${billingStatus ?? "UNPAID"}`,
            // `📌 *Acceso:* ${accessStatus ?? "ACTIVE"}`,
            `--------•--------•--------•--------`,
            `💱 *Medios de pago:*`,
            `${paymentLinkOrText}`,
        ].join("\n");
    }

    if (type === "STATUS_SUSPENDED") {
        return [
            `🚫 *Estado de su servicio actualizado*`,
            // `${companyName || "Cliente"}, su servicio fue suspendido por vencimiento fuera de los dias de gracia.`,
            `--------•--------•--------•--------`,
            dueDateLine,
            daysRemainingLine,
            `--------•--------•--------•--------`,
            `🛠️ ${planLabel}`,
            `🗓️ ${licenseLabel}`,
            `💵 ${fmtPriceLine({ price, currencyCode, currencyFlag })}`,
            // `📌 *Billing:* ${billingStatus ?? "UNPAID"}`,
            // `📌 *Acceso:* ${accessStatus ?? "SUSPENDED"}`,
            `--------•--------•--------•--------`,
            `💱 *Medios de pago:*`,
            `${paymentLinkOrText}`,
            `--------•--------•--------•--------`,
            `Regulariza el pago para reactivar el servicio.`,
        ].join("\n");
    }

    const overdueDays = typeof daysRemaining === "number" && daysRemaining < 0
        ? Math.abs(daysRemaining)
        : null;

    const header = type === "REMINDER_3D"
        ? `🏢 ${companyName || "Cliente"}:`
        : type === "DUE_TODAY"
            ? `🔔 *Hoy vence su servicio:*`
            : `🚫 *Su servicio esta vencido desde hace ${overdueDays ?? 0} ${overdueDays === 1 ? "dia" : "dias"}:*`;

    return [
        header,
        type === "REMINDER_3D" ? `📋 *Servicio a vencer:*` : "",
        `--------•--------•--------•--------`,
        dueDateLine,
        daysRemainingLine,
        `--------•--------•--------•--------`,
        `🛠️ ${planLabel}`,
        `🗓️ ${licenseLabel}`,
        `💵 ${fmtPriceLine({ price, currencyCode, currencyFlag })}`,
        `--------•--------•--------•--------`,
        `💱 *Medios de pago:*`,
        `${paymentLinkOrText}`,
        `--------•--------•--------•--------`,
        `Una vez realizado, enviar el soporte a este chat`,
    ]
        .filter(Boolean)
        .join("\n");
}
