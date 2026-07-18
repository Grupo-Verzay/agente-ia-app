import { db } from "@/lib/db";
import { writeAuditLog } from "@/actions/audit-log-actions";

/**
 * Lógica de negocio del "Modo Dueño por WhatsApp" (Fase 1).
 *
 * Acciones seguras y auto-contenidas: no envían nada a terceros ni afectan a
 * clientes. El dueño le pide al agente crear tareas/recordatorios para sí mismo
 * o consultar un resumen de su día. Cada acción de escritura queda registrada
 * en AuditLog.
 */

export type CreatedOwnerTask = {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  status: string;
};

/**
 * Crea una tarea/recordatorio asignada al propio dueño. Un "recordatorio" es
 * simplemente una tarea de tipo "Recordatorio" — reutiliza la misma infra de
 * tareas (estado, vencimiento, auditoría) sin duplicar modelos.
 */
export async function createOwnerTask(params: {
  ownerId: string;
  ownerName: string | null;
  title: string;
  type: string;
  dueDate: Date;
}): Promise<CreatedOwnerTask> {
  const { ownerId, ownerName, title, type, dueDate } = params;

  const task = await (db as any).task.create({
    data: {
      ownerId,
      assignedToId: ownerId,
      assignedToName: ownerName,
      title,
      type,
      dueDate,
      status: "pending",
      createdById: ownerId,
    },
  });

  await writeAuditLog({
    userId: ownerId,
    actorId: ownerId,
    entityType: "task",
    entityId: String(task.id),
    action: "created",
    summary: `Creó "${task.title}" desde WhatsApp (modo dueño)`,
    metadata: {
      source: "owner-command",
      type: task.type,
      status: task.status,
      dueDate: task.dueDate?.toISOString?.() ?? dueDate.toISOString(),
    },
  });

  return {
    id: String(task.id),
    title: task.title,
    type: task.type,
    dueDate: task.dueDate?.toISOString?.() ?? dueDate.toISOString(),
    status: task.status,
  };
}

export type OwnerSummary = {
  pendingTasks: number;
  tasksDueToday: number;
  appointmentsToday: number;
  generatedAt: string;
};

/**
 * Resumen de solo lectura del día para el dueño: tareas pendientes, tareas que
 * vencen hoy y citas de hoy. No modifica nada, por eso no se audita.
 */
export async function getOwnerSummary(ownerId: string): Promise<OwnerSummary> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const [pendingTasks, tasksDueToday, appointmentsToday] = await Promise.all([
    (db as any).task.count({ where: { ownerId, status: "pending" } }),
    (db as any).task.count({
      where: { ownerId, status: "pending", dueDate: { gte: startOfDay, lte: endOfDay } },
    }),
    db.appointment.count({
      where: { userId: ownerId, startTime: { gte: startOfDay, lte: endOfDay } },
    }),
  ]);

  return {
    pendingTasks,
    tasksDueToday,
    appointmentsToday,
    generatedAt: now.toISOString(),
  };
}
