'use server';

import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';
import { elSlugDeLaAgendaSiSePuede, type TipoDeAgenda } from '@/lib/enlace-de-agenda.server';

/** El nombre legible del enlace público de una agenda (`/<tipo>/<nombre>/agenda`), o `null`. */
export async function elSlugDeLaAgendaAction(cuentaId: string, tipo: TipoDeAgenda): Promise<string | null> {
    if (tipo !== 'schedule' && tipo !== 'bookings') return null;
    const cuenta = await laCuentaDeLaAccion(cuentaId);
    if (!cuenta) return null;
    return elSlugDeLaAgendaSiSePuede(cuenta, tipo);
}
