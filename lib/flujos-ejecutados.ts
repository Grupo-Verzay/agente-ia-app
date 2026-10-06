/**
 * Los flujos que se ejecutaron en una conversación (`Session.flujos`), con la
 * MISMA regla que el motor (`SessionService.registerWorkflow` en api-webhook):
 * un arreglo JSON `[{ id, name }]`, o el formato viejo de nombres por comas
 * (cada nombre hace de id). Un flujo que ya está no se repite: se le pone el
 * nombre de hoy.
 *
 * Lo usa la ejecución MANUAL de un flujo desde la conversación, para que la
 * fila de Chats enseñe el mismo icono que cuando lo ejecuta el motor o la IA.
 */
export type FlujoEjecutado = { id: string; name: string };

export function losFlujosGuardados(raw: string | null | undefined): FlujoEjecutado[] {
  const str = (raw ?? "").trim();
  if (!str || str === "-") return [];
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((f) => f && typeof f === "object" && (f.id != null || f.name != null))
        .map((f) => ({ id: String(f.id ?? f.name), name: String(f.name ?? f.id) }));
    }
  } catch {
    // formato viejo: nombres separados por comas
  }
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ id: name, name }));
}

/** Lo guardado con el flujo apuntado. `null` si no cambia nada (no hay que escribir). */
export function conElFlujo(
  raw: string | null | undefined,
  flujo: FlujoEjecutado,
): string | null {
  const lista = losFlujosGuardados(raw);
  const i = lista.findIndex((f) => f.id === flujo.id);
  if (i !== -1) {
    if (lista[i].name === flujo.name) return null;
    lista[i] = { ...lista[i], name: flujo.name };
  } else {
    lista.push({ id: flujo.id, name: flujo.name });
  }
  return JSON.stringify(lista);
}
