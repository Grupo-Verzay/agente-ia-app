/**
 * Donde va la X de un dialogo: a una distancia FIJA del borde, tenga el
 * dialogo el relleno que tenga.
 *
 * La X vive dentro de la caja de contenido del dialogo (una caja de alto cero
 * y pegajosa, ver `components/ui/dialog.tsx`), asi que su sitio de verdad es
 * `relleno + desplazamiento`. Antes el desplazamiento era un `-8px` escrito a
 * mano, pensado para el `p-6` de siempre: con 24px de relleno quedaba a 16px
 * del borde. Pero la mitad de los dialogos van con `p-0` —el visor de
 * documentos de Chats, el simulador, Macros, Nuevo mensaje…— y ahi el mismo
 * `-8px` la dejaba **montada sobre el borde, medio afuera**.
 *
 * Ahora el desplazamiento se calcula con el relleno MEDIDO:
 * `desplazamiento = distancia - relleno`, asi que la X cae siempre a
 * `DISTANCIA_DE_LA_X` del borde por arriba y por la derecha — la misma por los
 * dos lados, que es lo que la hace simetrica —.
 *
 * Una pantalla puede pedir otra altura (`--cerrar-arriba`) para centrar la X
 * en su barra de cabecera; la distancia lateral no se toca.
 */

/** Distancia de la X al borde del dialogo, por arriba y por la derecha. */
export const DISTANCIA_DE_LA_X = 16;

/** El relleno de siempre (`p-6`), para el primer pintado antes de medir. */
export const RELLENO_POR_DEFECTO = 24;

/** Lado de la X (el icono de 16px, sin relleno). */
export const LADO_DE_LA_X = 16;

/**
 * Desplazamiento que hay que darle a la X dentro de la caja de contenido para
 * que quede a `distancia` del borde. Negativo mientras el relleno sea mayor que
 * la distancia (`p-6`), positivo cuando no hay relleno (`p-0`).
 */
export function desplazamientoDeLaX(relleno: number, distancia = DISTANCIA_DE_LA_X): number {
  const r = Number.isFinite(relleno) && relleno > 0 ? relleno : 0;
  return distancia - r;
}

/** Lee un `padding` computado ("24px") como numero; lo que no se entiende es 0. */
export function comoPixeles(valor: string | null | undefined): number {
  const n = Number.parseFloat(String(valor ?? ""));
  return Number.isFinite(n) ? n : 0;
}
