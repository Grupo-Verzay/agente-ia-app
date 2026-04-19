// app/actions/billing-preview-actions.ts
"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { BillingTemplateType, ResponseFormat } from "@/types/billing";
import { buildBillingMessage } from "./billing-message-templates";
import { pickPreviewTemplate } from "./helpers/billing-helpers";
import { assertBillingScope } from "./helpers/billing-helpers.server";
import { getBillingDaysRemaining } from "./helpers/billing-lifecycle";



export async function previewBillingReminderMessage(
    userId: string
): Promise<ResponseFormat<{ text: string; template: BillingTemplateType; daysRemaining: number }>> {
    try {
        const me = await currentUser();
        const scopedUserId = await assertBillingScope(me ?? {}, userId);

        const billing = await db.userBilling.findUnique({
            where: { userId: scopedUserId },
            include: {
                user: { select: { name: true, company: true, plan: true } },
            },
        });

        if (!billing?.dueDate) {
            return { success: false, message: "Cliente sin dueDate configurado." };
        }

        const due = new Date(billing.dueDate);
        const daysRemaining = getBillingDaysRemaining(due, new Date());
        if (daysRemaining === null) {
            return { success: false, message: "No fue posible calcular los dias restantes." };
        }

        const paymentText =
            (billing.paymentNotes?.trim() ||
                billing.paymentMethodLabel?.trim() ||
                "").trim() || "—";

        const template = pickPreviewTemplate(daysRemaining);

        // Por ahora igual que el job: fijo (luego lo hacemos dinámico por plan)
        const planLabel = `*${billing.serviceName}*` ? `${billing.serviceName}` : `Agente IA`;
        const licenseLabel = `*Licencia* ${billing.licenseDays ?? 30} días`;
        const currencyFlag = billing.currencyCode === "USD" ? "🇺🇸" : null;

        const text = buildBillingMessage({
            type: template,
            dueDate: due,
            daysRemaining,
            planLabel,
            licenseLabel,
            price: billing.price,
            currencyCode: billing.currencyCode || "COP",
            currencyFlag,
            paymentLinkOrText: paymentText,
            companyName: billing.user.company || billing.user.name || "Cliente",
        });

        return {
            success: true,
            message: "Vista previa generada.",
            data: { text, template, daysRemaining },
        };
    } catch (e: any) {
        console.error("[previewBillingReminderMessage]", e);
        return { success: false, message: e?.message ?? "Error generando vista previa." };
    }
}
