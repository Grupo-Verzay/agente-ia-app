/**
 * Qué etiquetas se le pueden poner a UNA conversación de Chats.
 *
 * Una etiqueta (`Tag`) cuelga de una CUENTA (`Tag.userId`) y cada línea
 * pertenece a una cuenta: Atención y Ventas son cuentas distintas de la misma
 * familia. La conversación guarda la cuenta de su línea en `Session.userId`, y
 * eso es exactamente lo que `assignTagToSessionAction` exige en el servidor:
 * `tag.userId === session.userId`.
 *
 * Así que la respuesta es una sola: **las etiquetas de la cuenta de la
 * conversación, y ninguna más.** Antes el selector ofrecía las de la cuenta de
 * QUIEN MIRA, así que desde la madre una conversación de Atención enseñaba las
 * etiquetas de la madre y al pulsar una el servidor contestaba «Tag no
 * encontrado o no pertenece a este usuario».
 *
 * Es puro para que el banco lo pruebe sin levantar nada, y lo usan los tres
 * sitios que etiquetan una conversación: la cabecera, el menú de la fila y el
 * lote. Con la condición escrita en cada uno, el cuarto se olvida.
 */

export type EtiquetaConCuenta = {
  id: number;
  /** La cuenta dueña. Sin ella la etiqueta no se ofrece en ninguna parte. */
  userId?: string | null;
};

/**
 * Las etiquetas de la cuenta de UNA conversación.
 *
 * Sin cuenta —una conversación sin ficha CRM— devuelve vacío, y **nunca cae a
 * las de otra cuenta**: una lista vacía es cierta («esta línea no tiene
 * etiquetas»), una de otra cuenta es una lista de botones que el servidor
 * rechaza.
 */
export function etiquetasDeLaConversacion<T extends EtiquetaConCuenta>(
  todas: readonly T[],
  cuentaDeLaConversacion: string | null | undefined,
): T[] {
  const cuenta = String(cuentaDeLaConversacion ?? "").trim();
  if (!cuenta) return [];
  return todas.filter((tag) => tag.userId === cuenta);
}

/**
 * Las etiquetas que se pueden aplicar a una SELECCIÓN de conversaciones.
 *
 * Solo cuando todas son de la misma cuenta. Si la selección mezcla líneas de
 * cuentas distintas no hay ninguna etiqueta que valga para todas —cada cuenta
 * tiene las suyas, con ids distintos— y ofrecer la unión sería aplicar a
 * medias en silencio. Las conversaciones sin cuenta (sin ficha CRM) no
 * cuentan: no se pueden etiquetar de todas formas.
 */
export function etiquetasDelLote<T extends EtiquetaConCuenta>(
  todas: readonly T[],
  cuentasDeLaSeleccion: ReadonlyArray<string | null | undefined>,
): { etiquetas: T[]; variasCuentas: boolean } {
  const cuentas = new Set(
    cuentasDeLaSeleccion.map((c) => String(c ?? "").trim()).filter(Boolean),
  );
  if (cuentas.size !== 1) {
    return { etiquetas: [], variasCuentas: cuentas.size > 1 };
  }
  const [cuenta] = Array.from(cuentas);
  return { etiquetas: etiquetasDeLaConversacion(todas, cuenta), variasCuentas: false };
}

/** Cuántas cuentas se piden como mucho de una vez. La bandeja suma 1-6. */
export const TOPE_DE_CUENTAS_CON_ETIQUETAS = 50;

/** Ids de cuenta saneados, sin repetir y acotados. */
export function comoListaDeCuentas(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const vistos = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const limpio = id.trim();
    if (limpio) vistos.add(limpio);
    if (vistos.size >= TOPE_DE_CUENTAS_CON_ETIQUETAS) break;
  }
  return Array.from(vistos);
}

/**
 * Las etiquetas del FILTRO de la lista.
 *
 * Con una línea elegida en «Canales», las de su cuenta y ninguna más: filtrar
 * la lista de Atención por una etiqueta de Ventas no puede dar nada. Sin línea
 * elegida la lista mezcla todas, así que se ofrecen todas.
 */
export function etiquetasDelFiltro<T extends EtiquetaConCuenta>(
  todas: readonly T[],
  cuentaDeLaLineaElegida: string | null,
): T[] {
  if (!cuentaDeLaLineaElegida) return [...todas];
  return etiquetasDeLaConversacion(todas, cuentaDeLaLineaElegida);
}
