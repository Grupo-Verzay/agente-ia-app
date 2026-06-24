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

/**
 * SVG (string) de un avatar: fondo en tono pastel del color + silueta de
 * usuario del mismo color (estilo suave tipo WhatsApp / ícono de Lucide).
 */
export function buildColoredAvatarSvg(seed: string): string {
  const color = colorForAvatar(seed);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">` +
    // Fondo: mismo color con baja opacidad (pastel)
    `<circle cx="40" cy="40" r="40" fill="${color}" fill-opacity="0.18"/>` +
    // Cabeza
    `<circle cx="40" cy="29" r="11" fill="${color}"/>` +
    // Hombros: busto redondeado, centrado y con margen respecto al borde
    `<path d="M40 43c-10.6 0-19.2 7.7-19.2 17.2 0 .9.7 1.6 1.6 1.6h35.2c.9 0 1.6-.7 1.6-1.6C59.2 50.7 50.6 43 40 43z" fill="${color}"/>` +
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
// Versión del avatar: subir este número al cambiar el diseño del avatar
// generado invalida el caché del navegador para las URLs del proxy.
const AVATAR_VERSION = "2";

export function avatarSrcFor(url: string | null | undefined, seed: string): string {
  if (!url) return coloredAvatarDataUri(seed);
  if (url.startsWith("/")) return url;
  return `/api/avatar?u=${encodeURIComponent(url)}&s=${encodeURIComponent(seed)}&v=${AVATAR_VERSION}`;
}
