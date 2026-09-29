import { isAdminLike } from "@/lib/rbac";
import { esAdminDeVerdad, type Persona } from "@/lib/super-admin-de-verdad";

/**
 * Quién abre el administrador de Evolution —`/evo` (el manager en un iframe) y
 * Panel › Evo (sus URLs y los servidores)—. Es la MISMA pregunta en las dos
 * pantallas y en las dos acciones de detrás, así que se contesta aquí una vez.
 *
 * `/evo` preguntaba `isAdminLike(user.role)`, o sea por la PERSONA. El equipo
 * se crea con rol `user` y no cambia nunca, así que el administrador de una
 * cuenta de la casa veía el menú y la página le contestaba «Acceso Denegado»,
 * mientras Panel › Evo —que ya preguntaba por la cuenta— sí le abría. Menú
 * abierto, puerta cerrada, y dos pantallas del mismo módulo en desacuerdo.
 *
 * Todo sale de la SESIÓN, nada se le pregunta a quien entra:
 *
 * - el rol de la cuenta por la que actúa (`cuentaQueManda`: la suya, o la de
 *   su cuenta si es su `administrador`; un `agente` no hereda nada);
 * - y el rol propio de verdad (`esAdminDeVerdad`), que sigue valiendo en el
 *   conmutador de cuentas y NO con «Ingresar», donde se entra a ver lo que ve
 *   el cliente.
 */
export function puedeAdministrarEvolution(
    persona: Persona | null | undefined,
    rolDeLaCuenta: string | null | undefined,
): boolean {
    if (!persona) return false;
    return isAdminLike(rolDeLaCuenta) || esAdminDeVerdad(persona);
}

/** Lo que se le dice a quien no pasa, con el dato que explica el corte. */
export const MOTIVO_SIN_EVOLUTION =
    "El administrador de Evolution es de las cuentas de la casa (administrador o superadministrador).";
