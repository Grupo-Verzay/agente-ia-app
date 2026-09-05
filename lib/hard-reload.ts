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

/**
 * Donde se deja anotado POR QUE se recargo, para poder decirlo en la vuelta
 * siguiente.
 *
 * "La App se refresca sola cada cierto rato" es de las cosas mas dificiles de
 * diagnosticar: cuando pasa, la consola se borra con la recarga y no queda
 * rastro de nada. Anotarlo ANTES de recargar y contarlo AL cargar convierte una
 * sensacion en un dato: quien recargo, por que, y cuanto duro la sesion.
 *
 * Y su ausencia tambien informa: si la pagina se recarga y aqui no hay nada,
 * la recarga NO viene de nuestro codigo.
 */
const RELOAD_REASON_KEY = 'verzay:ultima-recarga';

export function hardReload(motivo = 'sin motivo declarado'): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.setItem(
      RELOAD_REASON_KEY,
      JSON.stringify({
        motivo,
        cuando: Date.now(),
        donde: window.location.pathname,
        // Cuanto llevaba abierta la pestaña. Es el dato que dice si esto pasa
        // "cada ciertos minutos" y cada cuantos.
        vivaDesdeMs: Math.round(performance.now()),
      }),
    );
  } catch {
    // Si sessionStorage no esta, se recarga igual: perder el motivo es mejor
    // que dejar la pestaña rota.
  }

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
 * Cuenta en la consola si la carga anterior acabo en una recarga nuestra, y por
 * que. Se llama una vez al arrancar la App.
 *
 * Sale como `warn` a proposito: `log` y `debug` los borra el build en
 * produccion (ver la regla de `removeConsole` en CLAUDE.md), y este aviso es
 * justo de los que tienen que sobrevivir.
 */
export function reportarRecargaPrevia(): void {
  if (typeof window === 'undefined') return;

  try {
    const crudo = sessionStorage.getItem(RELOAD_REASON_KEY);
    if (!crudo) return;
    sessionStorage.removeItem(RELOAD_REASON_KEY);

    const dato = JSON.parse(crudo) as {
      motivo?: string;
      cuando?: number;
      donde?: string;
      vivaDesdeMs?: number;
    };

    console.warn('[app] esta pagina se recargo sola. Motivo:', dato.motivo ?? '(sin motivo)', {
      donde: dato.donde ?? '(desconocido)',
      hace: dato.cuando ? `${Math.round((Date.now() - dato.cuando) / 1000)}s` : '(sin hora)',
      laPestanaLlevabaAbierta: dato.vivaDesdeMs
        ? `${Math.round(dato.vivaDesdeMs / 1000)}s`
        : '(sin dato)',
    });
  } catch {
    // Diagnostico: si falla, no puede romper el arranque de la App.
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
