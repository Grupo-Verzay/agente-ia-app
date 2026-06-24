// Avatares estilo WhatsApp: cuando un contacto no tiene foto (o la foto caducó),
// se muestra un círculo de color —derivado del contacto— con una silueta blanca,
// en vez de un gris uniforme. Funciones puras (sirven en cliente y servidor).

// Paleta de colores tipo WhatsApp (un color estable por contacto).
const AVATAR_COLORS = [
  "#E57373", // rojo
  "#64B5F6", // azul
  "#81C784", // verde
  "#FFB74D", // naranja
  "#BA68C8", // morado
  "#4DB6AC", // teal
  "#F06292", // rosa
  "#A1887F", // marrón
  "#7986CB", // índigo
  "#4DD0E1", // cyan
];

export function colorForAvatar(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** SVG (string) de un avatar: círculo de color + silueta blanca. */
export function buildColoredAvatarSvg(seed: string): string {
  const bg = colorForAvatar(seed);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">` +
    `<circle cx="40" cy="40" r="40" fill="${bg}"/>` +
    `<circle cx="40" cy="33" r="13" fill="#ffffff" fill-opacity="0.95"/>` +
    `<path d="M17 66c0-12.7 10.3-23 23-23s23 10.3 23 23" fill="#ffffff" fill-opacity="0.95"/>` +
    `</svg>`
  );
}

/** Data-URI del avatar coloreado (sin petición de red, ideal para sin-foto). */
export function coloredAvatarDataUri(seed: string): string {
  return `data:image/svg+xml,${encodeURIComponent(buildColoredAvatarSvg(seed))}`;
}

/**
 * URL a usar como `src` del avatar.
 * - Con foto remota → vía proxy /api/avatar (sirve la foto o, si caducó, un
 *   avatar coloreado con el mismo `seed`).
 * - Sin foto → avatar coloreado como data-URI (cero peticiones).
 * - URL local ("/...") → tal cual.
 */
export function avatarSrcFor(url: string | null | undefined, seed: string): string {
  if (!url) return coloredAvatarDataUri(seed);
  if (url.startsWith("/")) return url;
  return `/api/avatar?u=${encodeURIComponent(url)}&s=${encodeURIComponent(seed)}`;
}
