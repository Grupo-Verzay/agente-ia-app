/**
 * El menú lateral se COMPRIME solo al entrar a una sección.
 *
 * Antes solo lo hacía Chats (al abrir una conversación). Ahora es una regla de
 * la plataforma: entrar a Correo, Panel, CRM, Herramientas o cualquier otra
 * sección deja el menú en su franja de iconos, y quien necesite cambiar de
 * sección lo vuelve a abrir con un clic. Lo aplica
 * `components/ComprimirMenuAlNavegar.tsx`, montado una vez en el layout.
 *
 * Es puro para poder probarse sin navegador.
 */

/** La portada no es una sección: es desde donde se elige una. */
export function esUnaSeccion(ruta: string | null | undefined): boolean {
  if (!ruta) return false;
  const limpia = ruta.split(/[?#]/)[0].replace(/\/+$/, "");
  return limpia !== "";
}

export type Paso = {
  /** La ruta de la que se viene. `null` en el primer pintado. */
  anterior: string | null;
  /** La ruta a la que se llega. */
  actual: string | null;
  /** En un teléfono el menú es una hoja que ya se cierra sola al pulsar. */
  esMovil: boolean;
  /** Si el menú está abierto ahora mismo. Cerrado, no hay nada que hacer. */
  abierto: boolean;
};

/**
 * Se comprime al ENTRAR: en el primer pintado de una sección y cada vez que la
 * ruta cambia a otra sección. Si la ruta no cambia —un repintado, un cambio de
 * `?jid=`— no se toca: el menú que la persona abrió a mano se queda abierto
 * hasta que elija a dónde ir.
 */
export function debeComprimirse({ anterior, actual, esMovil, abierto }: Paso): boolean {
  if (esMovil || !abierto) return false;
  if (!esUnaSeccion(actual)) return false;
  return anterior !== actual;
}
