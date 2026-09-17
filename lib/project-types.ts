/** Estados de un proyecto. Texto, no enum, igual que el de las tareas. */
export const PROJECT_STATUSES = ["activo", "pausado", "terminado"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  activo: "Activo",
  pausado: "En pausa",
  terminado: "Terminado",
};

/**
 * Columnas del tablero. Se apoyan en el `status` que las tareas ya tenían:
 * `pending`, `done` y `cancelled` son los de siempre; `in_progress` e
 * `in_review` son los añadidos para tener etapas intermedias.
 *
 * «En revisión» separa «yo ya terminé» de «esto está aprobado»: sin ella,
 * Hecho acaba mintiendo.
 */
export const BOARD_COLUMNS = [
  { status: "pending", label: "Por hacer", color: "#64748B" },
  { status: "in_progress", label: "En curso", color: "#3B82F6" },
  { status: "in_review", label: "En revisión", color: "#A855F7" },
  { status: "done", label: "Hecho", color: "#22C55E" },
  { status: "cancelled", label: "Cancelado", color: "#94A3B8" },
] as const;

export type BoardColumnStatus = (typeof BOARD_COLUMNS)[number]["status"];

export type ProjectMemberData = {
  userId: string;
  name: string | null;
  email: string | null;
};

export type ProjectData = {
  id: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  leadId: string | null;
  leadName: string | null;
  dueDate: string | null;
  members: ProjectMemberData[];
  /** Cuántas tareas tiene, por estado del tablero. */
  taskCounts: Record<string, number>;
  /** Tareas sin terminar cuya fecha ya pasó. Lo que hay que mirar primero. */
  overdueTasks: number;
  createdAt: string;
  /** Quién lo abrió. */
  createdById: string;
  /** Quién lo creó, ya resuelto a nombre o correo. */
  createdByName: string | null;
  /**
   * Si quien mira lo lleva: puede editarlo, borrarlo y manejar sus tareas.
   * Cierto para quien gestiona la cuenta y para quien creó el proyecto.
   * **Siempre falso en uno recibido**: repartirlo sigue siendo de quien lo hizo.
   */
  puedeGestionar: boolean;
  /**
   * Llegó compartido desde OTRA cuenta.
   *
   * Es lo que distingue «este proyecto es nuestro» de «nos lo están enseñando»,
   * y de ahí cuelga todo lo demás: no se edita la ficha, no se borra, no se
   * comparte a más cuentas y no se borran sus tareas.
   */
  recibido: boolean;
  /**
   * Crear, mover, editar y cerrar tareas.
   *
   * En uno propio es cierto para quien lo ve; en uno recibido, solo con permiso
   * de edición. Sin esto, un proyecto de solo lectura se dejaría tocar entero y
   * no se guardaría nada — el fallo que ya costó trabajo perdido en Diagramas.
   */
  puedeEditarTareas: boolean;
  /** A cuántas cuentas se les está enseñando. Cero en los recibidos. */
  compartidoCon: number;
  /** De qué cuenta viene, ya resuelto a nombre. Solo en los recibidos. */
  deLaCuenta: string | null;
};
