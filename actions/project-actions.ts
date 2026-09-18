"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { laPersonaQueActua as laPersona } from "@/lib/chat-de-equipo";
import { writeAuditLog } from "@/actions/audit-log-actions";
import { PROJECT_STATUSES, type ProjectData } from "@/lib/project-types";
import { isTaskOpen, type TaskData, type TaskStatus } from "@/lib/task-types";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { filtroDeProyectosVisibles, mandaEnElProyecto } from "@/lib/project-roles";
import { accesoAlProyecto } from "@/lib/acceso-al-proyecto";
import {
  alFinalDelTablero,
  olvidarLaTarjeta,
  posicionesDelTablero,
} from "@/lib/orden-de-tablero-db";
import { cuentasParaCompartir } from "@/lib/cuentas-cliente";
import { apuntarLoQueHizo } from "@/lib/apuntar-actividad";
import {
  comoPermiso,
  conCuantasCuentasSeComparten,
  guardarLosDestinosDelProyecto,
  losDestinosDelProyecto,
  losProyectosQueMeComparten,
  olvidarLosCompartidosDe,
  type PermisoDeProyecto,
} from "@/lib/proyectos-compartidos";
import { leerLosAdjuntos } from "@/lib/adjuntos-de-tarea";
import { detallesDeLasTareas, guardarElDetalle } from "@/lib/detalle-de-tarea";
import { tareasConAlgoSinVer } from "@/lib/avisos-de-tarea";
import { avisarDeLaTarea } from "@/lib/avisar-de-la-tarea";
import {
  leerLosClientesDeLasTareas,
  registrarElCierre,
} from "@/actions/trabajo-de-tarea-actions";

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

