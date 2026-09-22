/**
 * Qué atajos —respuestas rápidas y workflows— se le ofrecen a UNA conversación
 * de Chats, y cuáles se le pueden mandar.
 *
 * Es la misma regla que las etiquetas (`lib/etiquetas-de-la-linea.ts`), y por
 * el mismo motivo, pero aquí no es solo visual: **lanzar un workflow de otra
 * línea le manda al cliente los mensajes de otra empresa**. El panel de Atajos
 * enseñaba los de TODAS las cuentas de la bandeja —la madre y sus hijas
 * revueltas—, y el servidor aceptaba cualquiera de la familia.
 *
 * La respuesta es una sola: **los atajos de la cuenta dueña de la línea de la
 * conversación, y ninguno más.** Sin cuenta —una línea que no se sabe de quién
 * es— sale vacío y **nunca cae a los de otra cuenta**: una lista vacía es cierta
 * («esta línea no tiene workflows»), una de otra cuenta es un envío equivocado.
 *
 * Es puro para que el banco lo pruebe sin levantar nada, y lo usan las dos
 * puntas: el navegador para filtrar lo que ofrece y el servidor para decidir
 * si deja mandarlo. Con la condición escrita en cada sitio, el tercero se
 * olvida.
 */

export type AtajoConCuenta = {
  /**
   * La CUENTA dueña del atajo (`ownerId ?? id` de quien lo creó), no la fila
   * que lo creó: un workflow creado por un asesor cuelga de su persona y es de
   * la cuenta para la que trabaja.
   */
  cuentaId?: string | null;
};

function limpio(valor: string | null | undefined): string {
  return String(valor ?? "").trim();
}

/** Los atajos de la cuenta de UNA conversación. Sin cuenta, vacío. */
export function atajosDeLaConversacion<T extends AtajoConCuenta>(
  todos: readonly T[],
  cuentaDeLaConversacion: string | null | undefined,
): T[] {
  const cuenta = limpio(cuentaDeLaConversacion);
  if (!cuenta) return [];
  return todos.filter((atajo) => limpio(atajo.cuentaId) === cuenta);
}

/**
 * La puerta del servidor: ¿se puede mandar este atajo por esta línea?
 *
 * Las dos puntas tienen que saberse. Un atajo sin cuenta o una línea sin dueño
 * NO pasan: ante la duda no se le escribe a un cliente.
 */
export function elAtajoEsDeLaLinea(
  cuentaDelAtajo: string | null | undefined,
  cuentaDeLaLinea: string | null | undefined,
): boolean {
  const atajo = limpio(cuentaDelAtajo);
  const linea = limpio(cuentaDeLaLinea);
  return Boolean(atajo) && Boolean(linea) && atajo === linea;
}

/** Lo que se le dice a quien intentó mandarlo. Nombra la causa, no «error». */
export function porQueNoEsDeLaLinea(
  queEs: "workflow" | "respuesta rápida",
  linea: string | null | undefined,
): string {
  const nombre = limpio(linea);
  return nombre
    ? `Ese ${queEs} no es de la cuenta de la línea ${nombre}; no se envió.`
    : `Ese ${queEs} no es de la cuenta de esta línea; no se envió.`;
}

/**
 * La cuenta dueña de cada fila que crea atajos: `ownerId ?? id`.
 *
 * Pura: recibe las filas de `User` ya leídas. Lo que no se encuentre se queda
 * con su propio id, que es lo que es si no cuelga de nadie.
 */
export function cuentasDeLasFilas(
  ids: readonly string[],
  filas: ReadonlyArray<{ id: string; ownerId: string | null }>,
): Map<string, string> {
  const porId = new Map(filas.map((fila) => [fila.id, fila.ownerId ?? fila.id]));
  const mapa = new Map<string, string>();
  for (const id of ids) mapa.set(id, porId.get(id) ?? id);
  return mapa;
}
