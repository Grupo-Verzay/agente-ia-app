/**
 * El ancho de la landing principal: cada bloque de `/inicio` (y de las de los
 * resellers) va dentro de esta caja. La página de detalle de un plan usa la
 * MISMA, en todos sus bloques y en su barra de arriba, para que de la landing
 * a un plan no cambie el ancho ni el margen a los lados, y para que dentro del
 * plan ningún bloque sea más angosto ni más ancho que el de al lado. La
 * propuesta pública también.
 *
 * Escrita una vez: con el número copiado en cada pantalla, el día que se
 * afine uno los demás se quedan atrás. Vive en `lib/`, que Tailwind mira.
 *
 * # En el teléfono la caja NO lleva margen a los lados
 *
 * Por debajo de `sm` (640 px) el relleno es 0: las tarjetas y los bloques
 * llenan el ancho de la pantalla, como la bandeja de Chats dentro de la App.
 * Antes eran 32 px por lado (64 de 390: el 16 % de la pantalla en blanco, y en
 * la propuesta, de fondo claro, se notaba más). Desde `sm` es el de siempre
 * (48 y 64 px): tableta y computador no se tocan.
 *
 * Sin margen en la caja, hay DOS cosas que tienen que cuidarse en el teléfono,
 * y están aquí para no escribirlas a mano en cada pantalla:
 *
 * - **El texto suelto** (un título, un párrafo, los botones del primer
 *   pantallazo) no puede tocar el borde: lleva `SANGRIA_DEL_TEXTO`. Lo que va
 *   DENTRO de una tarjeta ya trae el relleno de la tarjeta.
 * - **Una tarjeta pegada al borde** no lleva esquinas redondeadas ni raya a los
 *   lados (quedarían cortadas por la pantalla): lleva `BLOQUE_A_BORDE`. Es lo
 *   que hace la bandeja de Chats (`rounded-none border-0 sm:rounded-md sm:border`).
 *   Solo las del primer nivel: una tarjeta DENTRO de otra queda con su aire.
 *
 * Y las barras (la de arriba y el pie), que no son bloques sino filas de
 * mandos y texto, usan `ANCHO_DE_LA_LANDING_CON_SANGRIA`: la misma caja con
 * 16 px a los lados en el teléfono.
 *
 * Los dos últimos van en clases literales: Tailwind solo genera lo que ve
 * escrito. Lo vigila `scripts/banco-landing-a-borde-en-movil.sh`.
 */
export const ANCHO_DE_LA_LANDING = "mx-auto max-w-6xl px-0 sm:px-12 lg:px-16";

/** La misma caja, con 16 px a los lados en el teléfono: la barra de arriba y el pie. */
export const ANCHO_DE_LA_LANDING_CON_SANGRIA = "mx-auto max-w-6xl px-4 sm:px-12 lg:px-16";

/** Texto suelto dentro de `ANCHO_DE_LA_LANDING`: 16 px en el teléfono, 0 desde `sm`. */
export const SANGRIA_DEL_TEXTO = "px-4 sm:px-0";

/** Una tarjeta del primer nivel: en el teléfono, sin esquinas ni raya a los lados. */
export const BLOQUE_A_BORDE = "max-sm:rounded-none max-sm:border-x-0";
