import type { AdjuntoDeTarea } from "@/lib/adjuntos-de-tarea-tipos";

export const TASK_TYPES = [
  "Seguimiento",
  "Llamada",
  "Reunión",
  "Email",
  "Tarea",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

/**
 * `in_progress` e `in_review` nacen con el tablero de Proyectos, que necesita
 * etapas intermedias. En la pantalla de Tareas cuentan como pendientes: son
 * trabajo sin terminar, y tratarlos de otro modo los haría desaparecer de los
 * contadores y de los vencidos.
 */
export type TaskStatus = "pending" | "in_progress" | "in_review" | "done" | "cancelled";

/** Sin terminar: lo que aún pide atención. */
export function isTaskOpen(status: string) {
  return status === "pending" || status === "in_progress" || status === "in_review";
}

export type TaskData = {
  id: number;
  ownerId: string;
  assignedToId: string;
  assignedToName: string | null;
  assignedToPhone: string | null;
  sessionId: number | null;
  contactName: string | null;
  contactJid: string | null;
  title: string;
  type: string;
  dueDate: string;
  result: string | null;
  status: TaskStatus;
  createdById: string;
  createdAt: string;
  /**
   * Los archivos que cuelgan de la tarea.
   *
   * Opcional porque `TaskData` la usan varias pantallas y solo el tablero de
   * Proyectos los trae; las demas no pagan una consulta que no van a enseñar.
   */
  adjuntos?: AdjuntoDeTarea[];
  /**
   * La cuenta de la plataforma a la que se le dedica esta tarea, o `null` si es
   * interna. **No es `ownerId`** —esa es la cuenta dueña de la agenda— ni
   * `sessionId` —ese es un contacto de WhatsApp, un lead—.
   *
   * Vive en `task_work`, tabla de la App: `tasks` es del backend y no se le
   * añaden columnas desde aquí (#360). Opcional por lo mismo que `adjuntos`:
   * solo el tablero de Proyectos la trae.
   */
  clienteId?: string | null;
  /**
   * Trae algo que QUIEN MIRA no ha abierto todavía: una asignación, un
   * comentario, un «ya está». Es lo que pinta el punto de color en el tablero.
   *
   * Opcional por lo mismo que `adjuntos`: solo lo trae el tablero de Proyectos,
   * y es **por persona**, no de la tarea — la misma tarjeta lleva punto para
   * quien no la ha abierto y no para quien sí.
   */
  tieneAlgoSinVer?: boolean;
};
