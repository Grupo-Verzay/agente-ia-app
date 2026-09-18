"use server";

import { z } from "zod";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { laPersonaQueActua as laPersona } from "@/lib/chat-de-equipo";
import { assertCanAccessTargetUser } from "@/actions/billing/helpers/app-access-guard";
import { writeAuditLog } from "@/actions/audit-log-actions";
import { olvidarLosAdjuntosDe } from "@/lib/adjuntos-de-tarea";
import { guardarElDetalle, olvidarElDetalleDe } from "@/lib/detalle-de-tarea";
import { alFinalDelTablero, olvidarLaTarjeta } from "@/lib/orden-de-tablero-db";
import { olvidarElHiloDe } from "@/lib/avisos-de-tarea";
import { avisarDeLaTarea } from "@/lib/avisar-de-la-tarea";
import { registrarElCierre } from "@/actions/trabajo-de-tarea-actions";

import type { TaskData, TaskStatus } from "@/lib/task-types";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { accesoAlProyecto } from "@/lib/acceso-al-proyecto";

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
  /**
   * El «Qué hay que hacer»: el texto largo, que vive en `task_details` y no en
   * `tasks` —del backend—. Opcional: las tareas que se crean desde Chats, los
   * seguimientos y las promesas del cliente no lo traen y no lo necesitan.
   */
  detalle: z.string().optional(),
  type: z.string().min(1),
  dueDate: z.string().min(1),
  sendWhatsApp: z.boolean().optional(),
  /** Proyecto al que pertenece. Sin esto la tarea nace suelta, como siempre. */
  projectId: z.number().int().positive().optional(),
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
    let ownerId = user.ownerId ?? user.id;

    // Dentro de un proyecto manda quien lleve ESE proyecto: quien gestiona la
    // cuenta, y quien lo creó. Fuera de proyectos las tareas siguen igual que
    // siempre, que es como funcionaba antes de que existieran.
    if (parsed.projectId) {
      const acceso = await accesoAlProyecto(user, ownerId, parsed.projectId);
      if (!acceso || !acceso.puedeTrabajar) {
        return {
          success: false,
          message: "Solo quien lleva el proyecto o un administrador puede crear sus tareas.",
        };
      }
      // **La tarea cuelga de la cuenta DUEÑA del proyecto**, no de quien la
      // escribe. En un proyecto compartido, guardarla bajo la cuenta invitada la
      // dejaría fuera del tablero de las dos: el dueño no la vería —su tablero
      // pide las de su cuenta— y la invitada tampoco, porque el tablero es el
      // del proyecto. Un proyecto, un juego de tareas.
      ownerId = acceso.ownerId;
    }
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
        createdById: laPersona(user).id,
        projectId: parsed.projectId ?? null,
      },
    });

    // El texto largo, en nuestra tabla. Va antes de avisar: el aviso lleva el
    // título, así que no depende de esto, pero la tarjeta que se refresca justo
    // después sí — sin ello se abriría sin su detalle y parecería perdido.
    await guardarElDetalle({ taskId: task.id, ownerId, detalle: parsed.detalle });

    // Una tarjeta nueva entra al FINAL de su columna, nunca arriba: colarse por
    // delante pisaría el orden que puso alguien a mano. Solo si es de un
    // proyecto — sin tablero no hay columna en la que ponerse.
    if (task.projectId) {
      await alFinalDelTablero("proyecto", String(task.projectId), String(task.id));
    }

    // Automatizaciones por tipo de tarea (requieren sesión para el contexto de envío)
    if (parsed.sessionId) void triggerTaskTypeAutomations(parsed.sessionId, parsed.type);

    // Al asignársela a otra persona, le salta en pantalla esté donde esté. Esto
    // no puede tumbar la creación —la tarea ya existe— y por eso `avisarDeLaTarea`
    // no lanza; lo que sí hace es dejar dicho en la consola cuando no sale.
    await avisarDeLaTarea({
      tipo: "asignada",
      tarea: {
        id: task.id,
        projectId: task.projectId ?? null,
        ownerId,
        title: task.title,
        assignedToId: task.assignedToId,
        createdById: task.createdById,
      },
      actorId: laPersona(user).id,
      actorNombre: laPersona(user).nombre,
    });

    await writeAuditLog({
      userId: ownerId,
      actorId: laPersona(user).id,
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

    // Pedia sesion iniciada, pero no comprobaba que la conversacion fuera de
    // una cuenta sobre la que se manda: con el id de una conversacion ajena
    // se leian sus tareas (H02 de la auditoria del 2026-09-06). Se mira de
    // quien es la conversacion y se aplica la regla de acceso de siempre.
    const conversacion = await db.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!conversacion?.userId) {
      return { success: false, message: "Conversación no encontrada." };
    }
    await assertCanAccessTargetUser(conversacion.userId);

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
  /**
   * Cuánto costó, ya en minutos. **Obligatorio**, y se comprueba aquí y no
   * solo en el formulario: sin esto la tarea se podría cerrar desde otro sitio
   * sin tiempo, y una tarea cerrada sin tiempo ya no se puede recuperar —nadie
   * vuelve a abrirla para apuntarlo—, así que el reparto quedaría corto para
   * siempre y sin decir por qué.
   */
  minutosDeTrabajo?: number,
): Promise<{ success: boolean; message: string; data?: { nextTask?: TaskData } }> {
  try {
    const user = await getAuth();
    const ownerId = user.ownerId ?? user.id;

    if (!Number.isFinite(minutosDeTrabajo) || (minutosDeTrabajo ?? 0) <= 0) {
      return { success: false, message: "Registra cuánto tiempo tomó la tarea." };
    }
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
          createdById: laPersona(user).id,
        },
      });
    });

    // El tiempo y QUIÉN cerró. Va después de la transacción a propósito: la
    // tarea ya está cerrada y esto no puede deshacerlo, así que no se mete
    // dentro para no arriesgar el cierre por una tabla de la App. No es mudo:
    // `registrarElCierre` avisa si falla.
    await registrarElCierre({
      taskId,
      ownerId,
      minutos: minutosDeTrabajo as number,
      cerradaPorId: laPersona(user).id,
      cerradaPorNombre: laPersona(user).nombre,
    });

    // Dada por hecha: le salta a quien la creó, que es quien tiene que avisarle
    // al cliente. Va con la tarea tal como estaba ANTES de cerrarla, que es de
    // donde salen su autor y su proyecto.
    await avisarDeLaTarea({
      tipo: "hecha",
      tarea: {
        id: currentTask.id,
        projectId: currentTask.projectId ?? null,
        ownerId,
        title: currentTask.title,
        assignedToId: currentTask.assignedToId,
        createdById: currentTask.createdById,
      },
      actorId: laPersona(user).id,
      actorNombre: laPersona(user).nombre,
      texto: result || null,
    });

    await writeAuditLog({
      userId: ownerId,
      actorId: laPersona(user).id,
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
        actorId: laPersona(user).id,
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
      actorId: laPersona(user).id,
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
      // `projectId` hace falta para limpiar su sitio en el tablero: la llave de
      // `orden_en_tablero` es el proyecto, no la cuenta.
      select: { title: true, projectId: true },
    });
    const result = await (db as any).task.deleteMany({
      where: { id: taskId, ownerId },
    });
    if (result.count === 0) return { success: false, message: "No se encontro la tarea." };

    // Sus archivos se van con ella. No hay clave foranea -`tasks` es del
    // backend- asi que la limpieza es explicita, y esta funcion no revienta:
    // si fallara, lo peor son unas filas huerfanas que nadie lee.
    await olvidarLosAdjuntosDe(taskId);
    // Y su hilo de comentarios y sus avisos, por lo mismo: sin avisos huérfanos
    // no salta una ventana emergente por una tarea que ya no existe.
    await olvidarElHiloDe(taskId);
    // Y su texto largo, por lo mismo.
    await olvidarElDetalleDe(taskId);
    // Y su sitio en el tablero. Sin esto, una tarea nueva podría heredar el
    // número de una borrada y aparecer donde estaba aquella.
    if (task?.projectId) await olvidarLaTarjeta("proyecto", String(task.projectId), String(taskId));

    await writeAuditLog({
      userId: ownerId,
      actorId: laPersona(user).id,
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
