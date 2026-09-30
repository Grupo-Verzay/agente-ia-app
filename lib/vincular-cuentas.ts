/**
 * Quién puede VINCULAR una cuenta existente bajo la suya, y quién puede
 * REINICIAR los vínculos. Puro: lo preguntan la pantalla de Usuarios, el
 * conmutador de cuentas y el banco.
 *
 * # Por qué existe
 *
 * «Vincular existente» (Usuarios › ⋯) y «Vincular cuenta» (el conmutador)
 * escribían una fila `master = mi cuenta, linked = la otra` con solo teclear un
 * correo, sin preguntar nada de la otra cuenta. Y desde #898 esa fila significa
 * una sola cosa: **la madre llega a la hija**. O sea que cualquier cuenta
 * cliente podía apropiarse de otra —leer sus chats, su CRM, actuar en su
 * nombre— escribiendo su correo. La otra cuenta no recibía nada a cambio: el
 * conmutador y la bandeja solo bajan, así que el «asesor» vinculado ni siquiera
 * veía la cuenta a la que se le «añadía».
 *
 * Así que vincular solo se ofrece a quien ya administra cuentas —la casa y el
 * reseller— y el servidor exige además que la cuenta que se vincula sea una
 * que ya se alcanza (`lib/vincular-cuentas.server.ts`). La puerta es la de
 * siempre, `assertCanAccessTargetUser`: vincular no puede abrir nada que no
 * estuviera abierto.
 *
 * Y **reiniciar los vínculos** borra los de TODA la plataforma y descuelga a
 * todos los equipos de sus cuentas. Eso no es de una cuenta: es del dueño de la
 * plataforma, y se teclea (`confirmaLaLimpieza`, la misma palabra que el resto
 * de borrados masivos).
 */

import { isAdminOrReseller } from "@/lib/rbac";

/** El mensaje cuando la cuenta pedida no es una que ya se administre. */
export const SOLO_LO_QUE_YA_ADMINISTRAS =
    "Solo puedes vincular una cuenta que ya administras. Si es de otra empresa, pídeselo a soporte.";

/**
 * Si se OFRECE vincular una cuenta existente. `rol` es el de la CUENTA por la
 * que se actúa (`rolQueAbrePuertas`): el administrador del equipo de la casa
 * vincula como su cuenta; un `agente` no. Una cuenta cliente no: lo único que
 * podría vincular ya lo tiene.
 */
export function ofreceVincularCuentas(rol: string | null | undefined): boolean {
    return isAdminOrReseller(rol);
}

/**
 * Si se ofrece REINICIAR los vínculos: solo el superadministrador de verdad
 * (la persona, esté donde esté), porque borra los de todas las cuentas.
 */
export function ofreceReiniciarVinculos(esSuperAdminDeVerdad: boolean): boolean {
    return esSuperAdminDeVerdad === true;
}

