"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { writeAuditLog } from "@/actions/audit-log-actions";
import { PROJECT_STATUSES, type ProjectData } from "@/lib/project-types";
import type { TaskData, TaskStatus } from "@/lib/task-types";

type Result<T> = { success: boolean; message: string; data?: T };

/**
 * Los proyectos son de la CUENTA, no de la persona: igual que las tareas, para
 * que un asesor vea los de su equipo y no se le queden invisibles al cambiar
 * quién los creó.
 */
async function getAuth() {
  const user = await currentUser();
  if (!user?.id) throw new Error("No autorizado.");
  return { user, ownerId: user.ownerId ?? user.id };
}

/** El proyecto existe y es de esta cuenta. Devuelve el id validado. */
async function assertOwnProject(projectId: number, ownerId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, ownerId },
    select: { id: true, name: true },
  });
  if (!project) throw new Error("Proyecto no encontrado.");
  return project;
}

function toProjectData(
  project: {
    id: number;
    name: string;
    description: string | null;
    status: string;
    leadId: string | null;
    dueDate: Date | null;
    createdAt: Date;
    members: { userId: string }[];
    tasks: { status: string }[];
  },
  people: Map<string, { name: string | null; email: string | null }>,
): ProjectData {
  const taskCounts: Record<string, number> = {};
  for (const task of project.tasks) {
    taskCounts[task.status] = (taskCounts[task.status] ?? 0) + 1;
  }

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: (project.status as ProjectData["status"]) ?? "activo",
    leadId: project.leadId,
    leadName: project.leadId
      ? people.get(project.leadId)?.name ?? people.get(project.leadId)?.email ?? null
      : null,
    dueDate: project.dueDate?.toISOString() ?? null,
    members: project.members.map((member) => ({
      userId: member.userId,
      name: people.get(member.userId)?.name ?? null,
      email: people.get(member.userId)?.email ?? null,
    })),
    taskCounts,
    createdAt: project.createdAt.toISOString(),
  };
}

/** Nombres y correos de un puñado de ids, en una sola consulta. */
async function loadPeople(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map<string, { name: string | null; email: string | null }>();

  const users = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  });

  return new Map(users.map((u) => [u.id, { name: u.name, email: u.email }]));
}