/** Como `mandaEnElProyecto`, pero cortando con un mensaje si la respuesta es no. */
async function requireProjectManager(projectId: number) {
  const auth = await getAuth();
  if (!(await mandaEnElProyecto(auth.user, auth.ownerId, projectId))) {
    throw new Error("Solo quien creó el proyecto o un administrador puede modificarlo.");
  }
  return auth;
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
    createdById: string;
    members: { userId: string }[];
    tasks: { status: string; dueDate: Date }[];
  },
  people: Map<string, { name: string | null; email: string | null }>,
  /** Quien mira: para decir, proyecto a proyecto, si lo lleva él. */
  quienMira: { id: string; gestionaLaCuenta: boolean },
  /**
   * Lo que cambia entre uno propio y uno que otra cuenta nos enseña. Por
   * defecto, uno propio sin compartir: así los sitios que ya llamaban a esto no
   * tienen que saber de compartidos.
   */
  compartir: {
    recibido: boolean;
    puedeEditarTareas: boolean;
    compartidoCon: number;
    deLaCuenta: string | null;
  } = { recibido: false, puedeEditarTareas: true, compartidoCon: 0, deLaCuenta: null },
): ProjectData {
  const taskCounts: Record<string, number> = {};
  const now = Date.now();
  let overdueTasks = 0;
  for (const task of project.tasks) {
    taskCounts[task.status] = (taskCounts[task.status] ?? 0) + 1;
    if (isTaskOpen(task.status) && task.dueDate.getTime() < now) overdueTasks += 1;
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
    overdueTasks,
    createdAt: project.createdAt.toISOString(),
    createdById: project.createdById,
    // El nombre de quien lo creó. El id ya estaba; lo que faltaba era
    // resolverlo, porque `loadPeople` solo miraba al responsable y a los
    // miembros. Sin esto, el administrador ve proyectos de agentes y no sabe
    // de quién son.
    createdByName:
      people.get(project.createdById)?.name ??
      people.get(project.createdById)?.email ??
      null,
    // En uno recibido no manda nadie de esta cuenta: ni se edita, ni se borra,
    // ni se reparte a más cuentas.
    puedeGestionar:
      !compartir.recibido &&
      (quienMira.gestionaLaCuenta || project.createdById === quienMira.id),
    recibido: compartir.recibido,
    puedeEditarTareas: compartir.puedeEditarTareas,
    compartidoCon: compartir.compartidoCon,
    deLaCuenta: compartir.deLaCuenta,
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
    const { user, ownerId } = await getAuth();
    const quienMira = { id: user.id, gestionaLaCuenta: canManageWorkspace(user) };

    const incluir = {
      members: { select: { userId: true } },
      tasks: { select: { status: true, dueDate: true } },
    } as const;

    // Dos grupos, como en Diagramas: los de esta cuenta y los que otra cuenta le
    // está enseñando.
    //
    // Los recibidos **no pasan por `filtroDeProyectosVisibles`**, y es a
    // propósito: ese filtro reparte dentro de un equipo por `createdById`,
    // `leadId` y miembros, y en un proyecto de otra cuenta ninguna de esas
    // personas es de aquí — se quedaría fuera siempre. Lo que se compartió es
    // «a esta cuenta», así que lo ve la cuenta.
    const compartidos = await losProyectosQueMeComparten(ownerId);
    const idsRecibidos = [...compartidos.keys()];

    const [propios, recibidos] = await Promise.all([
      db.project.findMany({
        // Los de la cuenta, pero solo los que tienen que ver con quien mira: un
        // agente ve los suyos, no el trabajo entero de su dueño.
        where: { ownerId, ...filtroDeProyectosVisibles(user) },
        include: incluir,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      }),
      idsRecibidos.length
        ? db.project.findMany({
            // `ownerId: { not: ownerId }` y no solo el id: si un proyecto propio
            // acabara con una fila de compartido apuntando a su propia cuenta,
            // saldría dos veces en la lista.
            where: { id: { in: idsRecibidos }, ownerId: { not: ownerId } },
            include: incluir,
            orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          })
        : Promise.resolve([]),
    ]);

    // Con cuántas cuentas comparto cada uno de los MÍOS: es lo que pinta el
    // sello de la tarjeta. Una sola consulta agrupada, no una por tarjeta.
    const [people, compartidoCon] = await Promise.all([
      loadPeople([
        ...propios.flatMap((p) => [p.leadId ?? "", p.createdById, ...p.members.map((m) => m.userId)]),
        ...recibidos.flatMap((p) => [p.leadId ?? "", p.createdById, ...p.members.map((m) => m.userId)]),
        // De quién es cada proyecto recibido. Sin esto, en la cuenta invitada
        // salen proyectos sin decir de dónde vienen.
        ...recibidos.map((p) => p.ownerId),
      ]),
      conCuantasCuentasSeComparten(propios.map((p) => p.id)),
    ]);

    const nombreDeCuenta = (id: string) =>
      people.get(id)?.name ?? people.get(id)?.email ?? null;

    return {
      success: true,
      message: "Proyectos cargados.",
      data: [
        ...propios.map((p) =>
          toProjectData(p, people, quienMira, {
            recibido: false,
            // En uno propio, tocar el tablero es lo que ya decidía quién manda
            // en el proyecto: no cambia nada de lo que había.
            puedeEditarTareas:
              quienMira.gestionaLaCuenta || p.createdById === quienMira.id,
            compartidoCon: compartidoCon.get(p.id) ?? 0,
            deLaCuenta: null,
          }),
        ),
        ...recibidos.map((p) =>
          toProjectData(p, people, quienMira, {
            recibido: true,
            // Recibido: hace falta permiso de edición Y mandar en esta cuenta,
            // el mismo reparto que `accesoAlProyecto` comprueba en el servidor.
            puedeEditarTareas:
              compartidos.get(p.id) === "edicion" && quienMira.gestionaLaCuenta,
            compartidoCon: 0,
            deLaCuenta: nombreDeCuenta(p.ownerId),
          }),
        ),
      ],
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
    const parsed = upsertSchema.parse(input);
    // Crear: cualquiera del equipo. Editar: quien manda en ese proyecto.
    const { user, ownerId } = parsed.id
      ? await requireProjectManager(parsed.id)
      : await getAuth();

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
        tasks: { select: { status: true, dueDate: true } },
      },
    });
    const people = await loadPeople([saved.leadId ?? "", ...saved.members.map((m) => m.userId)]);

    return {
      success: true,
      message: parsed.id ? "Proyecto actualizado." : "Proyecto creado.",
      data: toProjectData(saved, people, {
        id: user.id,
        gestionaLaCuenta: canManageWorkspace(user),
      }),
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
    const { user, ownerId } = await requireProjectManager(projectId);
    const project = await assertOwnProject(projectId, ownerId);

    // Las tareas NO se borran: la migración las deja sueltas (ON DELETE SET
    // NULL). Perder trabajo es peor que dejar una tarea sin proyecto.
    await db.project.delete({ where: { id: projectId } });

    // Y con quién se compartía se va con él. No hay clave foránea —la tabla es
    // de la App y `projects` del backend—, así que la limpieza es explícita y
    // no puede tumbar el borrado.
    await olvidarLosCompartidosDe(projectId);

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
    const { user, ownerId } = await getAuth();
    // Con el id a mano se pedía el tablero de cualquier proyecto de la cuenta.
    // Se abre el que se puede ver, y eso lo decide un solo sitio: uno propio
    // según la privacidad del equipo, uno recibido según su permiso.
    const acceso = await accesoAlProyecto(user, ownerId, projectId);
    if (!acceso) throw new Error("Proyecto no encontrado.");

    // Las tareas cuelgan de la cuenta DUEÑA del proyecto, no de quien mira: en
    // uno compartido las dos cuentas ven exactamente las mismas tarjetas. Con
    // el `ownerId` de quien mira, la cuenta invitada abriría el tablero vacío.
    const tasks = await db.task.findMany({
      where: { projectId, ownerId: acceso.ownerId },
      orderBy: [{ dueDate: "asc" }],
    });

    // Los adjuntos de TODAS las tareas en una consulta, no una por tarjeta.
    // Y lo mismo con el punto de «algo sin ver»: las dos por lista, o un tablero
    // de treinta tarjetas serían sesenta consultas.
    // Y la cuenta de cada tarea, por lo mismo: una consulta para la lista, no
    // una por tarjeta.
    // Y el detalle —el texto largo que antes vivía dentro de `title`— por lo
    // mismo: una consulta para la lista, no una por tarjeta.
    // Y las posiciones del tablero, por lo mismo: una consulta para el tablero
    // entero. La llave es el PROYECTO y no la cuenta que mira, así que en uno
    // compartido las dos cuentas ven las tarjetas en el mismo orden — es un
    // tablero, no dos.
    const [adjuntos, sinVer, clientes, detalles, posiciones] = await Promise.all([
      leerLosAdjuntos(tasks.map((t) => t.id)),
      tareasConAlgoSinVer(tasks.map((t) => t.id), laPersona(user).id),
      // También por la cuenta dueña: `task_work` se escribe bajo ella.
      leerLosClientesDeLasTareas(acceso.ownerId, tasks.map((t) => t.id)),
      detallesDeLasTareas(tasks.map((t) => t.id)),
      posicionesDelTablero("proyecto", String(projectId)),
    ]);

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
        adjuntos: adjuntos.get(t.id) ?? [],
        // Sin fila es una tarea de antes de que esto existiera: su texto largo
        // sigue dentro de `title` y la tarjeta enseña su primera línea.
        detalle: detalles[t.id] ?? null,
        tieneAlgoSinVer: sinVer.has(t.id),
        clienteId: clientes[t.id]?.clienteId ?? null,
        tipoDeTrabajo: clientes[t.id]?.tipoDeTrabajo ?? null,
        // Sin fila significa «nunca se colocó», y eso es lo que la deja salir
        // con las de antes en vez de inventarle un sitio.
        posicion: posiciones[String(t.id)] ?? null,
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
  /** El «Qué hay que hacer». Vacío borra el que hubiera, no deja uno en blanco. */
  detalle: z.string().optional(),
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
    const { user, ownerId } = await getAuth();
    const parsed = editTaskSchema.parse(input);

    // Editar la tarjeta de un proyecto va con el proyecto: quien lo lleva puede,
    // aunque no sea administrador de la cuenta.
    //
    // La tarea se busca **sin acotar por cuenta**: en un proyecto compartido las
    // tareas cuelgan de la cuenta dueña, así que con `ownerId` la invitada no
    // encontraría ninguna. Quién puede tocarla lo decide `accesoAlProyecto` una
    // línea más abajo, que es la puerta de verdad.
    const tarea = await db.task.findFirst({
      where: { id: parsed.taskId },
      select: { id: true, ownerId: true, projectId: true, assignedToId: true, createdById: true },
    });
    if (!tarea) throw new Error("Tarea no encontrada.");

    let puede: boolean;
    if (tarea.projectId) {
      const acceso = await accesoAlProyecto(user, ownerId, tarea.projectId);
      // Que la tarea sea de la misma cuenta que su proyecto se comprueba: sin
      // eso, un id de tarea de otra cuenta con un `projectId` compartido
      // pasaría la puerta.
      puede = !!acceso && acceso.ownerId === tarea.ownerId && acceso.puedeTrabajar;
    } else {
      puede = tarea.ownerId === ownerId && canManageWorkspace(user);
    }
    if (!puede) {
      throw new Error("Solo quien lleva el proyecto o un administrador puede editar sus tareas.");
    }

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

    // El detalle va bajo la cuenta DUEÑA de la tarea, no bajo la de quien
    // edita: en un proyecto compartido las tareas cuelgan de la dueña, y con
    // la otra el texto quedaría archivado en una cuenta y la tarea en otra.
    await guardarElDetalle({
      taskId: parsed.taskId,
      ownerId: tarea.ownerId,
      detalle: parsed.detalle,
    });

    // Cambiar de responsable ES asignar. Sin esto, la persona a la que le pasan
    // una tarea ya empezada no se entera de nada, que es el mismo caso.
    if (parsed.assignedToId !== tarea.assignedToId) {
      await avisarDeLaTarea({
        tipo: "asignada",
        tarea: {
          id: tarea.id,
          projectId: tarea.projectId,
          ownerId,
          title: parsed.title,
          assignedToId: parsed.assignedToId,
          createdById: tarea.createdById,
        },
        actorId: laPersona(user).id,
        actorNombre: laPersona(user).nombre,
      });
    }

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
  /**
   * Cuánto costó, ya en minutos. Solo tiene sentido al mover a «Hecho», y ahí
   * es **obligatorio**: arrastrar a esa columna es cerrar la tarea igual que el
   * botón de Tareas, y si este camino no lo pidiera bastaría con arrastrar para
   * saltarse el registro — y entonces el reparto cuenta unas tareas sí y otras
   * no, que es peor que no contarlas.
   */
  minutosDeTrabajo: z.number().int().positive().optional(),
});

