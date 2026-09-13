/**
 * Lo que la cuenta tiene puesto para cuando una conversación se escala.
 *
 * Vive aquí y no dentro de `actions/escalado-actions.ts` porque aquel es un
 * módulo `'use server'`, y ahí **todo lo que no sea una función `async` va a
 * otro fichero**. Next lo admite en el build —`npm run build` pasa limpio— y
 * luego, en producción, cada llamada a cualquier acción de ese fichero da 500:
 * se pulsa el interruptor y se queda «Guardando…» para siempre, sin un solo
 * error en pantalla. Eso costó la primera versión entera de Carpetas.
 *
 * Un `export type` sí podría quedarse —se borra al compilar—, pero se queda
 * junto a su constante, que es donde se entiende.
 */

export type AjustesDeEscalado = {
  /** Si escalar apaga la IA en esa conversación. Por defecto sí. */
  apagarLaIaAlEscalar: boolean;
  /** Minutos sin respuesta antes de soltar la conversación. 0 = no soltar. */
  minutosParaSoltar: number;
};

/**
 * Lo de siempre: escalar apaga la IA y no se suelta a nadie.
 *
 * Es también el respaldo cuando la columna todavía no existe —App desplegada
 * antes que el backend—, y por eso importa que sea exactamente el
 * comportamiento anterior: una pantalla que no puede leer el ajuste tiene que
 * enseñar lo que la cuenta está haciendo de verdad, no un valor inventado.
 */
export const ESCALADO_POR_DEFECTO: AjustesDeEscalado = {
  apagarLaIaAlEscalar: true,
  minutosParaSoltar: 0,
};
