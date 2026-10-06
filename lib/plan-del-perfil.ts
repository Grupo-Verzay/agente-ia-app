/**
 * Lo que la tarjeta «Plan y facturación» del Perfil dice del plan de la cuenta.
 *
 * Pura: la usan la tarjeta y su banco. La regla de «en prueba» es la MISMA que
 * la del panel de administración (`row.isDemo ? "TRIAL"`): la cuenta es de
 * prueba (`User.isDemo`) y todavía no se ha cobrado nada. Antes se deducía de
 * `lastPaymentAt` a secas, y un plan puesto a mano en el panel —que no escribe
 * esa fecha— salía como «Prueba · N días» con las tarjetas de los planes
 * debajo, aunque el administrador lo viera como cliente de pago.
 */

export interface DatosDelPlan {
    /** `User.isDemo` de la CUENTA. */
    esDemo?: boolean | null;
    billingStatus?: string | null;
    lastPaymentAt?: string | Date | null;
}

export function estaEnPrueba(d: DatosDelPlan | null | undefined): boolean {
    if (!d) return false;
    if (d.esDemo !== true) return false;
    if (d.billingStatus === 'PAID') return false;
    if (d.lastPaymentAt) return false;
    return true;
}

/** Días que le quedan. Cero si ya se le pasó; `null` sin fecha. */
export function diasQueQuedan(dueDate: string | Date | null | undefined, ahora = Date.now()): number | null {
    if (!dueDate) return null;
    const ms = new Date(dueDate).getTime() - ahora;
    if (!Number.isFinite(ms)) return null;
    return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** «Pagar y renovar» solo con importe y fuera de prueba. */
export function seOfrecePagar(d: DatosDelPlan & { price?: string | number | null }): boolean {
    return !estaEnPrueba(d) && Number(d.price ?? 0) > 0;
}
