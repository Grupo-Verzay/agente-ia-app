import "server-only";

import { db } from "@/lib/db";
import { vuelveLaCuenta } from "@/lib/ciclo-pagado";

/**
 * Deja la cuenta habilitada (`User.status = true`) salvo que esté eliminada.
 *
 * **La única escritura** con la que un pago —o «Activar»— devuelve la cuenta.
 * La usan `darElCicloPorPagado` (Marcar pagado, Aprobar, Wompi), «Activar» y
 * «Editar pagos» cuando la fecha avanza, el trabajo diario al reactivar y la
 * cascada de un reseller. Con el `update` copiado en cada uno es como se llegó
 * a que dependiera de CÓMO se había quedado inactiva.
 *
 * Devuelve si la dejó habilitada.
 */
export async function devolverElAcceso(userId: string): Promise<boolean> {
    const cuenta = await db.user.findUnique({
        where: { id: userId },
        select: { status: true, deletedAt: true },
    });
    if (!vuelveLaCuenta(cuenta)) {
        if (cuenta?.deletedAt) {
            console.warn("[billing] pago sobre una cuenta eliminada: no se vuelve a habilitar", { userId });
        }
        return false;
    }
    if (cuenta!.status !== true) {
        await db.user.update({ where: { id: userId }, data: { status: true } });
    }
    return true;
}
