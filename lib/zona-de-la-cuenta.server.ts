import "server-only";

import { db } from "@/lib/db";
import { laZonaDeLaCuenta } from "@/lib/zona-de-la-cuenta";

/**
 * La zona horaria de una cuenta, leída de la base (`User.timezone`). Si la
 * persona no tiene, la de la cuenta de la que cuelga; y si no, la de por
 * defecto, que es la que tenían todos hasta ahora. Nunca lanza: una zona que
 * no se pudo leer no puede dejar un recordatorio sin programar.
 */
export async function laZonaHorariaDeLaCuenta(cuenta: string | null | undefined): Promise<string> {
    const id = String(cuenta ?? "").trim();
    if (!id) return laZonaDeLaCuenta(null);
    try {
        const fila = await db.user.findUnique({ where: { id }, select: { timezone: true, ownerId: true } });
        if (fila?.timezone) return laZonaDeLaCuenta(fila.timezone);
        if (fila?.ownerId) {
            const dueno = await db.user.findUnique({ where: { id: fila.ownerId }, select: { timezone: true } });
            return laZonaDeLaCuenta(dueno?.timezone);
        }
    } catch (error) {
        console.warn("[zona-de-la-cuenta] no se pudo leer la zona; se usa la de por defecto", { cuenta: id, error });
    }
    return laZonaDeLaCuenta(null);
}
