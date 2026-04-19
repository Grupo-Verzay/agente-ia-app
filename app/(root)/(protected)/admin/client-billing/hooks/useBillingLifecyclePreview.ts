import { useMemo } from "react";

import { evaluateBillingLifecycle } from "@/actions/billing/helpers/billing-lifecycle";
import { toDate } from "@/actions/billing/helpers/billing-helpers";

export function useBillingLifecyclePreview(
    dueDate?: string | null,
    graceDays?: string | number | null
) {
    return useMemo(() => {
        const parsedDueDate = toDate(dueDate ?? null);
        const parsedGraceDays = Number.isFinite(Number(graceDays))
            ? Math.max(0, Math.trunc(Number(graceDays)))
            : 0;

        const evaluation = evaluateBillingLifecycle({
            dueDate: parsedDueDate,
            graceDays: parsedGraceDays,
            billingStatus: "PAID",
            accessStatus: "ACTIVE",
            lastReminderAt: null,
            lastReminderDueDate: null,
        });

        if (!parsedDueDate) {
            return {
                ...evaluation,
                summary: "Sin fecha de pago configurada.",
            };
        }

        const stateLabel =
            evaluation.nextAccessStatus === "SUSPENDED"
                ? "quedara inactivo"
                : "seguira activo";
        const billingLabel =
            evaluation.nextBillingStatus === "UNPAID"
                ? "no pagado"
                : "al dia";
        const reminderLabel =
            evaluation.reminderTemplate === "REMINDER_3D"
                ? "Hoy tocaria el recordatorio de 3 dias."
                : evaluation.reminderTemplate === "DUE_TODAY"
                    ? "Hoy corresponde el mensaje del dia de vencimiento."
                    : evaluation.reminderTemplate === "EXPIRED"
                        ? "Hoy corresponde el mensaje diario de servicio vencido."
                        : null;

        const daysLabel =
            typeof evaluation.daysRemaining !== "number"
                ? "sin dias calculados"
                : evaluation.daysRemaining < 0
                    ? `${Math.abs(evaluation.daysRemaining)} ${Math.abs(evaluation.daysRemaining) === 1 ? "dia" : "dias"} de vencido`
                    : evaluation.daysRemaining === 1
                        ? "1 dia"
                        : `${evaluation.daysRemaining} dias`;

        return {
            ...evaluation,
            summary: `Con ${daysLabel}, el cliente ${stateLabel} y quedara ${billingLabel}.${reminderLabel ? ` ${reminderLabel}` : ""}`,
        };
    }, [dueDate, graceDays]);
}
