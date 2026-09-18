"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { quienFirma } from "@/lib/chat-de-equipo";
import { accesoAlProyecto } from "@/lib/acceso-al-proyecto";
import { avisarDeLaTarea } from "@/lib/avisar-de-la-tarea";
import {
  atenderLosAvisos,
  avisosDeLaCampanita,
  avisosPorSaltar,
  guardarUnComentario,
  leerLosComentarios,
  marcarLaTareaComoVista,
} from "@/lib/avisos-de-tarea";
import {
  TOPE_DE_COMENTARIO,
  elDestinatarioDeLosAvisos,
  type AvisoDeTarea,
  type ComentarioDeTarea,
} from "@/lib/avisos-de-tarea-tipos";

/**
 * El hilo de una tarea y sus avisos, desde la pantalla.
 *
 * Todo lo que recibe un `taskId` pasa antes por `laTareaQuePuedoVer`: es la
 * regla de siempre —ninguna acción usa un id que le llega sin comprobar de
 * quién es— y aquí importa el doble, porque un comentario es texto que otras
 * personas van a leer.
 */

type Resultado<T> = { success: boolean; message: string; data?: T };

/**
 * La tarea, si esta persona puede verla. Si no, se corta.
 *
 * Dos puertas, las mismas que ya usa el tablero: si la tarea cuelga de un
 * proyecto, manda `accesoAlProyecto` —el mismo sitio que decide el tablero, así
 * que un proyecto compartido trae su hilo con él—; y si va suelta, tiene que ser
 * de MI cuenta. Sin esto, con el id a mano se leería el hilo de un proyecto en el
 * que no se está.
 */
async function laTareaQuePuedoVer(taskId: number, escribir = false) {
  const user = await currentUser();
  if (!user?.id) throw new Error("No autorizado.");
  const ownerId = user.ownerId ?? user.id;
  // Quién está sentado delante, que NO es `user.id` dentro de otra cuenta. De
  // aquí salen el autor del comentario, el actor del aviso y la marca de visto:
  // los tres se escribían con la fila efectiva y los avisos se leen con la
  // persona, así que dentro de una cuenta ajena el aviso no llegaba y el punto
  // del tablero no se quitaba nunca.
  const persona = quienFirma(user);

  // Sin acotar por cuenta: en un proyecto compartido las tareas cuelgan de la
  // cuenta dueña. Quién puede llegar a ella se decide abajo, y para una tarea
  // suelta se sigue exigiendo que sea de la propia cuenta, como siempre.
  const tarea = await db.task.findFirst({
    where: { id: taskId },
    select: {
      id: true,
      ownerId: true,
      projectId: true,
      title: true,
      assignedToId: true,
      createdById: true,
    },
  });
  if (!tarea) throw new Error("Tarea no encontrada.");

  if (tarea.projectId) {
    const acceso = await accesoAlProyecto(user, ownerId, tarea.projectId);
    if (!acceso || acceso.ownerId !== tarea.ownerId) throw new Error("Tarea no encontrada.");
    // Leer el hilo lo puede quien ve el proyecto; **escribir en uno RECIBIDO
    // de solo lectura, no**: ahí se mira y no se cambia nada, y un comentario es
    // un cambio. En uno propio no se toca nada de lo que ya había: quien ve el
    // proyecto comenta, como hasta ahora.
    if (escribir && acceso.recibido && !acceso.puedeTrabajar) {
      throw new Error("Este proyecto es de solo lectura.");
    }
  } else if (tarea.ownerId !== ownerId) {
    throw new Error("Tarea no encontrada.");
  }

  return { user, persona, ownerId: tarea.ownerId, tarea };
}

const comentarSchema = z.object({
  taskId: z.number().int().positive(),
  texto: z.string().trim().min(1, "Escribe algo.").max(TOPE_DE_COMENTARIO),
});

/**
 * Comentar dentro de la tarea.
 *
 * El comentario se guarda **antes** de avisar, y avisar no puede tumbarlo: si
 * el aviso fallara, el comentario ya está escrito y se lee al abrir la tarea.
 * Al revés sería perder lo que alguien acaba de escribir.
 */
