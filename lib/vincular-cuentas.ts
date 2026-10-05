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
 * # Y un cliente vincula SUS cuentas con la contraseña de la otra
 *
 * Un cliente con varias cuentas propias (madre e hijas) no las alcanza por
 * ninguna puerta hasta que están vinculadas, así que la regla de arriba lo
 * dejaba sin forma de hacerlo. Ahora «Vincular existente» se ofrece a quien
 * manda en su cuenta, y el servidor pide además el CORREO y la CONTRASEÑA de
 * la cuenta que se vincula: saberla es la prueba de que también es suya.
 * Con la contraseña correcta solo se vincula una CUENTA de cliente
 * (`porQueNoSeVinculaConContrasena`): nunca una persona de un equipo, ni una
 * cuenta de la casa, ni un reseller, ni una cuenta que esté POR ENCIMA de la
 * propia. Así no abre la de otros clientes ni la plataforma.
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

/** El mensaje cuando el correo o la contraseña no casan: el mismo para los dos, no dice si la cuenta existe. */
export const CORREO_O_CONTRASENA_NO_COINCIDEN = "El correo o la contraseña de esa cuenta no coinciden.";

/** El mensaje después de demasiados intentos fallidos seguidos. */
export const DEMASIADOS_INTENTOS = "Demasiados intentos fallidos. Espera unos minutos y vuelve a intentarlo.";

/**
 * Si se OFRECE vincular una cuenta existente. `rol` es el de la CUENTA por la
 * que se actúa (`rolQueAbrePuertas`); `administraLaCuenta` si quien mira manda
 * en ella (`canManageWorkspace`): un `agente` no vincula nada. La casa y el
 * reseller vinculan lo que ya alcanzan; un cliente, sus propias cuentas con su
 * contraseña.
 */
export function ofreceVincularCuentas(input: {
    rol: string | null | undefined;
    administraLaCuenta: boolean;
}): boolean {
    return isAdminOrReseller(input.rol) || input.administraLaCuenta === true;
}

/**
 * Si el diálogo PIDE la contraseña de la cuenta que se vincula. La casa y el
 * reseller vinculan lo que ya alcanzan sin ella (como siempre); un cliente la
 * necesita.
 */
export function pideContrasenaParaVincular(rol: string | null | undefined): boolean {
    return !isAdminOrReseller(rol);
}

/** Lo que se sabe de la cuenta que se quiere vincular. */
export type CuentaParaVincular = {
    id: string;
    ownerId: string | null;
    role: string | null;
    deletedAt: Date | string | null;
};

/**
 * Con la contraseña correcta, POR QUÉ NO se vincula esa cuenta (o `null` si sí).
 * `porEncima` son las cuentas por encima de la propia (`lasCuentasPorEncimaDe`).
 */
export function porQueNoSeVinculaConContrasena(input: {
    cuentaId: string;
    objetivo: CuentaParaVincular;
    porEncima: readonly string[];
}): string | null {
    const { cuentaId, objetivo, porEncima } = input;
    if (!objetivo?.id || !cuentaId) return SOLO_LO_QUE_YA_ADMINISTRAS;
    if (objetivo.id === cuentaId) return "No puedes vincular tu misma cuenta.";
    if (objetivo.deletedAt) return CORREO_O_CONTRASENA_NO_COINCIDEN;
    if (objetivo.ownerId) {
        return "Ese correo es de una persona de un equipo, no de una cuenta. Vincula la cuenta a la que pertenece.";
    }
    if (objetivo.role !== "user") return SOLO_LO_QUE_YA_ADMINISTRAS;
    if (porEncima.includes(objetivo.id)) {
        return "Esa cuenta está por encima de la tuya: vincula desde ella hacia esta.";
    }
    return null;
}

/**
 * Si se ofrece REINICIAR los vínculos: solo el superadministrador de verdad
 * (la persona, esté donde esté), porque borra los de todas las cuentas.
 */
export function ofreceReiniciarVinculos(esSuperAdminDeVerdad: boolean): boolean {
    return esSuperAdminDeVerdad === true;
}

