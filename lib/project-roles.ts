import { db } from "@/lib/db";
import { canManageWorkspace } from "@/lib/workspace-roles";

/**
 * Quien manda en UN proyecto concreto: quien gestiona la cuenta, y quien lo
 * creó.
 *
 * Crear proyectos lo puede cualquiera del equipo —un colaborador necesita poder
 * organizar su propio trabajo—, y lo que uno abre queda a su cargo: sus tareas,
 * su gente, su borrado. Lo de los demás no se toca sin ser administrador.
 *
 * Vive aquí y no en `workspace-roles` porque necesita la base, y aquel es un
 * módulo de reglas puras que se usa también desde pantallas.
 */
/**
 * Qué proyectos VE alguien del equipo, como trozo de `where`.
 *
 * Quien gestiona la cuenta los ve todos. Al resto le salen los que tienen que
 * ver con él: los que creó, los que lleva y aquellos en los que está. Antes la
 * lista traía todos los de la cuenta, así que un agente entraba a Proyectos y
 * veía el trabajo entero de su dueño, estuviera o no dentro.
 *
 * Es el mismo reparto que ya rige en Diagramas, donde cada uno decide si lo ve
 * su autor o el equipo.
 */
export function filtroDeProyectosVisibles(user: {
  id: string;
  role?: string | null;
  ownerId?: string | null;
  advisorRole?: string | null;
}) {
  if (canManageWorkspace(user)) return {};
  return {
    OR: [
      { createdById: user.id },
      { leadId: user.id },
      { members: { some: { userId: user.id } } },
    ],
  };
}

export async function mandaEnElProyecto(
  user: { id: string; role?: string | null; ownerId?: string | null; advisorRole?: string | null },
  ownerId: string,
  projectId: number,
): Promise<boolean> {
  if (canManageWorkspace(user)) return true;

  const suyo = await db.project.findFirst({
    where: { id: projectId, ownerId, createdById: user.id },
    select: { id: true },
  });
  return !!suyo;
}
