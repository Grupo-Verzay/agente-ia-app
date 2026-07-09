"use server";

import { z } from "zod";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { writeAuditLog } from "@/actions/audit-log-actions";

import type { TaskData, TaskStatus } from "@/lib/task-types";

async function getAuth() {
  const user = await currentUser();
  if (!user?.id) throw new Error("No autorizado.");
  return user;
}

/**
 * Dispara (fire-and-forget) las automatizaciones configuradas para un tipo de
 * tarea cuando se crea una tarea de ese tipo. Espeja triggerStageAutomations.
 */
async function triggerTaskTypeAutomations(sessionId: number, taskType: string): Promise<void> {
  const backendUrl = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");
  if (!backendUrl) return;
  const key = process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? "";
  try {
    await fetch(`${backendUrl}/task-type-automations/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": key },
      body: JSON.stringify({ sessionId, taskType }),
    });
  } catch (error) {
    console.error("[triggerTaskTypeAutomations]", error);
  }
}

function toTaskData(
  t: any,
  phoneMap: Record<string, string | null> = {},
  nameMap: Record<string, string | null> = {},
): TaskData {
  return {
    id: t.id,
    ownerId: t.ownerId,
    assignedToId: t.assignedToId,
    assignedToName: t.assignedToName ?? nameMap[t.assignedToId] ?? null,
    assignedToPhone: phoneMap[t.assignedToId] ?? null,
    sessionId: t.sessionId,
    contactName: t.contactName,
    contactJid: t.contactJid,
    title: t.title,
    type: t.type,
    dueDate: t.dueDate.toISOString(),
    result: t.result,
    status: t.status as TaskStatus,
    createdById: t.createdById,
    createdAt: t.createdAt.toISOString(),
  };
}

const createSchema = z.object({
  assignedToId: z.string().min(1),
  assignedToName: z.string().nullable().optional(),
  sessionId: z.number().int().positive().optional(),
  contactName: z.string().nullable().optional(),
  contactJid: z.string().nullable().optional(),
  title: z.string().trim().min(1),
  type: z.string().min(1),
  dueDate: z.string().min(1),
  sendWhatsApp: z.boolean().optional(),
});

const nextTaskSchema = z.object({
  type: z.string().trim().min(1),
  dueDate: z.string().datetime(),
});

export async function createTaskAction(
  input: z.infer<typeof createSchema>,
): Promise<{ success: boolean; message: string; data?: TaskData }> {
  try {
    const user = await getAuth();
    const parsed = createSchema.parse(input);
    const ownerId = user.ownerId ?? user.id;
    const assignedUser = parsed.assignedToName
      ? null
      : await db.user.findUnique({
          where: { id: parsed.assignedToId },
          select: { name: true, email: true },
        });
    const assignedToName =
      parsed.assignedToName ?? assignedUser?.name ?? assignedUser?.email ?? null;

    const task = await (db as any).task.create({
      data: {
        ownerId,
        assignedToId: parsed.assignedToId,
        assignedToName,
        sessionId: parsed.sessionId ?? null,
        contactName: parsed.contactName ?? null,
        contactJid: parsed.contactJid ?? null,
        title: parsed.title,
        type: parsed.type,
        dueDate: new Date(parsed.dueDate),
        status: "pending",
        createdById: user.id,
      },
    });

    // Automatizaciones por tipo de tarea (requieren sesión para el contexto de envío)
    if (parsed.sessionId) void triggerTaskTypeAutomations(parsed.sessionId, parsed.type);

    await writeAuditLog({
      userId: ownerId,
      actorId: user.id,
      entityType: "task",
      entityId: String(task.id),
      action: "created",
      summary: `Creo la tarea "${task.title}"`,
      metadata: {
        status: task.status,
        assignedToId: task.assignedToId,
        sessionId: task.sessionId,
        dueDate: task.dueDate?.toISOString?.() ?? parsed.dueDate,
      },
    });

    // Recordatorio WhatsApp al asesor asignado
    if (parsed.sendWhatsApp) {
      try {
        const [advisor, instance] = await Promise.all([
          db.user.findUnique({
            where: { id: parsed.assignedToId },
            select: { notificationNumber: true },
          }),
          (db as any).instancia.findFirst({
            where: {
              userId: ownerId,
              instanceType: { in: ["Whatsapp", null] },
            },
            select: { instanceName: true, apiKeyId: true },
          }),
        ]);

        const phone = advisor?.notificationNumber?.replace(/\D/g, "");
        const apiKey = instance?.apiKeyId
          ? await db.apiKey.findUnique({
              where: { id: instance.apiKeyId },
              select: { key: true, url: true },
            })
          : null;

        if (phone && phone.length >= 7 && instance && apiKey) {
          const contact = parsed.contactName ? ` con ${parsed.contactName}` : "";
          const msg = `📋 *Recordatorio de tarea*\n\n*${parsed.type}:* ${parsed.title}${contact}\n🕐 ${format(new Date(parsed.dueDate), "dd/MM/yyyy HH:mm")}`;
          await db.seguimiento.create({
            data: {
              remoteJid: `${phone}@s.whatsapp.net`,
              instancia: instance.instanceName,
              apikey: apiKey.key,
              serverurl: apiKey.url,
              mensaje: msg,
              time: format(new Date(parsed.dueDate), "dd/MM/yyyy HH:mm"),
              tipo: "task-reminder",
              followUpStatus: "pending",
              idNodo: `task-reminder-${Date.now()}`,
            },
          });
        }
      } catch (waError) {
        console.warn("[createTaskAction] WhatsApp reminder failed:", waError);
      }
    }

    return { success: true, message: "Tarea creada.", data: toTaskData(task) };
  } catch (error) {
    console.error("[createTaskAction]", error);
    return { success: false, message: error instanceof Error ? error.message : "Error al crear la tarea." };
  }
}

export async function createDetectedAppointmentAction(input: {
  assignedToId: string;
  sessionId: number;
  contactName?: string | null;
  title: string;
  startTime: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const user = await getAuth();
    const ownerId = user.ownerId ?? user.id;
    const session = await db.session.findFirst({
      where: { id: input.sessionId, userId: ownerId },
      select: { id: true, pushName: true },
    });
    if (!session) return { success: false, message: "No se encontró el chat asociado." };

    const assignedUser = await db.user.findFirst({
      where: {
        id: input.assignedToId,
        OR: [{ id: ownerId }, { ownerId }],
      },
      select: { id: true },
    });
    if (!assignedUser) return { success: false, message: "Asesor no autorizado." };

    const startTime = new Date(input.startTime);
    if (Number.isNaN(startTime.getTime()) || startTime <= new Date()) {
      return { success: false, message: "Selecciona una fecha futura válida." };
    }
    const endTime = new Date(startTime.getTime() + 30 * 60_000);
    const overlap = await db.appointment.findFirst({
      where: {
        userId: assignedUser.id,
        status: { in: ["PENDIENTE", "CONFIRMADA", "ATENDIDA"] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      select: { id: true },
    });
    if (overlap) return { success: false, message: "Ya existe una cita en ese horario." };

    const appointment = await db.appointment.create({
      data: {
        userId: assignedUser.id,
        sessionId: session.id,
        clientName: input.contactName?.trim() || session.pushName,
        startTime,
        endTime,
        timezone: user.timezone || "America/Bogota",
        status: "PENDIENTE",
      },
    });
    await writeAuditLog({
      userId: ownerId,
      actorId: user.id,
      entityType: "appointment",
      entityId: appointment.id,
      action: "created",
      summary: `Creó cita detectada en chat: ${input.title}`,
      metadata: { sessionId: session.id, startTime: startTime.toISOString() },
    });
    return { success: true, message: "Cita creada en la agenda." };
  } catch (error) {
    console.error("[createDetectedAppointmentAction]", error);
    return { success: false, message: "No se pudo crear la cita." };
  }
}

export async function getMyTasksAction(): Promise<{
  success: boolean;
  data?: TaskData[];
  message?: string;
}> {
  try {
    const user = await getAuth();
    const ownerId = user.ownerId ?? user.id;

    const tasks = await (db as any).task.findMany({
      where: {
        ownerId,
        status: { in: ["pending", "done"] },
      },
      orderBy: { dueDate: "asc" },
    });

    const advisorIds = Array.from(new Set<string>(tasks.map((t: any) => t.assignedToId)));
    const advisors = await db.user.findMany({
      where: { id: { in: advisorIds } },
      select: { id: true, name: true, email: true, notificationNumber: true },
    });
    const phoneMap = Object.fromEntries(advisors.map(a => [a.id, a.notificationNumber]));
    const nameMap = Object.fromEntries(advisors.map(a => [a.id, a.name ?? a.email]));

    return { success: true, data: tasks.map((t: any) => toTaskData(t, phoneMap, nameMap)) };
  } catch (error) {
    console.error("[getMyTasksAction]", error);
    return { success: false, message: "Error al cargar las tareas." };
  }
}

export async function getTasksBySessionAction(
  sessionId: number,
): Promise<{ success: boolean; data?: TaskData[]; message?: string }> {
  try {
    await getAuth();
    const tasks = await (db as any).task.findMany({
      where: { sessionId, status: { not: "cancelled" } },
      orderBy: { dueDate: "asc" },
    });
    return { success: true, data: tasks.map(toTaskData) };
  } catch (error) {
    console.error("[getTasksBySessionAction]", error);
    return { success: false, message: "Error al cargar las tareas." };
  }
}

export async function completeTaskAction(
  taskId: number,
  result: string,
  nextTask?: {
    type: string;
    dueDate: string;
  },
): Promise<{ success: boolean; message: string; data?: { nextTask?: TaskData } }> {
  try {
    const user = await getAuth();
    const ownerId = user.ownerId ?? user.id;
    const parsedNextTask = nextTask ? nextTaskSchema.parse(nextTask) : undefined;
    const currentTask = await (db as any).task.findFirst({
      where: { id: taskId, ownerId },
    });

    if (!currentTask) {
      return { success: false, message: "No se encontro la tarea." };
    }

    const createdNextTask = await db.$transaction(async (tx) => {
      await (tx as any).task.update({
        where: { id: taskId },
        data: { status: "done", result: result || null },
      });

      if (!parsedNextTask) return null;

      return (tx as any).task.create({
        data: {
          ownerId,
          assignedToId: currentTask.assignedToId,
          assignedToName: currentTask.assignedToName,
          sessionId: currentTask.sessionId,
          contactName: currentTask.contactName,
          contactJid: currentTask.contactJid,
          title: currentTask.title,
          type: parsedNextTask.type,
          dueDate: new Date(parsedNextTask.dueDate),
          status: "pending",
          createdById: user.id,
        },
      });
    });

    await writeAuditLog({
      userId: ownerId,
      actorId: user.id,
      entityType: "task",
      entityId: String(taskId),
      action: "completed",
      summary: `Completo la tarea "${currentTask.title}"`,
      metadata: {
        result: result || null,
        nextTaskId: createdNextTask?.id ?? null,
      },
    });

    if (createdNextTask) {
      await writeAuditLog({
        userId: ownerId,
        actorId: user.id,
        entityType: "task",
        entityId: String(createdNextTask.id),
        action: "created",
        summary: `Creo la siguiente tarea "${createdNextTask.title}"`,
        metadata: {
          previousTaskId: taskId,
          status: createdNextTask.status,
          dueDate: createdNextTask.dueDate?.toISOString?.() ?? parsedNextTask?.dueDate,
        },
      });
    }

    return {
      success: true,
      message: parsedNextTask ? "Tarea completada y siguiente tarea programada." : "Tarea completada.",
      data: createdNextTask ? { nextTask: toTaskData(createdNextTask) } : undefined,
    };
  } catch (error) {
    console.error("[completeTaskAction]", error);
    return { success: false, message: "Error al completar la tarea." };
  }
}

export async function cancelTaskAction(
  taskId: number,
): Promise<{ success: boolean; message: string }> {
  try {
    const user = await getAuth();
    const ownerId = user.ownerId ?? user.id;
    const task = await (db as any).task.findFirst({
      where: { id: taskId, ownerId },
      select: { title: true },
    });
    const result = await (db as any).task.updateMany({
      where: { id: taskId, ownerId },
      data: { status: "cancelled" },
    });
    if (result.count === 0) return { success: false, message: "No se encontro la tarea." };
    await writeAuditLog({
      userId: ownerId,
      actorId: user.id,
      entityType: "task",
      entityId: String(taskId),
      action: "cancelled",
      summary: `Cancelo la tarea "${task?.title ?? taskId}"`,
    });
    return { success: true, message: "Tarea cancelada." };
  } catch (error) {
    console.error("[cancelTaskAction]", error);
    return { success: false, message: "Error al cancelar la tarea." };
  }
}

export async function deleteTaskAction(
  taskId: number,
): Promise<{ success: boolean; message: string }> {
  try {
    const user = await getAuth();
    const ownerId = user.ownerId ?? user.id;
    const task = await (db as any).task.findFirst({
      where: { id: taskId, ownerId },
      select: { title: true },
    });
    const result = await (db as any).task.deleteMany({
      where: { id: taskId, ownerId },
    });
    if (result.count === 0) return { success: false, message: "No se encontro la tarea." };
    await writeAuditLog({
      userId: ownerId,
      actorId: user.id,
      entityType: "task",
      entityId: String(taskId),
      action: "deleted",
      summary: `Elimino la tarea "${task?.title ?? taskId}"`,
    });
    return { success: true, message: "Tarea eliminada." };
  } catch (error) {
    console.error("[deleteTaskAction]", error);
    return { success: false, message: "Error al eliminar la tarea." };
  }
}

export async function getAdvisorsForTaskAction(): Promise<{
  success: boolean;
  data?: { id: string; name: string | null; email: string }[];
}> {
  try {
    const user = await getAuth();
    const ownerId = user.ownerId ?? user.id;

    const advisors = await db.user.findMany({
      where: { OR: [{ id: ownerId }, { ownerId }] },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });

    return { success: true, data: advisors };
  } catch (error) {
    console.error("[getAdvisorsForTaskAction]", error);
    return { success: false };
  }
}

export async function getCustomTaskTypesAction(): Promise<string[]> {
  try {
    const user = await getAuth();
    const ownerId = user.ownerId ?? user.id;
    const rows = await (db as any).userTaskType.findMany({
      where: { ownerId },
      orderBy: { order: "asc" },
    });
    return rows.map((r: any) => r.name as string);
  } catch {
    return [];
  }
}

export async function createCustomTaskTypeAction(
  name: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const user = await getAuth();
    const ownerId = user.ownerId ?? user.id;
    const trimmed = name.trim();
    if (!trimmed) return { success: false, message: "El nombre no puede estar vacío." };

    const count = await (db as any).userTaskType.count({ where: { ownerId } });
    await (db as any).userTaskType.create({
      data: { ownerId, name: trimmed, order: count },
    });
    return { success: true, message: "Tipo creado." };
  } catch (error: any) {
    if (error?.code === "P2002") return { success: false, message: "Ese tipo ya existe." };
    return { success: false, message: "Error al crear el tipo." };
  }
}

export async function deleteCustomTaskTypeAction(
  name: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const user = await getAuth();
    const ownerId = user.ownerId ?? user.id;
    await (db as any).userTaskType.deleteMany({ where: { ownerId, name } });
    return { success: true, message: "Tipo eliminado." };
  } catch {
    return { success: false, message: "Error al eliminar el tipo." };
  }
}
