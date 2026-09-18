import "server-only";

import { db } from "@/lib/db";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
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
 * Y el `administrador` de una cuenta no pasa por su cartera sino por la de su
 * cuenta: actúa por ella (ver `lib/cuenta-que-manda.ts`), así que sobre una
 * cuenta de admin o de reseller devuelve `null` —sin límite propio— y ve lo
 * mismo que su jefe sin que nadie le asigne nada.
 *
 * Estaba escrito dentro de `userClientDataActions` y no salía de ahí, así que
 * cada pantalla nueva volvía a pedir rol de admin y le cerraba la puerta al
 * asesor. Vive aquí para que Clientes, Instancias y Analíticas repartan igual.
 *
 * **Se pregunta por la fila EFECTIVA, a propósito**, y es lo contrario de lo
 * que hacen los datos que se escriben (ver *lo que se LEE por persona se
 * ESCRIBE por persona*). Aquí no se firma nada: se decide hasta dónde se llega,
 * y eso lo dice la cuenta con la que se está actuando. Resolver la persona real
 * rompe las dos puntas a la vez, y las dos se vieron en producción:
 *
 * - **Se queda corto.** Un administrador que llega a su cuenta por
 *   `linked_accounts` tiene su propia fila sin `owner_id` y sin `advisorRole`,
 *   así que preguntándole a ELLA `cuentaQueManda` devuelve su id con rol `user`
 *   y la cartera sale `[]`: «No autorizado para gestionar este cliente» sobre
 *   clientes que lleva todos los días.
 * - **Y se pasa.** Dentro de un cliente con «Ingresar» se entra para ver lo que
 *   ve él, y el rol propio no cuenta ahí; con la persona resuelta, el alcance
 *   de quien entró se colaba dentro.
 *
 * Cuando los dos ids difieren —el conmutador y «Ingresar», los únicos casos—
 * la fila efectiva YA es la respuesta correcta.
 */
export async function clientesDelAsesor(quienMira: {
    id?: string | null;
    role?: string | null;
    ownerId?: string | null;
    advisorRole?: string | null;
}): Promise<string[] | null> {
    if (!quienMira?.id) return [];

    // Quién manda aquí. El administrador de una cuenta actúa POR ella: su
    // alcance es el de su cuenta, no el suyo propio, y por eso no hay que
    // asignarle los clientes uno a uno (ver `lib/cuenta-que-manda.ts`).
    const cuenta = await cuentaQueManda(quienMira);
    if (isAdminOrReseller(cuenta.role)) return null;

    try {
        const filas = await db.advisorClient.findMany({
            where: { advisorUserId: cuenta.id },
            select: { clientUserId: true },
        });
        return Array.from(new Set(filas.map((f) => f.clientUserId)));
    } catch (error) {
        // La tabla la crea la migración del backend. Si aún no está, esta
        // persona no tiene cartera; pero un fallo mudo aquí se ve como un
        // «No autorizado» sin motivo, así que se dice.
        console.warn("[cartera] no se pudieron leer los clientes del asesor", {
            asesor: cuenta.id,
            error: String(error),
        });
        return [];
    }
}
