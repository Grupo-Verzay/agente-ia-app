import { safeDate } from "@/actions/billing/helpers/billing-helpers";
import { differenceInCalendarDays } from "date-fns";

export function daysLeftService(serviceEndsAt?: string | Date | null) {
    const dd = safeDate(serviceEndsAt);
    if (!dd) return "—";
    return String(differenceInCalendarDays(dd, new Date()));
}