/**
 * Comentarios de una tarea y avisos que salen de ella. Solo tipos y constantes.
 *
 * Puro a propósito: de aquí tiran el tablero y la ventana emergente, que son
 * componentes de cliente, y el módulo de al lado (`lib/avisos-de-tarea.ts`)
 * importa Prisma. Es el mismo reparto que `adjuntos-de-tarea-tipos`.
 */

/**
 * Los momentos en que a alguien le salta un aviso.
 *
 * Los tres primeros son de una tarea. El cuarto, `mencion`, es del **chat
 * interno del equipo**: reutiliza esta misma tubería a propósito —la misma
 * tabla, la misma ventana que interrumpe, la misma campanita— porque el fallo
 * que esto vino a arreglar es justo el contrario: un aviso más, en otro sitio,
 * con otra forma de despacharse, se aprende a ignorar como se ignoraba la
 * campanita.
 */
export const TIPOS_DE_AVISO = ["asignada", "hecha", "comentario", "mencion"] as const;
export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number];

/**
 * Cuánto se deja escribir en un comentario.
 *
 * Con tope, porque esto va dentro de un aviso que se pinta en una ventana
 * emergente: un texto sin límite la desborda y tapa la pantalla entera.
 */
export const TOPE_DE_COMENTARIO = 2000;

/** Cuántos avisos se traen de golpe. Nadie baja más allá de eso. */
export const TOPE_DE_AVISOS = 50;

export type ComentarioDeTarea = {
  id: string;
  taskId: number;
  autorId: string;
  /** Se guarda junto al comentario para que siga diciendo quién fue aunque
   *  esa persona salga del equipo. Mismo criterio que `assignedToName`. */
  autorNombre: string | null;
  texto: string;
  creadoEn: string;
};

export type AvisoDeTarea = {
  id: string;
  /**
   * La tarea, cuando el aviso es de una.
   *
   * **`null` en los del chat de equipo**, que no cuelgan de ninguna. Es lo
   * único que distingue a los dos, y de ahí sale a dónde lleva el clic.
   */
  taskId: number | null;
  projectId: number | null;
  tipo: TipoDeAviso;
  /** Qué pasó, ya redactado. El servidor lo escribe una vez. */
  titulo: string;
  /** El detalle: el comentario, el título de la tarea… */
  texto: string | null;
  actorNombre: string | null;
  creadoEn: string;
  /** El clic obligatorio de la ventana emergente. */
  atendido: boolean;
  /** Abrió la tarea. Es lo que quita el punto del tablero. */
  visto: boolean;
};

/**
 * A dónde lleva un aviso: al chat del equipo, al tablero de su proyecto, o a
 * Tareas si la tarea va suelta.
 */
export function aDondeLleva(aviso: { projectId: number | null; taskId: number | null }): string {
  if (aviso.taskId === null) return "/chat-equipo";
  return aviso.projectId
    ? `/proyectos?proyecto=${aviso.projectId}&tarea=${aviso.taskId}`
    : "/tareas";
}

/** Cómo se anuncia cada cosa, en una línea. */
export function tituloDelAviso(
  tipo: TipoDeAviso,
  quien: string | null,
  tituloDeLaTarea: string,
): string {
  const persona = quien?.trim() || "Alguien del equipo";
  if (tipo === "mencion") return `${persona} te mencionó en el chat del equipo`;
  if (tipo === "asignada") return `${persona} te asignó «${tituloDeLaTarea}»`;
  if (tipo === "hecha") return `${persona} terminó «${tituloDeLaTarea}»`;
  return `${persona} comentó en «${tituloDeLaTarea}»`;
}

export function esTipoDeAviso(v: string): v is TipoDeAviso {
  return (TIPOS_DE_AVISO as readonly string[]).includes(v);
}
