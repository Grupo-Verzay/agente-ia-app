export const QUICK_REPLY_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "ventas", label: "Ventas" },
  { value: "soporte", label: "Soporte" },
  { value: "cierre", label: "Cierre" },
  { value: "pago", label: "Pago" },
] as const;

export type QuickReplyCategory = (typeof QUICK_REPLY_CATEGORIES)[number]["value"];

export const DEFAULT_QUICK_REPLY_CATEGORY: QuickReplyCategory = "general";

export function normalizeQuickReplyCategory(value?: string | null): QuickReplyCategory {
  const match = QUICK_REPLY_CATEGORIES.find((category) => category.value === value);
  return match?.value ?? DEFAULT_QUICK_REPLY_CATEGORY;
}

export function getQuickReplyCategoryLabel(value?: string | null) {
  const normalized = normalizeQuickReplyCategory(value);
  return QUICK_REPLY_CATEGORIES.find((category) => category.value === normalized)?.label ?? "General";
}

const QUICK_REPLY_CATEGORY_STYLES: Record<QuickReplyCategory, string> = {
  general: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300",
  ventas: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
  soporte: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
  cierre: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  pago: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/60 dark:text-orange-300",
};

export function getQuickReplyCategoryClass(value?: string | null) {
  return QUICK_REPLY_CATEGORY_STYLES[normalizeQuickReplyCategory(value)];
}
