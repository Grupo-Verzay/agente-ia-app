import "server-only";

import { db } from "@/lib/db";
import { isAdminOrReseller } from "@/lib/rbac";

/**
 * Los clientes que le tocan a quien está preguntando.
 *
 * Es la MISMA cartera que ya decide qué ve en Clientes (`advisor_clients`):
 * alguien del equipo no tiene rol de admin, pero sí puede tener clientes
 * asignados, y entonces ve esos y solo esos.
 *
 * - `null` = sin límite propio. Es admin, super admin o reseller: cada uno se
 *   acota por su regla (el reseller por sus asignaciones, el admin por lo suyo).
 * - `[]` = no le han asignado ninguno. Quien llame corta con «No autorizado».
 *
 * Estaba escrito dentro de `userClientDataActions` y no salía de ahí, así que
 * cada pantalla nueva volvía a pedir rol de admin y le cerraba la puerta al
 * asesor. Vive aquí para que Clientes, Instancias y Analíticas repartan igual.
 */
export async function clientesDelAsesor(persona: {
    id?: string | null;
    role?: string | null;
}): Promise<string[] | null> {
    if (!persona?.id) return [];
    if (isAdminOrReseller(persona.role)) return null;

    try {
        const filas = await db.advisorClient.findMany({
            where: { advisorUserId: persona.id },
            select: { clientUserId: true },
        });
        return Array.from(new Set(filas.map((f) => f.clientUserId)));
    } catch (error) {
        // La tabla la crea la migración del backend. Si aún no está, esta
        // persona no tiene cartera; pero un fallo mudo aquí se ve como un
        // «No autorizado» sin motivo, así que se dice.
        console.warn("[cartera] no se pudieron leer los clientes del asesor", {
            asesor: persona.id,
            error: String(error),
        });
        return [];
    }
}
