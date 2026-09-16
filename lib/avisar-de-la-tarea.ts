import "server-only";

import { randomUUID } from "crypto";
import { crearLosAvisos, quienesHanComentado } from "@/lib/avisos-de-tarea";
import { tituloDelAviso, type TipoDeAviso } from "@/lib/avisos-de-tarea-tipos";

/**
 * A quién le toca enterarse, y con qué texto.
 *
 * Vive aparte de `lib/avisos-de-tarea.ts` —que es el acceso a las tablas— y de
 * las acciones —que son `'use server'` y solo exportan funciones asíncronas—
 * porque lo llaman **los tres caminos**: crear la tarea, reasignarla, darla por
 * hecha y comentarla. Con la lista de destinatarios escrita en cada uno, el
 * cuarto se olvidaría de alguien y eso no se ve como un error: se ve como que a
 * esa persona no le llega nada.
 *
 * Cada tipo tiene su gente, y es el encargo tal cual:
 *
 * - **asignada** → al asignado. Es el caso que originó todo esto.
 * - **hecha** → a quien creó la tarea, para que pueda avisarle al cliente.
 * - **comentario** → a los implicados: el asignado, quien la creó y todos los
 *   que ya escribieron en el hilo. Quien comenta ya sabe lo que ha escrito, así
 *   que `crearLosAvisos` lo descuenta junto con los repetidos.
 */

export type TareaQueAvisa = {
  id: number;
  projectId: number | null;
  ownerId: string;
  title: string;
  assignedToId: string;
  createdById: string;
};

export async function avisarDeLaTarea(input: {
  tipo: TipoDeAviso;
  tarea: TareaQueAvisa;
  actorId: string;
  actorNombre: string | null;
  /** El comentario, cuando lo hay. Lo que se lee dentro de la ventana. */
  texto?: string | null;
}): Promise<number> {
  const { tipo, tarea, actorId, actorNombre } = input;

  const destinatarios = await aQuienLeToca(tipo, tarea);
  if (!destinatarios.length) return 0;

  const titulo = tituloDelAviso(tipo, actorNombre, tarea.title);
  const texto = input.texto?.trim() || (tipo === "comentario" ? null : tarea.title);

  return crearLosAvisos(
    destinatarios.map((destinatarioId) => ({
      id: randomUUID(),
      taskId: tarea.id,
      projectId: tarea.projectId,
      ownerId: tarea.ownerId,
      destinatarioId,
      actorId,
      actorNombre,
      tipo,
      titulo,
      texto,
    })),
  );
}

async function aQuienLeToca(tipo: TipoDeAviso, tarea: TareaQueAvisa): Promise<string[]> {
  if (tipo === "asignada") return [tarea.assignedToId];
  if (tipo === "hecha") return [tarea.createdById];

  // Un fallo leyendo el hilo no puede dejar al asignado y al autor sin aviso:
  // esos dos se saben sin consultar nada.
  let losQueEscribieron: string[] = [];
  try {
    losQueEscribieron = await quienesHanComentado(tarea.id);
  } catch (error) {
    console.warn("[tareas] no se pudo leer quién había comentado; se avisa a los dos de siempre", {
      taskId: tarea.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return [tarea.assignedToId, tarea.createdById, ...losQueEscribieron];
}
