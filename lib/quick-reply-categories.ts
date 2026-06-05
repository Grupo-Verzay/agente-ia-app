export const QUICK_REPLY_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "ventas", label: "Ventas" },
  { value: "soporte", label: "Soporte" },
  { value: "seguimiento", label: "Seguimiento" },
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
