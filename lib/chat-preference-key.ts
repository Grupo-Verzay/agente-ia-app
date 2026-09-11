/**
 * Clave de una preferencia de chat (fijado, archivado, borrado).
 *
 * La bandeja muestra las líneas de TODAS las cuentas asociadas, y un mismo
 * número puede escribirle a varias. La marca es de **una línea concreta**, no
 * del número: borrar un contacto en Verzay Notificaciones no puede hacerlo
 * desaparecer de Atención ni de Ventas.
 *
 * Por eso la clave lleva las tres cosas: cuenta dueña, línea y número. Es el
 * mismo criterio que `getSessionForChat` usa para las sesiones.
 *
 * Antes la clave era solo `cuenta::número`, porque la tabla no guardaba la
 * línea. Se notaba como que borrar en una línea borraba en todas — Verzay |
 * Atención cayó de 17 chats a 4 — y también en el otro sentido: el chat volvía
 * a aparecer sin explicación. La tabla ya guarda `instanceName`.
 */
export function chatPreferenceKey(
  ownerUserId: string,
  instanceName: string | null | undefined,
  remoteJid: string,
) {
  return `${ownerUserId}::${(instanceName ?? "").trim()}::${remoteJid}`;
}

/**
 * Las claves con las que buscar la marca de un chat, en orden.
 *
 * Primero la de SU línea. Después la antigua —línea vacía—, que es como
 * quedaron las marcas de cuando la tabla no guardaba la línea: siguen valiendo
 * para todas, para no resucitarle al usuario chats que ya había borrado.
 */
export function chatPreferenceKeys(
  ownerUserId: string,
  instanceName: string | null | undefined,
  remoteJid: string,
) {
  const deSuLinea = chatPreferenceKey(ownerUserId, instanceName, remoteJid);
  const antigua = chatPreferenceKey(ownerUserId, "", remoteJid);
  return deSuLinea === antigua ? [antigua] : [deSuLinea, antigua];
}

/** Lo que hace falta de una marca para elegir entre varias. */
type MarcaConFechas = {
  pinnedAt?: string | Date | null;
  archivedAt?: string | Date | null;
  deletedAt?: string | Date | null;
  purgedAt?: string | Date | null;
};

/** Cuándo se tocó por última vez esta fila. Sin ninguna fecha, nunca. */
function cuandoSeToco(marca: MarcaConFechas | undefined): number {
  if (!marca) return -1;
  let ultima = 0;
  for (const valor of [marca.pinnedAt, marca.archivedAt, marca.deletedAt, marca.purgedAt]) {
    if (!valor) continue;
    const ms = valor instanceof Date ? valor.getTime() : new Date(valor).getTime();
    if (Number.isFinite(ms) && ms > ultima) ultima = ms;
  }
  return ultima;
}

/**
 * La marca que manda para un chat, entre todas las que pueda tener.
 *
 * Un contacto tiene varias identidades (`remoteJid`, `remoteJidAlt`, `senderPn`,
 * su `@lid`) y hasta dos filas por cada una: la de **su línea** y la **antigua**,
 * de cuando la tabla no guardaba la línea y la marca valía para todas.
 *
 * Antes esto era un `.find(Boolean)` sobre esa lista: **ganaba la primera que
 * apareciera**, y el orden lo pone la identidad, no la fecha. Eso es lo que
 * hacía que un chat volviera una y otra vez, y es un caso muy concreto:
 *
 * - El contacto tiene una fila **antigua** —sin línea— con `pinnedAt` puesto,
 *   de cuando anclar no mandaba la línea.
 * - Se elimina el chat. El borrado escribe filas nuevas, **de su línea**, con
 *   `deletedAt`, bajo todas las identidades que sepa cruzar.
 * - La lista lo devuelve la vuelta siguiente por otra de sus identidades, y por
 *   esa la primera fila que aparece es la antigua: la que dice «anclado» y no
 *   dice «borrado». **La marca nueva no se llega a mirar.**
 *
 * Y no se cruzaban todas las identidades porque quien sabe cruzar `@lid` con
 * número es `chat_messages`... que el propio borrado acababa de vaciar. Se
 * eliminaba diez veces y volvía diez veces.
 *
 * La regla, que es la de siempre en Chats —cuando una forma se queda corta, se
 * miran todas— aplicada por fin a **leer**:
 *
 * 1. **Si hay alguna fila de SU línea, mandan esas**, aunque exista una antigua.
 *    Lo de esta línea es más reciente y más preciso por definición.
 * 2. **Entre varias, la que se tocó la última.** Nunca se mezclan campos de dos
 *    filas: se elige una y se devuelve entera, o el chat saldría anclado por una
 *    y borrado por otra.
 * 3. La antigua sigue valiendo **cuando en esta línea no hay nada**, para no
 *    resucitar lo que alguien ya borró antes de que existiera la columna.
 *
 * Con una excepción, que es la regla 3 llevada a su caso límite: **si ese
 * contacto tiene conversación en varias líneas, la antigua no se hereda**. Esa
 * marca se escribió cuando la tabla no guardaba la línea, así que no dice en
 * cuál se pulsó; heredarla en todas escondía conversaciones que nadie borró. El
 * síntoma: el mismo número escribe a Ventas y a Atención, se borró en una, y
 * desaparece de las dos. Quien tiene marca propia de su línea sigue oculto —esa
 * sí dice de qué línea es—, y el contacto de una sola línea también, porque ahí
 * no hay ninguna ambigüedad que resolver: la marca solo pudo ser de esa.
 */
export function elegirPreferenciaDelChat<T extends MarcaConFechas>(
  preferencias: Record<string, T | undefined>,
  ownerUserId: string,
  instanceName: string | null | undefined,
  identidades: string[],
  /** Identidades que aparecen en más de una línea de la bandeja. */
  repartidasEntreLineas?: ReadonlySet<string>,
): T | undefined {
  let deSuLinea: T | undefined;
  let deSuLineaMs = -1;
  let antigua: T | undefined;
  let antiguaMs = -1;

  const linea = (instanceName ?? "").trim();

  // ¿Este contacto está repartido entre varias líneas? Entonces la marca sin
  // línea no se hereda: no sabe de cuál era.
  const enVariasLineas = Boolean(
    repartidasEntreLineas?.size && identidades.some((id) => repartidasEntreLineas.has(id)),
  );

  for (const identidad of identidades) {
    const suya = linea ? preferencias[chatPreferenceKey(ownerUserId, linea, identidad)] : undefined;
    if (suya) {
      const ms = cuandoSeToco(suya);
      if (ms > deSuLineaMs) {
        deSuLinea = suya;
        deSuLineaMs = ms;
      }
    }

    if (enVariasLineas) continue;

    const vieja = preferencias[chatPreferenceKey(ownerUserId, "", identidad)];
    if (vieja) {
      const ms = cuandoSeToco(vieja);
      if (ms > antiguaMs) {
        antigua = vieja;
        antiguaMs = ms;
      }
    }
  }

  return deSuLinea ?? antigua;
}