/** Arrastrar una tarjeta de columna: solo cambia el estado. */
export async function moveProjectTaskAction(
  input: z.infer<typeof moveSchema>,
): Promise<Result<null>> {
  try {
    const { user, ownerId } = await getAuth();
    const parsed = moveSchema.parse(input);

    // Se comprueba ANTES de mover: si se moviera primero, una tarea sin tiempo
    // quedaría cerrada y ya no hay forma de pedírselo a nadie.
    if (parsed.status === "done" && !parsed.minutosDeTrabajo) {
      throw new Error("Registra cuánto tiempo tomó la tarea.");
    }

    // De qué proyecto es, para saber bajo qué cuenta cuelga: en uno compartido
    // las tareas son de la cuenta dueña, no de quien las mueve.
    const deQuienEs = await db.task.findFirst({
      where: { id: parsed.taskId },
      select: { ownerId: true, projectId: true },
    });
    if (!deQuienEs) throw new Error("Tarea no encontrada.");

    let cuentaDeLaTarea = ownerId;
    if (deQuienEs.ownerId !== ownerId) {
      // No es de esta cuenta: solo pasa si viene de un proyecto que nos
      // comparten con permiso de edición. El id que llega del navegador no
      // decide nada.
      const acceso = deQuienEs.projectId
        ? await accesoAlProyecto(user, ownerId, deQuienEs.projectId)
        : null;
      if (!acceso || acceso.ownerId !== deQuienEs.ownerId || !acceso.puedeTrabajar) {
        throw new Error("Tarea no encontrada.");
      }
      cuentaDeLaTarea = acceso.ownerId;
    }

    // Un agente participa moviendo LO SUYO. Si no fuese asi, cualquiera podria
    // dar por hecha la tarea de otro desde el tablero.
    const where = canManageWorkspace(user)
      ? { id: parsed.taskId, ownerId: cuentaDeLaTarea }
      : { id: parsed.taskId, ownerId: cuentaDeLaTarea, assignedToId: user.id };

    // Se lee ANTES de moverla, y solo cuando va a «Hecho»: el aviso necesita
    // saber quién la creó, y después del `update` ya daría igual pero sería una
    // consulta en cada arrastre, que es lo que más se hace en este tablero.
    const antes =
      parsed.status === "done"
        ? await db.task.findFirst({
            where,
            select: {
              id: true, projectId: true, title: true,
              assignedToId: true, createdById: true, status: true,
            },
          })
        : null;

    const updated = await db.task.updateMany({
      where,
      data: { status: parsed.status },
    });
    if (updated.count === 0) {
      throw new Error(
        canManageWorkspace(user)
          ? "Tarea no encontrada."
          : "Solo puedes mover las tareas que tienes asignadas.",
      );
    }

    // Arrastrarla a «Hecho» es darla por hecha, igual que el botón de Tareas:
    // le salta a quien la creó, para que pueda avisarle al cliente. Solo cuando
    // **cambia** de estado, o mover una tarjeta ya hecha volvería a avisar.
    if (antes && antes.status !== "done") {
      // Lo mismo vale para el tiempo: se sella una vez, al cerrarse de verdad.
      // Arrastrar una tarjeta que ya estaba en «Hecho» no vuelve a contar.
      await registrarElCierre({
        taskId: antes.id,
        // Bajo la cuenta DUEÑA del proyecto, y a nombre de quien lo hizo. En un
        // proyecto compartido eso significa que las horas se apuntan en el
        // «Reparto del trabajo» de la cuenta dueña —que es de quien es el
        // proyecto— con el nombre de la persona de la otra cuenta que cerró la
        // tarea. Guardarlas bajo la cuenta invitada partiría el reparto de un
        // mismo proyecto en dos mitades que nadie puede sumar.
        ownerId: cuentaDeLaTarea,
        minutos: parsed.minutosDeTrabajo as number,
        cerradaPorId: laPersona(user).id,
        cerradaPorNombre: laPersona(user).nombre,
      });
    }

    if (antes && antes.status !== "done") {
      await avisarDeLaTarea({
        tipo: "hecha",
        tarea: {
          id: antes.id,
          projectId: antes.projectId,
          ownerId: cuentaDeLaTarea,
          title: antes.title,
          assignedToId: antes.assignedToId,
          createdById: antes.createdById,
        },
        actorId: laPersona(user).id,
        actorNombre: laPersona(user).nombre,
      });
    }

    // Cambiar de columna la manda al FINAL de la nueva, nunca arriba: llegar
    // colándose por delante pisaría el orden que puso alguien a mano. No lanza
    // —la tarea ya está movida y eso manda— pero tampoco es mudo.
    if (deQuienEs.projectId) {
      await alFinalDelTablero("proyecto", String(deQuienEs.projectId), String(parsed.taskId));
    }

    // Actividad del equipo: la mueve quien la mueve, no a quién esté asignada.
    // Un administrador arrastra tarjetas de otros, así que `assignedToId`
    // mediría por quien no lo hizo — es el mismo motivo por el que `task_work`
    // guarda `cerradaPorId` y no el asignado.
    await apuntarLoQueHizo(user, "tarea_movida");

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

/* ------------------------------------------------------------------ *
 * Compartir un proyecto con otras cuentas
 * ------------------------------------------------------------------ */

export type CuentaDestinoDeProyecto = {
  id: string;
  name: string | null;
  email: string;
  company: string;
  compartido: boolean;
  /** Con qué permiso se le comparte hoy. `lectura` si aún no se le comparte. */
  permiso: PermisoDeProyecto;
};

/**
 * A qué cuentas se les puede enseñar este proyecto, y a cuáles ya.
 *
 * **Todas las cuentas de la plataforma menos la propia**, sea cual sea su rol —
 * la misma lista que usa Diagramas (`cuentasParaCompartir`), para que las dos
 * pantallas ofrezcan lo mismo. El rol no decide quién puede recibir algo
 * compartido.
 */
export async function getProjectShareTargetsAction(
  projectId: number,
): Promise<Result<CuentaDestinoDeProyecto[]>> {
  try {
    const { user, ownerId } = await getAuth();

    const acceso = await accesoAlProyecto(user, ownerId, projectId);
    if (!acceso) throw new Error("Proyecto no encontrado.");
    if (!acceso.puedeGestionar) {
      throw new Error("Solo quien creó el proyecto o un administrador puede compartirlo.");
    }

    const [cuentas, yaTiene] = await Promise.all([
      cuentasParaCompartir(ownerId),
      losDestinosDelProyecto(projectId),
    ]);

    return {
      success: true,
      message: "",
      // La propia ya la quita la consulta.
      data: cuentas
        .map((c) => ({
          ...c,
          compartido: yaTiene.has(c.id),
          permiso: yaTiene.get(c.id) ?? "lectura",
        })),
    };
  } catch (error) {
    console.error("[getProjectShareTargetsAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudieron cargar las cuentas.",
    };
  }
}

export async function setProjectSharesAction(
  projectId: number,
  destinos: Array<{ accountUserId: string; permiso: PermisoDeProyecto }>,
): Promise<Result<null>> {
  try {
    const { user, ownerId } = await getAuth();

    const acceso = await accesoAlProyecto(user, ownerId, projectId);
    if (!acceso) throw new Error("Proyecto no encontrado.");
    if (!acceso.puedeGestionar) {
      throw new Error("Solo quien creó el proyecto o un administrador puede compartirlo.");
    }

    // Solo cuentas sobre las que se manda de verdad: lo que llegue del navegador
    // no decide a quién se le enseña un proyecto. Y una entrada por cuenta —si
    // el navegador manda la misma dos veces, manda la última—.
    // La MISMA lista que se ofrece, no una más estrecha: con dos criterios, el
    // buscador ofrece cuentas que al guardar se caen sin decir por qué.
    const cuentas = await cuentasParaCompartir(ownerId);
    const suyas = new Set(cuentas.map((c) => c.id));
    const porCuenta = new Map<string, PermisoDeProyecto>();
    for (const destino of destinos) {
      if (destino.accountUserId === ownerId) continue;
      if (!suyas.has(destino.accountUserId)) continue;
      porCuenta.set(destino.accountUserId, comoPermiso(destino.permiso));
    }

    await guardarLosDestinosDelProyecto(
      projectId,
      [...porCuenta].map(([accountUserId, permiso]) => ({ accountUserId, permiso })),
      user.id,
    );

    await writeAuditLog({
      userId: ownerId,
      actorId: user.id,
      entityType: "project",
      entityId: String(projectId),
      action: "updated",
      summary: `Compartio el proyecto con ${porCuenta.size} cuenta(s)`,
      metadata: { cuentas: [...porCuenta.keys()] },
    }).catch(() => {});

    revalidatePath("/proyectos");
    return { success: true, message: "Listo." };
  } catch (error) {
    console.error("[setProjectSharesAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo guardar con quién se comparte.",
    };
  }
}
