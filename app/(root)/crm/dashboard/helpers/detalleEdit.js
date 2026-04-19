export function getDetalleRawValue(registro) {
  const resumen = typeof registro?.resumen === "string" ? registro.resumen.trim() : "";
  const detalles = typeof registro?.detalles === "string" ? registro.detalles.trim() : "";
  return resumen || detalles || "";
}

export function normalizeDetalleDraft(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function isDetalleChanged(originalRaw, draft) {
  const current = String(originalRaw ?? "").trim();
  const next = String(draft ?? "").trim();
  return current !== next;
}
