export const TASK_TYPES = [
  "Seguimiento",
  "Llamada",
  "Reunión",
  "Email",
  "Tarea",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

/**
 * `in_progress` nace con el tablero de Proyectos, que necesita una columna
 * intermedia. En la pantalla de Tareas cuenta como pendiente: es trabajo sin
 * terminar, y tratarlo de otro modo lo haría desaparecer de los avisos.
 */
export type TaskStatus = "pending" | "in_progress" | "done" | "cancelled";

/** Sin terminar: lo que aún pide atención. */
export function isTaskOpen(status: string) {
  return status === "pending" || status === "in_progress";
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
};
