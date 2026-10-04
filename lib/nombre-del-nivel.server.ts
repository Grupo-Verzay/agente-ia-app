import "server-only";

import { db } from "@/lib/db";
import { conElNombreDelNivel, losNombresDeLosNiveles } from "@/lib/nombre-del-nivel";

/**
 * El nombre vigente de cada nivel, leído de todas las filas de
 * `subscription_plans` (son 24 como mucho: seis niveles, dos tipos y dos
 * públicos). Las reglas están en `lib/nombre-del-nivel.ts`.
 *
 * Un fallo NO tumba a quien pregunta: se devuelve el mapa vacío y cada fila se
 * queda con su propio nombre, que es lo que se enseñaba antes. Pero se dice,
 * porque un nombre viejo en la landing no se parece a un error.
 */
export async function losNombresVigentes(): Promise<Record<string, string>> {
    try {
        const filas = await db.subscriptionPlan.findMany({
            select: { plan: true, name: true, isResellerPlan: true, updatedAt: true },
        });
        return losNombresDeLosNiveles(filas);
    } catch (e) {
        console.error("[planes] no se pudo leer el nombre vigente de los niveles; sale el de cada fila", e);
        return {};
    }
}

/** La lista de planes con el nombre vigente de su nivel (ver `lib/nombre-del-nivel.ts`). */
export async function conLosNombresVigentes<T extends { plan: string; name: string | null }>(
    planes: readonly T[],
): Promise<T[]> {
    if (planes.length === 0) return [...planes];
    return conElNombreDelNivel(planes, await losNombresVigentes());
}
