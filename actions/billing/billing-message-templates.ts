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
        // Mensaje del día del corte (al cumplirse los días de gracia: 0, 1, 2, 3, 5...).
        const overdueDays =
            typeof daysRemaining === "number" ? Math.abs(Math.min(daysRemaining, 0)) : 0;
        const planClean = planLabel.replace(/\*/g, "");
        const licenseClean = licenseLabel.replace(/\*/g, "").replace(/\bdias\b/gi, "días");
        return [
            `🏢 *${companyName || "Cliente"}:*`,
            `🚫 Tu servicio ha sido suspendido hoy`,
            `--------•--------•--------•--------`,
            dueDate ? `📅 *Vencía: ${fmtDateDDMMYYYY(dueDate)}*` : `📅 *Vencía: Sin fecha*`,
            `⚠️ Días de vencido: ${overdueDays}`,
            `--------•--------•--------•--------`,
            `🛠️ *${planClean}*`,
            `📅 ${licenseClean}`,
            `💵 ${fmtPriceLine({ price, currencyCode, currencyFlag })}`,
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

    // Ícono según la etapa: 1 día vencido = ⚠️ (advertencia), 2+ = 🔴 (alerta fuerte).
    const overdueIcon = overdueDays === 1 ? "⚠️" : "🔴";

    const header = type === "REMINDER_3D"
        ? `🏢 ${companyName || "Cliente"}:`
        : type === "DUE_TODAY"
            ? `🏢 ${companyName || "Cliente"}:\n🔔 *Hoy vence su servicio:*`
            : `🏢 ${companyName || "Cliente"}:\n${overdueIcon} *Su servicio esta vencido desde hace ${overdueDays ?? 0} ${overdueDays === 1 ? "dia" : "dias"}:*`;

    return [
        header,
        type === "REMINDER_3D" ? `⏰ *Servicio a vencer:*` : "",
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
