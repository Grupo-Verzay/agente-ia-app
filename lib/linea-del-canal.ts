/**
 * ¿Puede quien envía mandar por ESTA línea de canal (Meta, Telegram)?
 *
 * Puro a propósito: la pregunta se reduce a si la cuenta dueña de la línea está
 * entre las que alcanza quien envía, y esa lista la calcula el servidor con
 * `getAssociatedAccountIds` —la propia, la de su sesión y las que cuelgan de
 * ella HACIA ABAJO; nunca la madre ni las hermanas—. Es el mismo alcance con
 * el que la bandeja LEE esas líneas, así que lo que se ve es exactamente lo que
 * se puede enviar: ni un botón roto ni una puerta de más.
 */
export type VeredictoDeLaLinea =
    | { ok: true; duenoId: string }
    | { ok: false; motivo: "sin_sesion" | "sin_linea" | "otra_cuenta"; message: string };

export function juzgarLaLineaDelCanal(args: {
    instanceName: string;
    /** `null` = no hay sesión. */
    cuentasQueAlcanza: readonly string[] | null;
    /** `null` = la línea no existe (o no tiene dueño). */
    duenoId: string | null | undefined;
}): VeredictoDeLaLinea {
    if (!args.cuentasQueAlcanza) {
        return { ok: false, motivo: "sin_sesion", message: "No autorizado: inicia sesión para enviar." };
    }
    if (!args.duenoId) {
        return { ok: false, motivo: "sin_linea", message: `No se encontró la línea ${args.instanceName}.` };
    }
    if (!args.cuentasQueAlcanza.includes(args.duenoId)) {
        return {
            ok: false,
            motivo: "otra_cuenta",
            message: `No tienes acceso a la línea ${args.instanceName}: es de otra cuenta.`,
        };
    }
    return { ok: true, duenoId: args.duenoId };
}
