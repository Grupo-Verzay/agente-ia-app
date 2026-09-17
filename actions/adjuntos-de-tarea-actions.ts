"use server";

import { z } from "zod";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { accesoAlProyecto } from "@/lib/acceso-al-proyecto";
import {
  contarLosAdjuntos,
  guardarUnAdjunto,
  quitarUnAdjunto,
} from "@/lib/adjuntos-de-tarea";
import {
  TIPOS_DE_ADJUNTO,
  TOPE_DE_ADJUNTOS_POR_TAREA,
  type AdjuntoDeTarea,
} from "@/lib/adjuntos-de-tarea-tipos";

/**
 * Adjuntar y quitar archivos de una tarea del tablero.
 *
 * ## La puerta es la MISMA que la de editar la tarea
 *
 * Adjuntar un archivo es editar la tarea, asi que pasa por la misma condicion
 * que `updateProjectTaskAction`: quien lleva el proyecto, o un administrador de
 * la cuenta si la tarea es suelta. Escribir aqui una condicion propia es como
 * se acabo teniendo un chat que se podia anclar y no se podia borrar.
 */

type Result<T> = { success: boolean; message: string; data?: T };

const adjuntarSchema = z.object({
  taskId: z.number().int().positive(),
  url: z.string().trim().url("La direccion del archivo no es valida."),
  nombre: z.string().trim().min(1).max(300),
  tipo: z.enum(TIPOS_DE_ADJUNTO),
  mimeType: z.string().trim().max(200).optional(),
  tamanoBytes: z.number().int().nonnegative().optional(),
});

/**
 * Comprueba que se puede tocar ESTA tarea, y devuelve de quien es.
 *
 * Copia exacta de la condicion de `updateProjectTaskAction`: se resuelve el
 * dueño desde la propia tarea, no desde lo que llegue del navegador. En un
 * proyecto compartido eso significa la cuenta DUEÑA del proyecto, que es de
 * quien cuelgan sus tareas — y sus archivos con ellas.
 */
async function puedeTocarLaTarea(taskId: number) {
  const user = await currentUser();
  if (!user?.id) throw new Error("No autorizado.");
  const suCuenta = user.ownerId ?? user.id;

  const tarea = await db.task.findFirst({
    where: { id: taskId },
    select: { ownerId: true, projectId: true },
  });
  if (!tarea) throw new Error("Tarea no encontrada.");

  if (tarea.projectId) {
    const acceso = await accesoAlProyecto(user, suCuenta, tarea.projectId);
    if (!acceso || acceso.ownerId !== tarea.ownerId) throw new Error("Tarea no encontrada.");
    if (!acceso.puedeTrabajar) {
      throw new Error("Solo quien lleva el proyecto o un administrador puede editar sus tareas.");
    }
  } else {
    if (tarea.ownerId !== suCuenta) throw new Error("Tarea no encontrada.");
    if (!canManageWorkspace(user)) {
      throw new Error("Solo quien lleva el proyecto o un administrador puede editar sus tareas.");
    }
  }

  return { user, ownerId: tarea.ownerId };
}

export async function adjuntarArchivoATareaAction(
  input: z.infer<typeof adjuntarSchema>,
): Promise<Result<AdjuntoDeTarea>> {
  try {
    const parsed = adjuntarSchema.parse(input);
    const { user, ownerId } = await puedeTocarLaTarea(parsed.taskId);

    // El tope se comprueba AQUI y no solo en la pantalla: el navegador puede
    // mandar lo que quiera, y sin esto la tabla crece sin freno.
    const cuantos = await contarLosAdjuntos(parsed.taskId);
    if (cuantos >= TOPE_DE_ADJUNTOS_POR_TAREA) {
      throw new Error(`Una tarea admite hasta ${TOPE_DE_ADJUNTOS_POR_TAREA} archivos.`);
    }

    const adjunto: AdjuntoDeTarea = {
      id: randomUUID(),
      taskId: parsed.taskId,
      url: parsed.url,
      nombre: parsed.nombre,
      tipo: parsed.tipo,
      mimeType: parsed.mimeType ?? null,
      tamanoBytes: parsed.tamanoBytes ?? null,
      creadoEn: new Date().toISOString(),
    };

    await guardarUnAdjunto({ ...adjunto, ownerId, creadoPorId: user.id });
    revalidatePath("/proyectos");

    return { success: true, message: "Archivo adjuntado.", data: adjunto };
  } catch (error) {
    console.error("[adjuntarArchivoATareaAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo adjuntar el archivo.",
    };
  }
}

export async function quitarAdjuntoDeTareaAction(input: {
  taskId: number;
  adjuntoId: string;
}): Promise<Result<null>> {
  try {
    const taskId = z.number().int().positive().parse(input.taskId);
    const adjuntoId = z.string().trim().min(1).parse(input.adjuntoId);
    const { ownerId } = await puedeTocarLaTarea(taskId);

    const quitados = await quitarUnAdjunto(adjuntoId, ownerId);
    if (quitados === 0) throw new Error("Ese archivo ya no estaba.");

    revalidatePath("/proyectos");
    return { success: true, message: "Archivo quitado.", data: null };
  } catch (error) {
    console.error("[quitarAdjuntoDeTareaAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo quitar el archivo.",
    };
  }
}
