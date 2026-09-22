import { hardReload } from '@/lib/hard-reload';

/**
 * Recuperarse de un desfase de version: limpiar lo cacheado y volver a pedir el
 * documento al servidor.
 *
 * Estaba escrito dentro de `components/chunk-recovery.tsx` y ahora lo llaman
 * TRES sitios —el oyente de la ventana, la pantalla global de error y la de
 * ruta—. Con una copia en cada uno, el dia que se afine el tope o la limpieza
 * se afina en uno y los otros dos se quedan atras.
 */

/**
 * Solo se recarga sola una vez cada tanto, para NO caer en un bucle si el
 * fallo es un error de verdad y no un desfase de version.
 */
const LLAVE_DEL_INTENTO = 'verzay:last-recovery-reload';
const ESPERA_ENTRE_INTENTOS_MS = 60000;

/** Si toca intentarlo, sin tocar nada. Lo pregunta quien quiere decidir antes. */
export function sePuedeIntentarDeNuevo(): boolean {
  try {
    const ultimo = Number(sessionStorage.getItem(LLAVE_DEL_INTENTO) || '0');
    return Date.now() - ultimo >= ESPERA_ENTRE_INTENTOS_MS;
  } catch {
    // Sin sessionStorage no hay forma de llevar la cuenta: mejor intentarlo que
    // dejar la pestaña rota.
    return true;
  }
}

/**
 * Intenta la recuperacion. Devuelve `true` si de verdad va a recargar.
 *
 * **Que devuelva `false` importa y no puede ser mudo.** Antes este camino se
 * salia con un `return` callado cuando el tope lo bloqueaba: la pantalla se
 * quedaba exactamente como estaba —en blanco— y no lo decia nadie. Quien llama
 * necesita saberlo para enseñar algo en su lugar.
 */
export function intentarRecuperar(motivo: string): boolean {
  if (typeof window === 'undefined') return false;

  if (!sePuedeIntentarDeNuevo()) {
    console.warn(
      '[app] no se recarga sola: ya se intento hace menos de',
      `${Math.round(ESPERA_ENTRE_INTENTOS_MS / 1000)}s.`,
      'Motivo del fallo:',
      motivo,
    );
    return false;
  }

  try {
    sessionStorage.setItem(LLAVE_DEL_INTENTO, String(Date.now()));
  } catch {
    // best-effort: sin la marca puede repetirse, pero recargar es lo que cura.
  }

  void (async () => {
    try {
      if ('caches' in window) {
        const llaves = await caches.keys();
        await Promise.all(llaves.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const registros = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registros.map((r) => r.unregister()));
      }
    } finally {
      hardReload(motivo);
    }
  })();

  return true;
}
