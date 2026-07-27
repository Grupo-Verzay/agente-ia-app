/**
 * Recarga la página forzando que el HTML se pida de nuevo al servidor.
 *
 * `window.location.reload()` puede resolverse desde la caché del navegador: al
 * recuperarse de un desfase de versión (tras un despliegue) eso devuelve el
 * mismo documento viejo, que vuelve a pedir un chunk que ya no existe. El error
 * se repite, se agotan los reintentos y la pantalla queda atascada.
 *
 * Navegar a una URL con un parámetro distinto garantiza documento nuevo (no hay
 * entrada en caché para esa URL). Se usa `replace` para no ensuciar el historial
 * y el parámetro se limpia al cargar, para que no quede a la vista ni se propague
 * al compartir el enlace.
 */
const CACHE_BUST_PARAM = '__v';

export function hardReload(): void {
  if (typeof window === 'undefined') return;

  try {
    const url = new URL(window.location.href);
    url.searchParams.set(CACHE_BUST_PARAM, Date.now().toString(36));
    window.location.replace(url.toString());
  } catch {
    // Si algo falla al construir la URL, mejor recargar de la forma normal que
    // dejar al usuario sin salida.
    window.location.reload();
  }
}

/**
 * Quita el parámetro de recarga de la barra de direcciones una vez que la página
 * cargó bien. No recarga: solo reescribe la URL visible.
 */
export function cleanCacheBustParam(): void {
  if (typeof window === 'undefined') return;

  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(CACHE_BUST_PARAM)) return;
    url.searchParams.delete(CACHE_BUST_PARAM);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    // Cosmético: si falla, el parámetro se queda visible y no pasa nada.
  }
}
