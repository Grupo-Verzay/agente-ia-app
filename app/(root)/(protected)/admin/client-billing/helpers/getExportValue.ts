import { fmtDateShort } from "@/actions/billing/helpers/billing-helpers";
import { ClientRow } from "@/types/billing";
import { daysLeftService } from "./daysLeftService";

export const getExportValue = (u: ClientRow, colId: string) => {
  const b = u.billing ?? null;

  switch (colId) {
    case "service":
      return b?.serviceName ?? "";
    case "notify":
      return b?.notifyRemoteJid ?? u.notificationNumber ?? "";
    case "start":
      return fmtDateShort(b?.serviceStartAt ?? null);
    case "due":
      return fmtDateShort(b?.dueDate ?? null);
    case "daysLeft": {
      const due = parseInt(daysLeftService(b?.dueDate ?? null));
      return Number.isFinite(due) ? due : "";
    }
    case "client":
      return u.name ?? "Sin nombre";
    case "price":
      return b?.price ?? "";
    case "method":
      return b?.paymentMethodLabel ?? "";
    case "paid":
      return b?.billingStatus ?? "UNPAID";
    case "access":
      return b?.accessStatus ?? "ACTIVE";
    default:
      return "";
  }
}
