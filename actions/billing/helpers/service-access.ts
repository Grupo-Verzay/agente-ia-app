import { differenceInCalendarDays } from "date-fns";

type BillingLike = {
  billingStatus?: "PAID" | "UNPAID" | null;
  accessStatus?: "ACTIVE" | "SUSPENDED" | null;
  dueDate?: Date | string | null;
  graceDays?: number | null;
  price?: { toString(): string } | string | number | null;
  currencyCode?: string | null;
  paymentMethodLabel?: string | null;
  paymentNotes?: string | null;
  serviceName?: string | null;
};

export type BillingServiceAccessState = {
  isLocked: boolean;
  shouldDisableAgent: boolean;
  daysRemaining: number | null;
  graceDays: number;
  reason:
    | "ACTIVE"
    | "SUSPENDED_STATUS"
    | "OVERDUE_BEYOND_GRACE"
    | "NO_DUE_DATE"
    | "NO_BILLING";
  dueDateIso: string | null;
  amountDue: string | null;
  currencyCode: string;
  paymentMethodLabel: string | null;
  paymentNotes: string | null;
  paymentUrl: string | null;
  serviceName: string | null;
};

function toDateSafe(value?: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function tryExtractUrl(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s)]+/i);
  return match?.[0] ?? null;
}

export function buildBillingServiceAccessState(
  billing?: BillingLike | null,
  now = new Date()
): BillingServiceAccessState {
  if (!billing) {
    return {
      isLocked: false,
      shouldDisableAgent: false,
      daysRemaining: null,
      graceDays: 0,
      reason: "NO_BILLING",
      dueDateIso: null,
      amountDue: null,
      currencyCode: "COP",
      paymentMethodLabel: null,
      paymentNotes: null,
      paymentUrl: null,
      serviceName: null,
    };
  }

  const dueDate = toDateSafe(billing.dueDate);
  const graceDays = Number.isFinite(Number(billing.graceDays))
    ? Math.max(0, Number(billing.graceDays))
    : 0;
  const daysRemaining = dueDate ? differenceInCalendarDays(dueDate, now) : null;
  const billingStatus = billing.billingStatus ?? "UNPAID";
  const accessStatus = billing.accessStatus ?? "ACTIVE";

  const overdueBeyondGrace =
    daysRemaining !== null &&
    daysRemaining < -graceDays;

  const suspendedByStatus = accessStatus === "SUSPENDED";
  const isLocked = suspendedByStatus || overdueBeyondGrace;

  const reason: BillingServiceAccessState["reason"] = suspendedByStatus
    ? "SUSPENDED_STATUS"
    : overdueBeyondGrace
      ? "OVERDUE_BEYOND_GRACE"
      : dueDate
        ? "ACTIVE"
        : "NO_DUE_DATE";

  return {
    isLocked,
    shouldDisableAgent: isLocked,
    daysRemaining,
    graceDays,
    reason,
    dueDateIso: dueDate ? dueDate.toISOString() : null,
    amountDue: billing.price !== null && billing.price !== undefined ? String(billing.price) : null,
    currencyCode: billing.currencyCode ?? "COP",
    paymentMethodLabel: billing.paymentMethodLabel?.trim() || null,
    paymentNotes: billing.paymentNotes?.trim() || null,
    paymentUrl: tryExtractUrl(billing.paymentNotes ?? billing.paymentMethodLabel),
    serviceName: billing.serviceName?.trim() || null,
  };
}
