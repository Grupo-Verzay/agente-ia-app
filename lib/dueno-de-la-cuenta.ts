import { esSuperAdminDeVerdad, type Persona } from "@/lib/super-admin-de-verdad";

/**
 * ¿Es quien mira el DUEÑO de la cuenta en la que está?
 *
 * Más estrecho que `laCuentaQueConfigura` (que deja pasar a un `administrador`
 * del equipo): hay ajustes que son una decisión del dueño y de nadie más, como
 * encender el análisis de sentimiento, que juzga a los clientes y gasta los
 * créditos de la cuenta.
 *
 * Dueño es la persona cuya fila ES la cuenta: sin `ownerId` y sin estar dentro
 * de otra cuenta (con el conmutador o con «Ingresar» la persona y la fila
 * efectiva son distintas). El superadministrador de verdad pasa también, como
 * en toda la plataforma —salvo con «Ingresar», que lo decide
 * `esSuperAdminDeVerdad`—.
 *
 * Pura y síncrona: la usan la pantalla (qué se pinta) y la acción (la puerta).
 */
export type QuienEsElDueno = Persona & {
    id?: string | null;
    ownerId?: string | null;
    sessionUserId?: string | null;
};

export function esElDuenoDeLaCuenta(user: QuienEsElDueno | null | undefined): boolean {
    if (!user?.id) return false;
    if (esSuperAdminDeVerdad(user)) return true;
    if (user.ownerId) return false;
    if (user.porImpersonacion) return false;
    const persona = user.sessionUserId?.trim() || user.id;
    return persona === user.id;
}

/** La cuenta de la que se habla: la fila efectiva, o la de su dueño. */
export function laCuentaDelDueno(user: { id?: string | null; ownerId?: string | null }): string | null {
    return user.ownerId?.trim() || user.id?.trim() || null;
}
