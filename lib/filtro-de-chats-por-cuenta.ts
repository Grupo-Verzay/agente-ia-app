/**
 * El panel de filtros de Chats: de QUÉ cuenta se ofrecen las etiquetas y los
 * embudos.
 *
 * La bandeja junta las líneas de la cuenta y de las que cuelgan de ella, y cada
 * etiqueta y cada embudo es de UNA cuenta. Antes el filtro de etiquetas, sin
 * una línea elegida en «Canales», ofrecía las de TODAS las cuentas mezcladas:
 * «Interesado» de Ventas al lado de «Interesado» de Atención, sin forma de
 * saber cuál era cuál. Y no había filtro de embudos.
 *
 * La regla, una sola para las dos secciones:
 *
 * 1. **Con una línea elegida en «Canales», manda su cuenta.** Filtrar Atención
 *    por una etiqueta de Ventas no puede dar nada.
 * 2. **Con una sola cuenta en la bandeja, es esa**, sin preguntar nada.
 * 3. **Con varias, se ELIGE primero la cuenta**, y solo entonces se despliegan
 *    sus etiquetas y sus embudos. Nunca mezcladas.
 *
 * Las dos secciones leen la MISMA cuenta: con una cuenta para etiquetas y otra
 * para embudos, poner los dos filtros a la vez daría siempre una lista vacía.
 *
 * Es puro para que el banco lo pruebe sin levantar nada.
 */

export type CuentaDelFiltro = { id: string; nombre: string };

export type EtapaDelFiltro = { id: string; nombre: string; color: string };

export type EmbudoDelFiltro = {
  id: string;
  nombre: string;
  porDefecto: boolean;
  etapas: EtapaDelFiltro[];
};

export type EmbudosDeLaCuenta = {
  cuentaId: string;
  nombre: string;
  embudos: EmbudoDelFiltro[];
};

/**
 * Las cuentas de la bandeja, sacadas de las líneas (línea → cuenta dueña), sin
 * repetir y con la PROPIA delante. Una cuenta sin líneas no tiene chats que
 * filtrar, así que no se ofrece.
 */
export function lasCuentasDeLasLineas(
  duenasDeLasLineas: Readonly<Record<string, string>>,
  propia: string | null | undefined,
): string[] {
  const vistas = new Set<string>();
  for (const cuenta of Object.values(duenasDeLasLineas)) {
    const limpia = String(cuenta ?? "").trim();
    if (limpia) vistas.add(limpia);
  }
  const lista = Array.from(vistas);
  const yo = String(propia ?? "").trim();
  if (yo && vistas.has(yo)) return [yo, ...lista.filter((c) => c !== yo)];
  return lista;
}

/** ¿Hay que elegir la cuenta antes de enseñar etiquetas y embudos? */
export function hayQueElegirCuenta(
  cuentas: readonly string[],
  cuentaDeLaLineaElegida: string | null | undefined,
): boolean {
  return !String(cuentaDeLaLineaElegida ?? "").trim() && cuentas.length > 1;
}

/**
 * La cuenta cuyas etiquetas y embudos se ofrecen, o `null` si todavía no se ha
 * elegido. Una elegida que ya no está en la bandeja no vale: se vuelve a
 * preguntar.
 */
export function laCuentaDelFiltro(opciones: {
  cuentas: readonly string[];
  cuentaDeLaLineaElegida?: string | null;
  elegida?: string | null;
}): string | null {
  const deLaLinea = String(opciones.cuentaDeLaLineaElegida ?? "").trim();
  if (deLaLinea) return deLaLinea;
  if (opciones.cuentas.length <= 1) return opciones.cuentas[0] ?? null;
  const elegida = String(opciones.elegida ?? "").trim();
  return elegida && opciones.cuentas.includes(elegida) ? elegida : null;
}

/** Los embudos de UNA cuenta, y ninguno de otra. Sin cuenta, ninguno. */
export function losEmbudosDelFiltro(
  datos: readonly EmbudosDeLaCuenta[],
  cuenta: string | null,
): EmbudoDelFiltro[] {
  if (!cuenta) return [];
  return datos.find((d) => d.cuentaId === cuenta)?.embudos ?? [];
}

/**
 * El embudo cuyas etapas se ofrecen: con uno solo, ese; con varios, el elegido
 * (y hasta que se elija, ninguno). Uno elegido que no es de esta cuenta no vale.
 */
export function elEmbudoDelFiltro(
  embudos: readonly EmbudoDelFiltro[],
  elegido: string | null | undefined,
): EmbudoDelFiltro | null {
  if (embudos.length === 1) return embudos[0];
  const id = String(elegido ?? "").trim();
  return (id && embudos.find((e) => e.id === id)) || null;
}

/**
 * Elegir una opción del filtro: la MISMA regla que las etiquetas de siempre.
 * Pulsar una la deja sola; pulsar la que ya estaba la quita.
 */
export function alternarUnaSola<T>(seleccion: ReadonlySet<T>, id: T): Set<T> {
  if (seleccion.has(id)) return new Set();
  return new Set([id]);
}

/** ¿Pasa una conversación el filtro de etapas? Sin selección, todas. */
export function pasaElFiltroDeEtapa(
  etapaId: string | null | undefined,
  seleccion: ReadonlySet<string>,
): boolean {
  if (seleccion.size === 0) return true;
  return Boolean(etapaId) && seleccion.has(String(etapaId));
}

/** ¿Pasa una conversación el filtro de etiquetas? Sin selección, todas. */
export function pasaElFiltroDeEtiquetas(
  etiquetas: ReadonlyArray<{ id: number }> | null | undefined,
  seleccion: ReadonlySet<number>,
): boolean {
  if (seleccion.size === 0) return true;
  return (etiquetas ?? []).some((t) => seleccion.has(t.id));
}
