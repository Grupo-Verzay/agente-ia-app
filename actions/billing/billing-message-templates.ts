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

    const dueDateLine = dueDate ? `📅 *Vence:* ${fmtDateDDMMYYYY(dueDate)}` : "📅 *Vence:* Sin fecha";
    const daysRemainingLine =
        typeof daysRemaining === "number"
            ? daysRemaining < 0
                ? `⚠️ *Días de vencido:* ${Math.abs(daysRemaining)}`
                : daysRemaining === 0
                    ? `⏳ *Vence:* Hoy`
                    : `⏳ *Días restantes:* ${daysRemaining}`
            : "⏳ *Días restantes:* Sin calcular";

    if (type === "STATUS_ACTIVE") {
        return [
            `✅ *Estado de su servicio actualizado*`,
            // `${companyName || "Cliente"}, su servicio se encuentra activo.`,
            `--------•--------•--------•--------`,
            dueDateLine,
            daysRemainingLine,
            `--------•--------•--------•--------`,
            `🛠️ ${planLabel}`,
            `📅 ${licenseLabel}`,
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
            `📅 ${licenseLabel}`,
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
        // Negrillas según el patrón original: solo etiquetas (*Vencía:*, *Días de vencido:*,
        // *Plan*, *Licencia*) y la línea de estado; empresa sin negrilla.
        const overdueDays =
            typeof daysRemaining === "number" ? Math.abs(Math.min(daysRemaining, 0)) : 0;
        return [
            `🏢 ${companyName || "Cliente"}:`,
            `🚫 *Tu servicio ha sido suspendido hoy*`,
            `--------•--------•--------•--------`,
            dueDate ? `📅 *Vencía:* ${fmtDateDDMMYYYY(dueDate)}` : `📅 *Vencía:* Sin fecha`,
            `⚠️ *Días de vencido:* ${overdueDays}`,
            `--------•--------•--------•--------`,
            `🛠️ ${planLabel}`,
            `📅 ${licenseLabel}`,
            `💵 ${fmtPriceLine({ price, currencyCode, currencyFlag })}`,
            `--------•--------•--------•--------`,
            `💱 *Medios de pago:*`,
            `${paymentLinkOrText}`,
            `--------•--------•--------•--------`,
            `Regulariza el pago para reactivar el servicio.`,
        ].join("\n");
    }

    if (type === "PRE_DELETE_DISCOUNT") {
        // Aviso final (3 días antes del borrado) con 50% de descuento.
        const overdue = typeof daysRemaining === "number" ? Math.abs(Math.min(daysRemaining, 0)) : 0;
        const halfPrice = price != null && !Number.isNaN(Number(price)) ? Number(price) / 2 : null;
        const lines = [
            `🏢 ${companyName || "Cliente"}:`,
            `⚠️ *Tu cuenta se eliminará en 3 días*`,
            `--------•--------•--------•--------`,
            `Tu servicio sigue vencido. Si no reactivas, el sistema eliminará tu cuenta y *todos tus datos* en 3 días.`,
            dueDate ? `📅 *Vencía:* ${fmtDateDDMMYYYY(dueDate)}` : `📅 *Vencía:* Sin fecha`,
            `⚠️ *Días de vencido:* ${overdue}`,
            `--------•--------•--------•--------`,
            `🎁 *Reactiva ahora con 50% de descuento*`,
            `🛠️ ${planLabel}`,
        ];
        if (halfPrice != null) {
            lines.push(`💵 *Ahora:* ${fmtPriceLine({ price: halfPrice, currencyCode, currencyFlag })} (50% OFF)`);
        }
        lines.push(
            `--------•--------•--------•--------`,
            `💱 *Medios de pago:*`,
            `${paymentLinkOrText}`,
            `--------•--------•--------•--------`,
            `Aprovecha el descuento antes de perder tu información.`,
        );
        return lines.join("\n");
    }

    if (type === "ACCOUNT_DELETED") {
        return [
            `🏢 ${companyName || "Cliente"}:`,
            `🗑️ *Tu cuenta ha sido eliminada*`,
            `--------•--------•--------•--------`,
            `Tu cuenta y *todos tus datos* fueron eliminados del sistema por falta de pago tras el periodo de vencimiento.`,
            `--------•--------•--------•--------`,
            `Si deseas volver a usar el servicio, escríbenos para crear una cuenta nueva.`,
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
            ? `🏢 ${companyName || "Cliente"}:\n🔔 *Hoy vence su servicio*`
            : `🏢 ${companyName || "Cliente"}:\n${overdueIcon} *Su servicio está vencido desde hace ${overdueDays ?? 0} ${overdueDays === 1 ? "día" : "días"}*`;

    return [
        header,
        type === "REMINDER_3D" ? `⏰ *Servicio a vencer*` : "",
        `--------•--------•--------•--------`,
        dueDateLine,
        daysRemainingLine,
        `--------•--------•--------•--------`,
        `🛠️ ${planLabel}`,
        `📅 ${licenseLabel}`,
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
