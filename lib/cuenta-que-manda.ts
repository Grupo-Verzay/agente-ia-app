import "server-only";

import { cache } from "react";
import { db } from "@/lib/db";

/** La cuenta por la que se actúa: su id y su rol de plataforma. */
export type CuentaQueManda = { id: string; role: string };

/**
 * Por qué cuenta actúa esta persona.
 *
 * El equipo de una cuenta tiene dos papeles: el `agente`, que atiende lo que le
 * asignan, y el `administrador`, que es la mano derecha del dueño. El segundo
 * **actúa por la cuenta**: ve y gestiona lo que ella ve y gestiona, sin que haya
 * que repartirle los clientes uno a uno.
 *
 * Hasta ahora cada pantalla preguntaba por la PERSONA. Y la persona se crea con
 * rol `user` y sin nada a su nombre, así que:
 *
 * - En Clientes le salía «No autorizado» hasta que alguien le asignaba los 61
 *   clientes a mano, de uno en uno.
 * - En Equipo la consulta buscaba `owner_id = <su id>` y le devolvía un equipo
 *   vacío: el equipo cuelga de la cuenta, no de él.
 * - En el menú de una fila solo le quedaba «Ingresar»: Editar, Módulos,
 *   Asignar y Eliminar piden rol de admin o reseller, y él no lo tiene ni lo
 *   va a tener.
 *
 * Con esto la pregunta se hace una sola vez y en un solo sitio: **quién manda
 * aquí**. Para el dueño de una cuenta, él mismo. Para su administrador, la
 * cuenta.
 *
 * Dos cosas que hay que mantener:
 *
 * 1. **Esto NO presta el rol a la persona.** `user.role` sigue siendo el suyo
 *    en todo lo demás; lo que se hereda es el alcance, y solo aquí, donde se
 *    pregunta por la cuenta. Escribirlo en `currentUser()` habría convertido a
 *    cada administrador en super admin de la plataforma entera.
 * 2. **Un `agente` no pasa.** Es el mismo reparto de `canManageWorkspace`
 *    (`lib/workspace-roles.ts`): participa, pero no manda.
 *
 * La consulta va memoizada por petición —por el id de la cuenta, no por el
 * objeto que se pase—: esto se llama desde varias acciones de la misma pantalla
 * y todas preguntarían lo mismo.
 */
export async function cuentaQueManda(persona: {
    id?: string | null;
    role?: string | null;
    ownerId?: string | null;
    advisorRole?: string | null;
}): Promise<CuentaQueManda> {
    const propia: CuentaQueManda = {
        id: persona?.id ?? "",
        role: persona?.role ?? "",
    };
    if (!propia.id) return propia;

    const cuenta = persona.ownerId ?? null;
    // Sin dueño manda uno mismo. Y `ownerId === id` es el caso de las cuentas
    // vinculadas (`linked_accounts`): ahí `currentUser()` ya devuelve la fila de
    // la cuenta, así que preguntar de nuevo daría lo mismo.
    if (!cuenta || cuenta === propia.id) return propia;
    if (persona.advisorRole !== "administrador") return propia;

    const fila = await leerLaCuenta(cuenta);

    if (!fila) {
        // Un fallo mudo aquí se ve como un «No autorizado» sin motivo, que es
        // exactamente lo que costó encontrar este problema la primera vez.
        console.warn("[cuenta] no se pudo leer la cuenta de un administrador", {
            persona: propia.id,
            cuenta,
        });
        return propia;
    }

    return { id: fila.id, role: fila.role };
}

/** La fila de una cuenta, una sola vez por petición. */
const leerLaCuenta = cache(async (id: string) =>
    db.user
        .findUnique({ where: { id }, select: { id: true, role: true } })
        .catch(() => null),
);
