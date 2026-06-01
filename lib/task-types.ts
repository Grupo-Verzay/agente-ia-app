export const TASK_TYPES = [
  "Seguimiento",
  "Llamada",
  "Reunión",
  "Email",
  "Tarea",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export type TaskStatus = "pending" | "done" | "cancelled";

export type TaskData = {
  id: number;
  ownerId: string;
  assignedToId: string;
  assignedToName: string | null;
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
