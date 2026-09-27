import "server-only";

import { db } from "@/lib/db";
import { dondeBorrarLosSeguimientos } from "@/lib/seguimientos-de-la-cuenta";

/**
 * Borra los seguimientos pendientes de un número **solo en las líneas de esa
 * cuenta**. La regla está en `lib/seguimientos-de-la-cuenta.ts`.
 *
 * Lo usan los dos caminos que limpian por número desde la App: marcar un lead
 * como Descartado (`updateSessionLeadStatus`) y la frase de despedida del
 * asesor (`sendManualChatPayloadAction`). Con la condición escrita en cada uno,
 * el tercero se olvida — y olvidarla aquí borra seguimientos de otros clientes
 * de la plataforma sin ningún error.
 */
export async function borrarSeguimientosDelNumeroEnLaCuenta(
    cuentaId: string | null | undefined,
    remoteJid: string | null | undefined,
): Promise<number> {
    if (!cuentaId) return 0;
    const lineas = await db.instancia.findMany({
        where: { userId: cuentaId },
        select: { instanceName: true, instanceId: true },
    });
    const where = dondeBorrarLosSeguimientos(remoteJid, lineas);
    if (!where) {
        if (remoteJid) {
            console.warn("[seguimientos] la cuenta no tiene lineas: no se borra ningun seguimiento", {
                cuentaId,
                remoteJid,
            });
        }
        return 0;
    }
    const { count } = await db.seguimiento.deleteMany({ where });
    return count;
}
