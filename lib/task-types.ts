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
};
