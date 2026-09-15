/**
 * Los tipos y las constantes de los adjuntos de una tarea. **Puro**: aqui no
 * entra nada del servidor.
 *
 * Vive aparte de `lib/adjuntos-de-tarea.ts` porque ese importa Prisma, y de
 * esto tira el tablero, que es un componente de cliente. Con todo en el mismo
 * fichero bastaba con que alguien cambiara un `import type` por un import
 * normal para llevarse Prisma al navegador — y eso no falla en el build, se
 * nota en el peso y en el arranque.
 */

/** Los mismos cuatro del modal de recordatorios. */
export const TIPOS_DE_ADJUNTO = ["image", "video", "audio", "document"] as const;
export type TipoDeAdjunto = (typeof TIPOS_DE_ADJUNTO)[number];

/**
 * Tope por tarea.
 *
 * No es una cifra de negocio: es que una tarjeta con veinte archivos deja de
 * leerse, y sin tope esto crece sin que nadie lo mire.
 */
export const TOPE_DE_ADJUNTOS_POR_TAREA = 10;

export type AdjuntoDeTarea = {
  id: string;
  taskId: number;
  url: string;
  nombre: string;
  tipo: TipoDeAdjunto;
  mimeType: string | null;
  tamanoBytes: number | null;
  creadoEn: string;
};
