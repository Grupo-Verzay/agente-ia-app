/**
 * «Todos» cuenta las conversaciones ACTIVAS: ni borradas, ni archivadas, ni
 * resueltas. Exactamente las que la lista enseña bajo esa pastilla.
 *
 * El numero sale de dos sitios, y los dos tienen que decir lo mismo:
 *
 *  - el SERVIDOR (`contarChatsPorLinea`), un `COUNT` sobre `Session` que no
 *    esta topado por la pagina cargada;
 *  - el NAVEGADOR, que sabe lo que ha cambiado DESPUES de ese `COUNT`: resolver,
 *    reabrir, archivar, borrar, un mensaje del cliente que reabre solo.
 *
 * Antes el navegador hacia `max(servidor, cargadas)` y el servidor no
 * descontaba las resueltas. Asi que resolver sacaba la fila de la lista y el
 * numero no se movia —ni recargando—: un contador que no baja cuando la lista
 * baja se lee como un contador roto, y un cliente lo reporto.
 *
 * Este modulo es puro: la regla de «resuelta» y el reparto del numero entre las
 * dos fuentes. Lo usan la barra lateral (que decide que filas se ven) y el
 * cliente de Chats (que arma el numero de cada linea), para que no puedan
 * discrepar.
 */

/**
 * Una conversacion resuelta.
 *
 * Resuelta es tener la marca de «Resolver conversacion» (`resolved_at`) y que
 * no haya llegado nada despues: si el ultimo mensaje es posterior a la marca,
 * vuelve sola a la bandeja. El servidor usa la MISMA regla en SQL
 * (`contarChatsPorLinea`); si se cambia aqui, se cambia alli.
 *
 * Las dos horas van en milisegundos.
 */
export function estaResuelta(ultimoMensajeMs: number, resueltaEnMs: number | null | undefined): boolean {
  if (!resueltaEnMs) return false;
  return ultimoMensajeMs <= resueltaEnMs;
}

/** Lo que el conteo necesita saber de cada fila cargada. */
export type FilaDelConteo = {
  /** Una por linea y numero: la misma llave con la que la lista quita repetidos. */
  clave: string;
  linea: string;
  /**
   * Si la fila tiene ficha en `Session`. Solo esas entran en el `COUNT` del
   * servidor, y solo de esas se sabe si estan resueltas: la sesion llega unos
   * segundos despues de pintar la lista.
   */
  conSesion: boolean;
  /** No borrada, no archivada, no resuelta. */
  activa: boolean;
};

/**
 * El total de «Todos» por linea.
 *
 * `base` recuerda, para cada fila con sesion, si estaba activa la PRIMERA vez
 * que se la vio con su sesion puesta: eso es lo que el `COUNT` del servidor dio
 * por hecho. Cada fila que cambio despues suma o resta uno sobre el numero del
 * servidor. Asi resolver baja el numero al momento, reabrir lo sube, y no hace
 * falta volver a preguntar.
 *
 * Por que la primera vez CON SESION y no la primera vez a secas: las sesiones
 * llegan despues que la lista, y una fila resuelta se ve «activa» hasta que su
 * sesion llega. Apuntarla en ese momento restaria de nuevo algo que el servidor
 * ya habia descontado.
 *
 * `base` se modifica en el sitio (es la memoria de quien llama) y se reinicia
 * cuando llega un numero nuevo del servidor.
 *
 * Y el resultado nunca baja de lo que la pantalla cuenta activo: puede haber
 * conversaciones sin ficha que el `COUNT` no conoce.
 */
export function totalesDeTodos(
  filas: FilaDelConteo[],
  servidor: Record<string, number> | null | undefined,
  base: Map<string, boolean>,
): Record<string, number> {
  const cargadas: Record<string, number> = {};
  const cambio: Record<string, number> = {};

  for (const f of filas) {
    if (!f.linea) continue;
    if (f.activa) cargadas[f.linea] = (cargadas[f.linea] ?? 0) + 1;
    if (!f.conSesion) continue;

    const antes = base.get(f.clave);
    if (antes === undefined) {
      base.set(f.clave, f.activa);
      continue;
    }
    if (antes !== f.activa) {
      cambio[f.linea] = (cambio[f.linea] ?? 0) + (f.activa ? 1 : -1);
    }
  }

  if (!servidor) return cargadas;

  const totales: Record<string, number> = { ...cargadas };
  for (const [linea, total] of Object.entries(servidor)) {
    const corregido = Math.max(0, total + (cambio[linea] ?? 0));
    totales[linea] = Math.max(corregido, cargadas[linea] ?? 0);
  }
  return totales;
}

/**
 * Pinta en memoria que unas sesiones se resolvieron (o se reabrieron), en
 * TODAS las llaves bajo las que vive cada una.
 *
 * Es lo que faltaba para que «Todos» bajara al resolver sin recargar: las tres
 * formas de resolver —el botón de la cabecera, el menú de la fila y el lote—
 * escribian la marca en la base y NO en la pantalla, así que la fila y el
 * número esperaban al reloj de sesiones (60 s). Y reabrir solo limpiaba la
 * llave global del contacto, mientras la lista lee la de su línea
 * (`linea::numero`): la reabierta no volvía hasta ese mismo reloj.
 *
 * Se busca por `id`, que es el mismo en todas las llaves de una sesión — la
 * regla de siempre de Chats (`aplicarEnLaSesion`).
 *
 * `resueltaEn` es la hora de la marca (ms) o `null` para reabrir. Devuelve el
 * mapa nuevo y cuántas entradas tocó: con cero, quien llama lo dice en la
 * consola y conserva el anterior.
 */
export function conLaResolucion<T extends { id?: number | null; resolvedAt?: number | null }>(
  sesiones: Record<string, T>,
  ids: number[],
  resueltaEn: number | null,
): { siguiente: Record<string, T>; tocadas: number } {
  const buscadas = new Set(ids);
  const siguiente = { ...sesiones };
  let tocadas = 0;
  for (const [clave, sesion] of Object.entries(sesiones)) {
    if (!sesion || sesion.id == null || !buscadas.has(sesion.id)) continue;
    siguiente[clave] = { ...sesion, resolvedAt: resueltaEn };
    tocadas++;
  }
  return { siguiente, tocadas };
}
