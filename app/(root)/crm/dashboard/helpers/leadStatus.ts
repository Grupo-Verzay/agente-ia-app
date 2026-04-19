import type { LeadStatus } from "@/types/session";

export const LEAD_STATUS_FILTER_OPTIONS: Array<{
  value: LeadStatus;
  label: string;
}> = [
  { value: "FRIO", label: "Frio" },
  { value: "TIBIO", label: "Tibio" },
  { value: "CALIENTE", label: "Caliente" },
  { value: "FINALIZADO", label: "Finalizado" },
  { value: "DESCARTADO", label: "Descartado" },
];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  FRIO: "Frio",
  TIBIO: "Tibio",
  CALIENTE: "Caliente",
  FINALIZADO: "Finalizado",
  DESCARTADO: "Descartado",
};

export const LEAD_STATUS_BADGE_CLASSNAMES: Record<LeadStatus, string> = {
  FRIO: "border-blue-200 bg-blue-50 text-blue-700",
  TIBIO: "border-amber-200 bg-amber-50 text-amber-800",
  CALIENTE: "border-red-200 bg-red-50 text-red-700",
  FINALIZADO: "border-emerald-200 bg-emerald-50 text-emerald-700",
  DESCARTADO: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

export const LEAD_STATUS_DOT_CLASSNAMES: Record<LeadStatus, string> = {
  FRIO: "bg-blue-500",
  TIBIO: "bg-amber-500",
  CALIENTE: "bg-red-500",
  FINALIZADO: "bg-emerald-500",
  DESCARTADO: "bg-zinc-500",
};

export function getLeadStatusLabel(status?: LeadStatus | null) {
  if (!status) return "Sin clasificar";
  return LEAD_STATUS_LABELS[status];
}
