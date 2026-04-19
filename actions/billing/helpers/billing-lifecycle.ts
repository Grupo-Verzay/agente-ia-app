import { isSameDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import { SERVER_TIME_ZONE } from "@/lib/utils";
import {
    BillingStatus,
    AccessStatus,
    BillingTemplateType,
    SOON_DAYS_BILLING,
} from "@/types/billing";

export type BillingLifecycleLike = {
    dueDate?: Date | string | null;
    graceDays?: number | null;
    billingStatus?: BillingStatus | null;
    accessStatus?: AccessStatus | null;
    lastReminderAt?: Date | string | null;
    lastReminderDueDate?: Date | string | null;
};

export type BillingLifecycleEvaluation = {
    dueDate: Date | null;
    dueDateIso: string | null;
    daysRemaining: number | null;
    graceDays: number;
    reminderTemplate: BillingTemplateType | null;
    shouldSkipReminderToday: boolean;
    shouldDisableAgent: boolean;
    previousBillingStatus: BillingStatus | null;
    previousAccessStatus: AccessStatus | null;
    nextBillingStatus: BillingStatus | null;
    nextAccessStatus: AccessStatus | null;
    hasStateChange: boolean;
};

function toValidDate(value?: Date | string | null): Date | null {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toBillingTime(value: Date): Date {
    return toZonedTime(value, SERVER_TIME_ZONE);
}

function normalizeGraceDays(value?: number | null): number {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.trunc(parsed));
}

export function getBillingDaysRemaining(
    dueDate?: Date | string | null,
    now = new Date()
): number | null {
    const resolvedDueDate = toValidDate(dueDate);
    if (!resolvedDueDate) return null;

    const due = toBillingTime(resolvedDueDate);
    const current = toBillingTime(now);

    const dueUtcMidnight = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
    const currentUtcMidnight = Date.UTC(
        current.getFullYear(),
        current.getMonth(),
        current.getDate()
    );

    return Math.round((dueUtcMidnight - currentUtcMidnight) / 86400000);
}

export function pickBillingReminderTemplate(
    daysRemaining: number | null
): BillingTemplateType | null {
    if (daysRemaining === SOON_DAYS_BILLING) return "REMINDER_3D";
    if (daysRemaining === 0) return "DUE_TODAY";
    if (typeof daysRemaining === "number" && daysRemaining < 0) return "EXPIRED";
    return null;
}

export function shouldSkipBillingReminderToday(args: {
    now?: Date;
    dueDate?: Date | string | null;
    lastReminderAt?: Date | string | null;
    lastReminderDueDate?: Date | string | null;
}): boolean {
    const dueDate = toValidDate(args.dueDate);
    const lastReminderAt = toValidDate(args.lastReminderAt);
    const lastReminderDueDate = toValidDate(args.lastReminderDueDate);

    if (!dueDate || !lastReminderAt || !lastReminderDueDate) return false;

    const now = toBillingTime(args.now ?? new Date());
    const sentAt = toBillingTime(lastReminderAt);
    const lastDue = toBillingTime(lastReminderDueDate);
    const currentDue = toBillingTime(dueDate);

    return isSameDay(sentAt, now) && isSameDay(lastDue, currentDue);
}

export function evaluateBillingLifecycle(
    billing?: BillingLifecycleLike | null,
    now = new Date()
): BillingLifecycleEvaluation {
    const dueDate = toValidDate(billing?.dueDate);
    const previousBillingStatus = billing?.billingStatus ?? null;
    const previousAccessStatus = billing?.accessStatus ?? null;
    const graceDays = normalizeGraceDays(billing?.graceDays);
    const daysRemaining = getBillingDaysRemaining(dueDate, now);

    if (!dueDate) {
        return {
            dueDate: null,
            dueDateIso: null,
            daysRemaining: null,
            graceDays,
            reminderTemplate: null,
            shouldSkipReminderToday: false,
            shouldDisableAgent: previousAccessStatus === "SUSPENDED",
            previousBillingStatus,
            previousAccessStatus,
            nextBillingStatus: previousBillingStatus,
            nextAccessStatus: previousAccessStatus,
            hasStateChange: false,
        };
    }

    const overdueBeyondGrace =
        daysRemaining !== null && daysRemaining < -graceDays;

    const nextBillingStatus: BillingStatus = overdueBeyondGrace ? "UNPAID" : "PAID";
    const nextAccessStatus: AccessStatus = overdueBeyondGrace ? "SUSPENDED" : "ACTIVE";
    const reminderTemplate = pickBillingReminderTemplate(daysRemaining);
    const shouldSkipReminderToday = shouldSkipBillingReminderToday({
        now,
        dueDate,
        lastReminderAt: billing?.lastReminderAt,
        lastReminderDueDate: billing?.lastReminderDueDate,
    });

    return {
        dueDate,
        dueDateIso: dueDate.toISOString(),
        daysRemaining,
        graceDays,
        reminderTemplate,
        shouldSkipReminderToday,
        shouldDisableAgent: nextAccessStatus === "SUSPENDED",
        previousBillingStatus,
        previousAccessStatus,
        nextBillingStatus,
        nextAccessStatus,
        hasStateChange:
            previousBillingStatus !== nextBillingStatus ||
            previousAccessStatus !== nextAccessStatus,
    };
}
