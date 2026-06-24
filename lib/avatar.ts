/**
 * Devuelve la URL a usar como `src` de un avatar.
 * - Sin URL → placeholder local.
 * - URL local (empieza con "/") → tal cual.
 * - URL remota (foto de WhatsApp, etc.) → vía proxy /api/avatar, que sirve la
 *   imagen o cae al placeholder si caducó (evita errores 403/404 en consola).
 */
export function avatarSrcFor(url?: string | null): string {
  if (!url) return "/placeholder.svg";
  if (url.startsWith("/")) return url;
  return `/api/avatar?u=${encodeURIComponent(url)}`;
}
