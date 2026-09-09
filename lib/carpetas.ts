/**
 * Los tipos y las constantes de las carpetas, FUERA del fichero de acciones.
 *
 * Un fichero `'use server'` solo puede exportar funciones asíncronas. Con un
 * `export const` dentro —aquí estaba `TIPOS_DE_CARPETA`— el módulo entero deja
 * de valer como acciones de servidor: **el build pasa** y en producción cada
 * llamada revienta con un 500, así que el botón se queda en «Guardando…» para
 * siempre y no sale ni un error.
 *
 * Por eso lo que no es una acción vive aquí. Si hace falta otra constante de
 * carpetas, va en este fichero y no en el de acciones.
 */

/** Qué pantalla ordena esta carpeta. Si se añade otra, va aquí y nada más. */
export const TIPOS_DE_CARPETA = ["proyecto", "diagrama"] as const;
export type TipoDeCarpeta = (typeof TIPOS_DE_CARPETA)[number];

export type Carpeta = {
  id: string;
  nombre: string;
  color: string | null;
  orden: number;
  /** Quién la creó. Solo esa persona —o quien gestiona la cuenta— la cambia. */
  createdById: string | null;
  puedeGestionar: boolean;
};

export type CarpetasDeUnTipo = {
  carpetas: Carpeta[];
  /** id de la cosa → id de su carpeta. Lo que no está aquí, va suelto. */
  deCadaCosa: Record<string, string>;
};

export function esTipoDeCarpeta(valor: string): valor is TipoDeCarpeta {
  return (TIPOS_DE_CARPETA as readonly string[]).includes(valor);
}
