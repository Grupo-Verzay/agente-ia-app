import { headers } from "next/headers";

/**
 * La cabecera con la que el middleware sella la hora de entrada.
 *
 * El middleware es lo PRIMERO que toca una peticion en nuestro codigo, asi que
 * ese sello es lo mas cerca del principio que podemos poner un reloj.
 */
export const CABECERA_DE_ENTRADA = "x-entro-en";

/**
 * Cuanto paso desde que la peticion entro al middleware hasta AQUI.
 *
 * Esto mide el hueco que llevamos toda la noche sin explicar: el navegador ve
 * 1,5-3,5 s de TTFB en acciones cuyo trabajo medido son ~250 ms. Entre medias
 * hay dos tramos y no sabiamos cual pesa:
 *
 *   navegador ──red/Traefik──> middleware ──Next──> primera linea de la accion
 *
 * Con este numero se parten en dos. Si sale grande, el tiempo se va DENTRO de
 * Next -resolver la accion, leer el cuerpo, o simplemente esperar al unico hilo
 * de JavaScript-. Si sale pequeño, el tiempo esta ANTES: red, Traefik, o el
 * proceso sin llegar a aceptar la conexion.
 *
 * Los dos relojes son del mismo proceso, asi que no hay desfase que corregir.
 *
 * Devuelve `null` si la cabecera no esta: en desarrollo, o si la peticion entro
 * por un camino del middleware que no la sella. Nunca revienta: es una medida.
 */
export function msDesdeQueEntroLaPeticion(): number | null {
  try {
    const sello = headers().get(CABECERA_DE_ENTRADA);
    if (!sello) return null;
    const entro = Number(sello);
    if (!Number.isFinite(entro) || entro <= 0) return null;
    const paso = Date.now() - entro;
    // Un numero absurdo (reloj cambiado, cabecera de otra cosa) no se reporta:
    // un dato falso en una medicion es peor que no tener dato.
    return paso >= 0 && paso < 120_000 ? paso : null;
  } catch {
    return null;
  }
}
