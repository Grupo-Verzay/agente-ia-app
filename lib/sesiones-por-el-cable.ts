import type { ChatContactSessionSummary, SimpleTag } from "@/types/session";

/**
 * Las sesiones de la cuenta, en la forma en que VIAJAN.
 *
 * Medido en produccion: el servidor decia 454 ms y el navegador veia 1.743.
 * Mil doscientos ochenta y nueve milisegundos de hueco, y **escalaba con la
 * cantidad** —750 ms con 206 sesiones, 1.289 con 733—, asi que no era la
 * consulta: era serializar la respuesta, comprimirla y volver a convertirla en
 * objetos. 444 KB para pintar las insignias de cada fila.
 *
 * Dos cosas lo llenaban, y las dos se arreglan sin quitar ni un dato:
 *
 * 1. **Las etiquetas iban enteras en CADA sesion.** Un contacto con tres
 *    etiquetas llevaba tres objetos con `id`, `name`, `slug`, `color` y
 *    `order`, y la etiqueta «Interesado» viajaba repetida en las trescientas
 *    conversaciones que la tienen. Ahora la sesion lleva **los ids** y las
 *    etiquetas van UNA vez, en un diccionario aparte.
 * 2. **Los nulos ocupan.** `"leadStatus":null` son dieciocho bytes para decir
 *    que no hay nada. Un campo que no viene ES que no hay nada: el tipo ya lo
 *    dice (`?:`), y al expandir vuelve a quedar `undefined`, que es lo que el
 *    navegador ya trataba igual que `null` en todos los sitios.
 *
 * El diccionario viaja CON las sesiones y no se toma de `allTags` a proposito:
 * la bandeja mira las lineas de varias cuentas a la vez, y una etiqueta de una
 * cuenta vinculada no tiene por que estar en las de la cuenta activa. Tomarla
 * de alli dejaria esas etiquetas sin nombre ni color, sin un solo error.
 *
 * Las dos funciones son puras y viven juntas a proposito: si una cambia y la
 * otra no, la insignia se queda sin datos y no hay nada que lo avise. Al
 * expandir se reconstruye EXACTAMENTE la forma que el resto del codigo ya
 * espera (`ChatContactSessionSummary`), asi que nada mas se entera.
 */

/** Una sesion tal y como viaja: sin nulos y con las etiquetas por id. */
export type SesionPorElCable = Omit<ChatContactSessionSummary, "tags"> & {
  /** Ids de las etiquetas. Los nombres van en el diccionario de al lado. */
  t?: number[];
};

export type SesionesPorElCable = {
  sesiones: SesionPorElCable[];
  /** Cada etiqueta UNA vez, no una copia por sesion que la lleve. */
  etiquetas: SimpleTag[];
};

export function comprimirSesiones(
  sesiones: ChatContactSessionSummary[],
): SesionesPorElCable {
  const etiquetas = new Map<number, SimpleTag>();
  const compactas: SesionPorElCable[] = [];

  for (const sesion of sesiones) {
    const { tags, ...resto } = sesion;
    const compacta: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(resto)) {
      // Solo se quitan `null` y `undefined`. Un `false` o un `0` SI son un
      // dato -«la IA esta apagada», «no tiene seguimientos»- y quitarlos
      // cambiaria lo que ve la fila.
      if (valor === null || valor === undefined) continue;
      compacta[clave] = valor;
    }
    if (tags?.length) {
      const ids: number[] = [];
      for (const tag of tags) {
        if (!tag || typeof tag.id !== "number") continue;
        if (!etiquetas.has(tag.id)) etiquetas.set(tag.id, tag);
        ids.push(tag.id);
      }
      if (ids.length) compacta.t = ids;
    }
    compactas.push(compacta as SesionPorElCable);
  }

  return { sesiones: compactas, etiquetas: Array.from(etiquetas.values()) };
}

export function expandirSesiones(
  payload: SesionesPorElCable | null | undefined,
): ChatContactSessionSummary[] {
  if (!payload?.sesiones?.length) return [];
  const porId = new Map((payload.etiquetas ?? []).map((tag) => [tag.id, tag]));

  return payload.sesiones.map((compacta) => {
    const { t, ...resto } = compacta;
    // Una etiqueta cuyo id no este en el diccionario se descarta en vez de
    // inventarse: media etiqueta -con id y sin nombre- se pinta como un hueco
    // de color sin texto, que es peor que no pintarla.
    const tags = (t ?? [])
      .map((id) => porId.get(id))
      .filter((tag): tag is SimpleTag => Boolean(tag));
    return { ...(resto as Omit<ChatContactSessionSummary, "tags">), tags };
  });
}
