"use server";

import { z } from "zod";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

import type { TaskData, TaskStatus } from "@/lib/task-types";

async function getAuth() {
  const user = await currentUser();
  if (!user?.id) throw new Error("No autorizado.");
  return user;
}

function toTaskData(t: any): TaskData {
  return {
    id: t.id,
    ownerId: t.ownerId,
    assignedToId: t.assignedToId,
    assignedToName: t.assignedToName,
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

export async function createTaskAction(
  input: z.infer<typeof createSchema>,
): Promise<{ success: boolean; message: string; data?: TaskData }> {
  try {
    const user = await getAuth();
    const parsed = createSchema.parse(input);
    const ownerId = user.ownerId ?? user.id;

    const task = await (db as any).task.create({
      data: {
        ownerId,
        assignedToId: parsed.assignedToId,
        assignedToName: parsed.assignedToName ?? null,
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

    return { success: true, data: tasks.map(toTaskData) };
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
): Promise<{ success: boolean; message: string }> {
  try {
    await getAuth();
    await (db as any).task.update({
      where: { id: taskId },
      data: { status: "done", result: result || null },
    });
    return { success: true, message: "Tarea completada." };
  } catch (error) {
    console.error("[completeTaskAction]", error);
    return { success: false, message: "Error al completar la tarea." };
  }
}

export async function cancelTaskAction(
  taskId: number,
): Promise<{ success: boolean; message: string }> {
  try {
    await getAuth();
    await (db as any).task.update({
      where: { id: taskId },
      data: { status: "cancelled" },
    });
    return { success: true, message: "Tarea cancelada." };
  } catch (error) {
    console.error("[cancelTaskAction]", error);
    return { success: false, message: "Error al cancelar la tarea." };
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
