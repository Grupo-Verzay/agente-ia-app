/**
 * Los tipos de la traza del panel, fuera del fichero `'use server'`.
 *
 * `actions/traza-actions.ts` no puede exportar nada que no sea una funcion
 * `async`. Next lo admite en el build —pasa limpio— y luego, en produccion,
 * CADA llamada a cualquier accion de ese fichero da 500. Ya costo la primera
 * version de Carpetas (ver CLAUDE.md). Un `export type` si podria quedarse,
 * porque se borra al compilar, pero tenerlos aqui deja el fichero de acciones
 * sin excepciones que recordar.
 */
export type TrazaConfigPanel = {
  activa: boolean;
  /** 0..100. Porcentaje de pestañas que trazan. */
  muestreo: number;
};
