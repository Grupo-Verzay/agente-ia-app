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
  FRIO: "border-blue-300 bg-blue-100 text-blue-800",
  TIBIO: "border-amber-300 bg-amber-100 text-amber-800",
  CALIENTE: "border-red-300 bg-red-100 text-red-800",
  FINALIZADO: "border-emerald-300 bg-emerald-100 text-emerald-800",
  DESCARTADO: "border-zinc-300 bg-zinc-200 text-zinc-700",
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
