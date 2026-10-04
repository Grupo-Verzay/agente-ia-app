/**
 * El ancho de la landing principal: cada bloque de `/inicio` (y de las de los
 * resellers) va dentro de esta caja. La página de detalle de un plan usa la
 * MISMA, en todos sus bloques y en su barra de arriba, para que de la landing
 * a un plan no cambie el ancho ni el margen a los lados, y para que dentro del
 * plan ningún bloque sea más angosto ni más ancho que el de al lado.
 *
 * Escrita una vez: con el número copiado en cada pantalla, el día que se
 * afine uno los demás se quedan atrás. Vive en `lib/`, que Tailwind mira.
 */
export const ANCHO_DE_LA_LANDING = "mx-auto max-w-6xl px-8 sm:px-12 lg:px-16";