export async function comentarLaTareaAction(
  input: z.infer<typeof comentarSchema>,
): Promise<Resultado<ComentarioDeTarea>> {
  try {
    const parsed = comentarSchema.parse(input);
    const { user, persona, ownerId, tarea } = await laTareaQuePuedoVer(parsed.taskId, true);

    const autorId = persona?.personaId ?? user.id;
    const autorNombre = persona?.nombre || user.name?.trim() || user.email || null;
    const comentario: ComentarioDeTarea = {
      id: randomUUID(),
      taskId: tarea.id,
      autorId,
      autorNombre,
      texto: parsed.texto,
      creadoEn: new Date().toISOString(),
    };

    await guardarUnComentario({
      id: comentario.id,
      taskId: tarea.id,
      ownerId,
      autorId,
      autorNombre,
      texto: parsed.texto,
    });

    await avisarDeLaTarea({
      tipo: "comentario",
      tarea,
      // El actor va con la MISMA identidad que los destinatarios, o el
      // descuento de `crearLosAvisos` no casa y uno se avisa a sí mismo.
      actorId: autorId,
      actorNombre: autorNombre,
      texto: parsed.texto,
    });

    // Quien escribe ya lo ha leído: que su propio comentario no le deje el
    // punto puesto en el tablero.
    await marcarLaTareaComoVista(tarea.id, autorId).catch(() => 0);

    return { success: true, message: "Comentario publicado.", data: comentario };
  } catch (error) {
    console.error("[comentarLaTareaAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo publicar el comentario.",
    };
  }
}

/**
 * Abrir el hilo de una tarea.
 *
 * Abrirlo **es** haberlo visto, así que de paso se quita el punto del tablero y
 * se da por atendido lo que quedara por saltar. Va después de leer y con su
 * propio `catch`: si la marca fallara, los comentarios se enseñan igual.
 */
export async function leerElHiloAction(
  taskId: number,
): Promise<Resultado<ComentarioDeTarea[]>> {
  try {
    const { user, persona, tarea } = await laTareaQuePuedoVer(taskId);
    const comentarios = await leerLosComentarios(tarea.id);

    await marcarLaTareaComoVista(tarea.id, persona?.personaId ?? user.id).catch((error) => {
      console.warn("[tareas] no se pudo marcar la tarea como vista", {
        taskId: tarea.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    });

    return { success: true, message: "Hilo cargado.", data: comentarios };
  } catch (error) {
    console.error("[leerElHiloAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo cargar el hilo.",
    };
  }
}

/**
 * Lo que tiene que saltar en pantalla ahora mismo.
 *
 * La pide el sondeo de la ventana emergente, cada pocos segundos y por pestaña
 * abierta, así que es una sola consulta por índice y no toca `tasks`.
 */
export async function avisosPorSaltarAction(): Promise<Resultado<AvisoDeTarea[]>> {
  try {
    const user = await currentUser();
    const yo = elDestinatarioDeLosAvisos(user);
    if (!yo) return { success: false, message: "No autorizado.", data: [] };
    return { success: true, message: "Avisos.", data: await avisosPorSaltar(yo) };
  } catch (error) {
    // Mudo aquí se vería como «la ventana no salta», que es el fallo original.
    console.warn("[tareas] no se pudieron leer los avisos por saltar", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, message: "No se pudieron leer los avisos.", data: [] };
  }
}

/** El historial de la campanita. Incluye lo ya atendido: nada se pierde. */
export async function avisosDeLaCampanitaAction(): Promise<Resultado<AvisoDeTarea[]>> {
  try {
    const user = await currentUser();
    const yo = elDestinatarioDeLosAvisos(user);
    if (!yo) return { success: false, message: "No autorizado.", data: [] };
    return { success: true, message: "Avisos.", data: await avisosDeLaCampanita(yo) };
  } catch (error) {
    console.warn("[tareas] no se pudo leer el historial de avisos", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, message: "No se pudo leer el historial.", data: [] };
  }
}

/**
 * El clic obligatorio de la ventana, que va por TODOS los avisos que enseñaba:
 * la ventana es una sola, agrupada, y abrir o cerrar la cierra entera.
 *
 * Marca como leído —eso es lo que se descuenta de la campanita— y no toca el
 * punto del tablero, que solo se apaga abriendo la tarea.
 */
export async function atenderLosAvisosAction(ids: string[]): Promise<Resultado<null>> {
  try {
    const user = await currentUser();
    if (!user?.id) return { success: false, message: "No autorizado." };
    // El `destinatarioId` va en el `WHERE`: sin él, con unos ids a mano se
    // callarían los avisos de otra persona.
    await atenderLosAvisos(ids, elDestinatarioDeLosAvisos(user) ?? user.id);
    return { success: true, message: "Avisos atendidos." };
  } catch (error) {
    console.error("[atenderLosAvisosAction]", error);
    return { success: false, message: "No se pudieron marcar los avisos." };
  }
}

/** Abrió la tarea desde el tablero: se le quita el punto. */
export async function marcarLaTareaVistaAction(taskId: number): Promise<Resultado<null>> {
  try {
    const { user, persona, tarea } = await laTareaQuePuedoVer(taskId);
    await marcarLaTareaComoVista(tarea.id, persona?.personaId ?? user.id);
    return { success: true, message: "Vista." };
  } catch (error) {
    console.error("[marcarLaTareaVistaAction]", error);
    return { success: false, message: "No se pudo marcar la tarea." };
  }
}
