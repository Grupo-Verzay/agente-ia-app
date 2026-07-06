/**
 * Utilidades para el módulo de embebido `/canva`.
 *
 * El módulo `/canva` muestra en un iframe la URL configurada en el `customUrl`
 * de un submódulo. Antes esa URL vivía SOLO en un store de Zustand que se
 * seteaba al hacer clic en el sidebar, por lo que al navegar por las pestañas
 * superiores, recargar la página o abrir un enlace directo, la URL se perdía y
 * la pantalla quedaba en "Cargando...".
 *
 * Para hacerlo robusto (stateless), la URL a embeber se transporta en el query
 * param `u` de la ruta: `/canva?u=<url-codificada>`. Así sobrevive a recargas,
 * navegación por pestañas y enlaces directos.
 */

export const CANVA_ROUTE = "/canva";

/** Nombre del query param que transporta la URL a embeber en `/canva`. */
export const CANVA_URL_PARAM = "u";

/**
 * Resuelve la ruta destino de un submódulo.
 *
 * - Aplica el reemplazo `/admin/` → `/panel/` (igual que antes).
 * - Si el destino es `/canva` y hay `customUrl`, lo adjunta como `?u=...` para
 *   que la ruta sea autosuficiente.
 */
export function resolveModuleItemDest(
  url?: string | null,
  customUrl?: string | null,
): string {
  const normalized = (url ?? "").replace("/admin/", "/panel/");
  const trimmed = customUrl?.trim();
  if (normalized === CANVA_ROUTE && trimmed) {
    return `${CANVA_ROUTE}?${new URLSearchParams({ [CANVA_URL_PARAM]: trimmed }).toString()}`;
  }
  return normalized;
}
