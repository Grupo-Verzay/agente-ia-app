import { isAdminLike } from "@/lib/rbac";

/**
 * Quién puede CREAR contenido compartido del equipo: proyectos y diagramas.
 *
 * El criterio es por cuenta, no por plataforma: el dueño de una cuenta manda en
 * la suya, y los administradores de su equipo también. Hacerlo solo para el
 * super admin de Verzay habría dejado la función inservible para el resto de
 * clientes, que son dueños de su propia cuenta.
 *
 * Un `agente` queda fuera: participa en lo que le asignen, pero no crea ni
 * borra. Es el mismo reparto que ya rige en Chats.
 */
export function canManageWorkspace(user: {
  role?: string | null;
  ownerId?: string | null;
  advisorRole?: string | null;
}): boolean {
  // Admin o super admin de la plataforma.
  if (isAdminLike(user.role)) return true;
  // Dueño de su propia cuenta: no cuelga de nadie.
  if (!user.ownerId) return true;
  // Administrador dentro del equipo de esa cuenta.
  return user.advisorRole === "administrador";
}

/** Participa, pero no crea ni borra. */
export function isAgent(user: { advisorRole?: string | null }): boolean {
  return user.advisorRole === "agente";
}
