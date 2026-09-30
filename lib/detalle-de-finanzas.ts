/**
 * La forma del DETALLE de un movimiento de Finanzas: la ventana que se abre al
 * pulsar una venta o un gasto.
 *
 * Eran dos ventanas escritas por separado y no se parecían: la de una venta
 * iba a 980 px, con su cabecera en una franja y el total en una columna; la de
 * un gasto iba a 820 px, con el total metido en la tarjeta del concepto. Y las
 * DOS tenían el mismo fallo, que solo se ve abriéndolas: los botones de Editar
 * y Eliminar iban pegados al borde derecho de la cabecera, justo donde vive la
 * X de cerrar —a 16 px del borde—, así que la X quedaba ENCIMA del botón de
 * eliminar y pulsarla era una lotería.
 *
 * Aquí se escribe una vez. Las dos pantallas lo importan: con la forma copiada
 * en cada una, el día que se afine una la otra se queda atrás.
 */

import { DISTANCIA_DE_LA_X, LADO_DE_LA_X } from "@/lib/cerrar-del-dialogo";

/** Hueco entre los mandos de la cabecera y la X de cerrar. */
export const HUECO_ANTES_DE_LA_X = 16;

/**
 * Lo que hay que dejar libre a la derecha de la cabecera para que los mandos
 * acaben ANTES de la X: su distancia al borde, su lado y un hueco. Son 48 px,
 * que es exactamente `pr-12`: el banco comprueba que los dos digan lo mismo.
 */
export const SITIO_PARA_LA_X = DISTANCIA_DE_LA_X + LADO_DE_LA_X + HUECO_ANTES_DE_LA_X;

/** Lado de los botones de la cabecera del detalle (`tamano="detalle"`, `h-9`). */
export const LADO_DE_LOS_MANDOS = 36;

/**
 * Relleno de arriba de la cabecera: 16 px en un teléfono y 20 desde `sm`. La X
 * se baja para que su centro caiga en el de los botones de al lado:
 * `relleno + mando/2 − x/2` → 26 y 30 px. Sin eso la X queda más alta que los
 * botones y la fila se lee torcida.
 */
export const ARRIBA_DE_LA_CABECERA = { telefono: 16, desdeSm: 20 } as const;

export function laAlturaDeLaX(relleno: number): number {
  return relleno + LADO_DE_LOS_MANDOS / 2 - LADO_DE_LA_X / 2;
}

/**
 * Las clases. Van LITERALES: Tailwind solo genera lo que ve escrito, y
 * `tailwind.config.ts` mira `lib/`. El banco comprueba que los números de
 * dentro sean los de arriba.
 */
export const DIALOGO_DEL_DETALLE =
  "sm:max-w-[980px] rounded-2xl p-0 overflow-hidden [--cerrar-arriba:26px] sm:[--cerrar-arriba:30px]";

/** La franja de arriba: título a la izquierda, mandos a la derecha y sitio para la X. */
export const CABECERA_DEL_DETALLE = "border-b bg-background/95 pt-4 pb-4 pl-4 pr-12 sm:pt-5 sm:pb-5 sm:pl-5";

export const CUERPO_DEL_DETALLE = "p-4 sm:p-5";

/** El concepto a la izquierda y el total en su columna, igual en los dos. */
export const REJILLA_DEL_DETALLE = "grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]";
