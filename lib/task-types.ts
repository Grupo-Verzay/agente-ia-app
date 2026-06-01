export const TASK_TYPES = [
  "Seguimiento",
  "Llamada",
  "Reunión",
  "Email",
  "Tarea",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];