export async function listProjectsAction(): Promise<Result<ProjectData[]>> {
  try {
    const { ownerId } = await getAuth();

    const projects = await db.project.findMany({
      where: { ownerId },
      include: {
        members: { select: { userId: true } },
        tasks: { select: { status: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    const people = await loadPeople(
      projects.flatMap((p) => [p.leadId ?? "", ...p.members.map((m) => m.userId)]),
    );

    return {
      success: true,
      message: "Proyectos cargados.",
      data: projects.map((p) => toProjectData(p, people)),
    };
  } catch (error) {
    console.error("[listProjectsAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudieron cargar los proyectos.",
    };
  }
}

const upsertSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  description: z.string().trim().nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  leadId: z.string().trim().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  memberIds: z.array(z.string().trim().min(1)).optional(),
});

export async function saveProjectAction(
  input: z.infer<typeof upsertSchema>,
): Promise<Result<ProjectData>> {
  try {
    const { user, ownerId } = await getAuth();
    const parsed = upsertSchema.parse(input);

    const base = {
      name: parsed.name,
      description: parsed.description?.trim() || null,
      status: parsed.status ?? "activo",
      leadId: parsed.leadId?.trim() || null,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
    };

    let projectId: number;

    if (parsed.id) {
      await assertOwnProject(parsed.id, ownerId);
      await db.project.update({ where: { id: parsed.id }, data: base });
      projectId = parsed.id;
    } else {
      const created = await db.project.create({
        data: { ...base, ownerId, createdById: user.id },
      });
      projectId = created.id;
    }

    // Los miembros se reemplazan por completo cuando vienen en la petición.
    // Se omiten en un guardado que solo toca los datos del proyecto.
    if (parsed.memberIds) {
      await db.$transaction([
        db.projectMember.deleteMany({ where: { projectId } }),
        db.projectMember.createMany({
          data: parsed.memberIds.map((userId) => ({ projectId, userId })),
          skipDuplicates: true,
        }),
      ]);
    }

    await writeAuditLog({
      userId: ownerId,
      actorId: user.id,
      entityType: "project",
      entityId: String(projectId),
      action: parsed.id ? "updated" : "created",
      summary: `${parsed.id ? "Actualizo" : "Creo"} el proyecto "${parsed.name}"`,
      metadata: { status: base.status },
    }).catch(() => {});

    revalidatePath("/proyectos");

    const saved = await db.project.findFirstOrThrow({
      where: { id: projectId },
      include: {
        members: { select: { userId: true } },
        tasks: { select: { status: true } },
      },
    });
    const people = await loadPeople([saved.leadId ?? "", ...saved.members.map((m) => m.userId)]);

    return {
      success: true,
      message: parsed.id ? "Proyecto actualizado." : "Proyecto creado.",
      data: toProjectData(saved, people),
    };
  } catch (error) {
    console.error("[saveProjectAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo guardar el proyecto.",
    };
  }
}

export async function deleteProjectAction(projectId: number): Promise<Result<null>> {
  try {
    const { user, ownerId } = await getAuth();
    const project = await assertOwnProject(projectId, ownerId);

    // Las tareas NO se borran: la migración las deja sueltas (ON DELETE SET
    // NULL). Perder trabajo es peor que dejar una tarea sin proyecto.
    await db.project.delete({ where: { id: projectId } });

    await writeAuditLog({
      userId: ownerId,
      actorId: user.id,
      entityType: "project",
      entityId: String(projectId),
      action: "deleted",
      summary: `Elimino el proyecto "${project.name}"`,
    }).catch(() => {});

    revalidatePath("/proyectos");
    return { success: true, message: "Proyecto eliminado. Sus tareas siguen en Tareas." };
  } catch (error) {
    console.error("[deleteProjectAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo eliminar el proyecto.",
    };
  }
}

/** Tareas de un proyecto, para pintar el tablero. */
export async function getProjectTasksAction(projectId: number): Promise<Result<TaskData[]>> {
  try {
    const { ownerId } = await getAuth();
    await assertOwnProject(projectId, ownerId);

    const tasks = await db.task.findMany({
      where: { projectId, ownerId },
      orderBy: [{ dueDate: "asc" }],
    });

    return {
      success: true,
      message: "Tareas cargadas.",
      data: tasks.map((t) => ({
        id: t.id,
        ownerId: t.ownerId,
        assignedToId: t.assignedToId,
        assignedToName: t.assignedToName,
        assignedToPhone: null,
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
      })),
    };
  } catch (error) {
    console.error("[getProjectTasksAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudieron cargar las tareas.",
    };
  }
}

const editTaskSchema = z.object({
  taskId: z.number().int().positive(),
  title: z.string().trim().min(1, "La tarea necesita un título."),
  type: z.string().trim().min(1),
  dueDate: z.string().min(1),
  assignedToId: z.string().trim().min(1),
});

/**
 * Editar una tarjeta del tablero. El estado no se toca aquí: para eso está
 * arrastrarla de columna (moveProjectTaskAction).
 */
export async function updateProjectTaskAction(
  input: z.infer<typeof editTaskSchema>,
): Promise<Result<null>> {
  try {
    const { ownerId } = await getAuth();
    const parsed = editTaskSchema.parse(input);

    // El nombre se guarda junto a la tarea (como en createTaskAction) para que
    // la tarjeta siga diciendo quién es aunque esa persona salga del equipo.
    const assignee = await db.user.findUnique({
      where: { id: parsed.assignedToId },
      select: { name: true, email: true },
    });

    const updated = await db.task.updateMany({
      where: { id: parsed.taskId, ownerId },
      data: {
        title: parsed.title,
        type: parsed.type,
        dueDate: new Date(parsed.dueDate),
        assignedToId: parsed.assignedToId,
        assignedToName: assignee?.name ?? assignee?.email ?? null,
      },
    });
    if (updated.count === 0) throw new Error("Tarea no encontrada.");

    revalidatePath("/proyectos");
    return { success: true, message: "Tarea actualizada." };
  } catch (error) {
    console.error("[updateProjectTaskAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo guardar la tarea.",
    };
  }
}

const moveSchema = z.object({
  taskId: z.number().int().positive(),
  status: z.enum(["pending", "in_progress", "in_review", "done", "cancelled"]),
});

/** Arrastrar una tarjeta de columna: solo cambia el estado. */
export async function moveProjectTaskAction(
  input: z.infer<typeof moveSchema>,
): Promise<Result<null>> {
  try {
    const { ownerId } = await getAuth();
    const parsed = moveSchema.parse(input);

    const updated = await db.task.updateMany({
      where: { id: parsed.taskId, ownerId },
      data: { status: parsed.status },
    });
    if (updated.count === 0) throw new Error("Tarea no encontrada.");

    revalidatePath("/proyectos");
    return { success: true, message: "Tarea actualizada." };
  } catch (error) {
    console.error("[moveProjectTaskAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo mover la tarea.",
    };
  }
}
