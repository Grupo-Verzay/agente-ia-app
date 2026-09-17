import { db } from "@/lib/db";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { permisoRecibidoDelProyecto, type PermisoDeProyecto } from "@/lib/proyectos-compartidos";

/**
 * Qué puede hacer alguien con UN proyecto concreto, sea de su cuenta o
 * compartido por otra.
 *
 * Se pregunta en **un solo sitio** porque las acciones son seis —listar, abrir
 * el tablero, crear, editar, mover y borrar tareas— y con la condición escrita
 * en cada una, la séptima se olvida. Ya pasó en Chats: el mismo chat se podía
 * anclar y no se podía borrar porque cada acción llevaba su propia lista de
 * casos.
 *
 * Y se pregunta **en el servidor**. Que la pantalla no pinte el botón es una
 * comodidad; la puerta es esto.
 */
export type AccesoAlProyecto = {
  projectId: number;
  /**
   * La cuenta DUEÑA del proyecto. De ella cuelgan sus tareas, **también las que
   * cree la cuenta invitada**: el proyecto es uno, así que sus tareas son unas.
   */
  ownerId: string;
  /** Llegó compartido desde otra cuenta. */
  recibido: boolean;
  /** Con qué permiso se recibe. Nulo en los propios. */
  permiso: PermisoDeProyecto | null;
  /**
   * Trabajar en el tablero: crear, editar, mover y cerrar **cualquier** tarea
   * del proyecto.
   *
   * En uno propio es lo que decía `mandaEnElProyecto` —quien gestiona la cuenta
   * y quien lo creó—, sin cambiar nada. En uno recibido, permiso de edición
   * **y** mandar en la cuenta invitada: un `agente` participa en lo que le
   * asignen, y en un proyecto de otra cuenta no le asignan nada, así que ahí no
   * pinta nada. Es el mismo reparto de `canManageWorkspace`.
   *
   * Un agente al que SÍ le asignaron una tarea sigue moviendo la suya: eso lo
   * decide `moveProjectTaskAction` por su cuenta, como siempre.
   */
  puedeTrabajar: boolean;
  /**
   * Mandar en el proyecto: editarlo, borrarlo, borrar sus tareas y decidir con
   * quién se comparte. **Nunca es cierto en uno recibido**, igual que en
   * Diagramas: repartirlo sigue siendo de quien lo hizo.
   */
  puedeGestionar: boolean;
};

type QuienMira = {
  id: string;
  role?: string | null;
  ownerId?: string | null;
  advisorRole?: string | null;
};

/**
 * `null` si no puede ni verlo — y eso incluye «no existe».
 *
 * Un proyecto ajeno se contesta igual que uno que no existe: decir «no puedes»
 * ya revela que existe y de quién es. Es la misma regla de `getFlowAction`.
 */
export async function accesoAlProyecto(
  user: QuienMira,
  cuenta: string,
  projectId: number,
): Promise<AccesoAlProyecto | null> {
  if (!Number.isInteger(projectId) || projectId <= 0) return null;

  const proyecto = await db.project.findFirst({
    where: { id: projectId },
    select: {
      id: true,
      ownerId: true,
      createdById: true,
      leadId: true,
      members: { select: { userId: true } },
    },
  });
  if (!proyecto) return null;

  if (proyecto.ownerId === cuenta) {
    // De la cuenta: manda la privacidad con el equipo, que es la de siempre y
    // NO se toca aquí — quien gestiona los ve todos; el resto, los que tienen
    // que ver con él.
    const suyo =
      canManageWorkspace(user) ||
      proyecto.createdById === user.id ||
      proyecto.leadId === user.id ||
      proyecto.members.some((m) => m.userId === user.id);
    if (!suyo) return null;

    // Lo mismo que decía `mandaEnElProyecto`, sin una segunda consulta: ya
    // tenemos la fila delante.
    const manda = canManageWorkspace(user) || proyecto.createdById === user.id;
    return {
      projectId: proyecto.id,
      ownerId: proyecto.ownerId,
      recibido: false,
      permiso: null,
      puedeTrabajar: manda,
      puedeGestionar: manda,
    };
  }

  const permiso = await permisoRecibidoDelProyecto(projectId, cuenta);
  if (!permiso) return null;

  return {
    projectId: proyecto.id,
    ownerId: proyecto.ownerId,
    recibido: true,
    permiso,
    puedeTrabajar: permiso === "edicion" && canManageWorkspace(user),
    puedeGestionar: false,
  };
}
