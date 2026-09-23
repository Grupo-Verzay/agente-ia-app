/**
 * «Todos» cuenta las conversaciones ACTIVAS: ni borradas, ni archivadas, ni
 * resueltas. Exactamente las que la lista enseña bajo esa pastilla.
 *
 * Las filas que cuentan las decide `lasFilasDeLaLista`
 * (`app/(root)/chats/_components/lo-que-ve-todos.ts`), la MISMA regla con la
 * que la barra lateral pinta la lista. Aqui solo se reparte el numero entre lo
 * que el navegador tiene cargado y lo que el servidor sabe de la bandeja
 * entera.
 *
 * Antes el servidor contaba LEADS (un `COUNT` sobre `Session`) y la lista
 * enseña CONVERSACIONES, asi que los dos numeros no se encontraban nunca: 32
 * contra 16, 34 contra 14.
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
 * vuelve sola a la bandeja. El servidor la usa tal cual: pasa la bandeja
 * entera por `lasFilasDeLaLista`, que llama a esta.
 *
 * Las dos horas van en milisegundos.
 */
export function estaResuelta(ultimoMensajeMs: number, resueltaEnMs: number | null | undefined): boolean {
  if (!resueltaEnMs) return false;
  return ultimoMensajeMs <= resueltaEnMs;
}

/** Cuantas filas tiene cada linea y cuantas salen bajo «Todos». */
export type ConteoPorLinea = {
  /** Las filas de la linea que la lista tiene o tendria: todas menos las borradas. */
  filas: Record<string, number>;
  /** Las que salen bajo «Todos». */
  todos: Record<string, number>;
};

/** Lo que la correccion en vivo necesita de cada fila cargada. */
export type FilaDelConteo = {
  /** La misma llave con la que la lista quita repetidos (`claveEnLaLista`). */
  clave: string;
  linea: string;
  /** No borrada, no archivada, no resuelta. */
  activa: boolean;
};

/**
 * El numero de «Todos» por linea.
 *
 * Las dos fuentes cuentan LO MISMO —las filas de la lista, pasadas por la misma
 * regla (`lasFilasDeLaLista`)—; lo que cambia es sobre que filas:
 *
 *  - `cargado`: lo que el navegador tiene. Es EXACTO cuando la linea esta
 *    entera, y en ese caso manda sin discusion: el numero dice lo que la lista
 *    enseña, ni una mas.
 *  - `servidor`: la bandeja ENTERA de la linea, sin el tope de la pagina. Solo
 *    hace falta cuando la linea tiene filas que el navegador todavia no ha
 *    cargado.
 *
 * Una linea esta entera cuando el navegador ya tiene al menos tantas filas
 * como el servidor dijo que habia. Asi no hay que suponer nada sobre paginas.
 *
 * Para una linea a medias el numero es el del servidor corregido con lo que
 * cambio despues en la pantalla: resolver, reabrir, archivar, borrar. `base`
 * recuerda, para cada fila, si estaba activa la PRIMERA vez que se la vio con
 * las sesiones ya cargadas —antes no se sabe si esta resuelta—; cada fila que
 * cambio despues suma o resta uno. Nunca baja de lo que la pantalla cuenta.
 *
 * `base` se modifica en el sitio (es la memoria de quien llama) y se reinicia
 * cuando llega un numero nuevo del servidor.
 */
export function totalesDeTodos(
  cargado: ConteoPorLinea,
  filas: FilaDelConteo[],
  servidor: ConteoPorLinea | null | undefined,
  base: Map<string, boolean>,
  sesionesListas: boolean,
): Record<string, number> {
  const cambio: Record<string, number> = {};
  if (sesionesListas) {
    for (const f of filas) {
      if (!f.linea) continue;
      const antes = base.get(f.clave);
      if (antes === undefined) {
        base.set(f.clave, f.activa);
        continue;
      }
      if (antes !== f.activa) {
        cambio[f.linea] = (cambio[f.linea] ?? 0) + (f.activa ? 1 : -1);
      }
    }
  }

  const totales: Record<string, number> = {};
  const lineas = new Set([
    ...Object.keys(cargado.filas),
    ...Object.keys(cargado.todos),
    ...Object.keys(servidor?.filas ?? {}),
    ...Object.keys(servidor?.todos ?? {}),
  ]);
  for (const linea of lineas) {
    if (!linea) continue;
    const enPantalla = cargado.todos[linea] ?? 0;
    const delServidor = servidor?.todos[linea];
    const entera = !servidor || (cargado.filas[linea] ?? 0) >= (servidor.filas[linea] ?? 0);

    if (delServidor === undefined) {
      totales[linea] = enPantalla;
    } else if (!sesionesListas) {
      // Sin sesiones todavia no se sabe que esta resuelta: lo cargado cuenta de
      // mas. El servidor si lo sabe.
      totales[linea] = delServidor;
    } else if (entera) {
      totales[linea] = enPantalla;
    } else {
      totales[linea] = Math.max(enPantalla, Math.max(0, delServidor + (cambio[linea] ?? 0)));
    }
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
