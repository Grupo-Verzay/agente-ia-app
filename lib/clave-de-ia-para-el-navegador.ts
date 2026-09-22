/**
 * Lo que puede salir de una clave de IA hacia el navegador, y lo que no.
 *
 * La pantalla de Perfil recibía la fila entera de `user_ai_configs`, con
 * `apiKey` en claro, y la metía en el formulario. El `type="password"` solo la
 * tapaba en pantalla: la clave viajaba en la respuesta de la acción y quedaba
 * en el estado de React, a un DevTools de distancia. Y esa clave casi nunca es
 * del cliente: las cuentas nuevas nacen con una llave DE LA CASA (Panel › API
 * keys, antes `SECRET_API_KEY`), y los clientes de un reseller heredan la del
 * reseller. O sea que cualquier cuenta podía leer la clave de OpenAI de Verzay
 * desde su propio Perfil.
 *
 * La regla: **al navegador solo le llega SI hay clave y sus cuatro últimos
 * caracteres.** Para guardar, un campo vacío significa «conservar la que hay»,
 * así que nunca hace falta devolverla para poder volver a guardar el
 * formulario.
 *
 * Es puro y sin imports a propósito: lo prueba el banco sin levantar nada.
 */

/** Por debajo de esto no se enseña ni el final: en una clave corta, cuatro
 * caracteres son una parte grande de ella. Ninguna clave real es tan corta. */
const LARGO_MINIMO_PARA_ENSENAR_EL_FINAL = 12;

export type ClaveVistaDesdeElNavegador = {
  tieneClave: boolean;
  /** Los cuatro últimos caracteres, o `null` si no hay o es demasiado corta. */
  finalDeLaClave: string | null;
};

export function comoLaVeElNavegador(apiKey: string | null | undefined): ClaveVistaDesdeElNavegador {
  const clave = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!clave) return { tieneClave: false, finalDeLaClave: null };
  return {
    tieneClave: true,
    finalDeLaClave: clave.length >= LARGO_MINIMO_PARA_ENSENAR_EL_FINAL ? clave.slice(-4) : null,
  };
}

/**
 * Quita `apiKey` de una fila y le pone en su sitio lo que sí puede viajar.
 * Se usa en TODAS las acciones que devuelven una configuración: con la
 * limpieza escrita en cada una, la quinta se olvidaría.
 */
export function sinLaClave<T extends { apiKey?: string | null }>(
  fila: T,
): Omit<T, 'apiKey'> & ClaveVistaDesdeElNavegador {
  const { apiKey, ...resto } = fila;
  return { ...resto, ...comoLaVeElNavegador(apiKey) };
}

/**
 * Qué clave se guarda cuando llega el formulario.
 *
 * - Con texto: esa, recortada.
 * - Vacía y ya había una: la que había (el formulario ya no la conoce).
 * - Vacía y no había ninguna: no hay nada que guardar, y se dice.
 */
export type ClaveQueSeGuarda =
  | { ok: true; clave: string; esNueva: boolean }
  | { ok: false; motivo: 'api_key_required' };

export function laClaveQueSeGuarda(
  nueva: string | null | undefined,
  actual: string | null | undefined,
): ClaveQueSeGuarda {
  const escrita = typeof nueva === 'string' ? nueva.trim() : '';
  if (escrita) return { ok: true, clave: escrita, esNueva: true };
  const guardada = typeof actual === 'string' ? actual.trim() : '';
  if (guardada) return { ok: true, clave: guardada, esNueva: false };
  return { ok: false, motivo: 'api_key_required' };
}
