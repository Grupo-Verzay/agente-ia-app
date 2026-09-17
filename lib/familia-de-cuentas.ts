import "server-only";

import { db } from "@/lib/db";

/**
 * La FAMILIA de una cuenta: la raíz y sus vinculadas.
 *
 * # Por qué existe
 *
 * Porque `ownerId ?? id` **no sube a la madre**, y eso partió el chat del
 * equipo en dos sin que nadie viera un error.
 *
 * Una cuenta se cuelga de otra por dos caminos, y solo uno de ellos deja
 * rastro en la fila:
 *
 * | camino | qué es | ¿lo ve `ownerId`? |
 * | --- | --- | --- |
 * | `owner_id` | una persona del equipo, o una sub-cuenta creada desde Equipo | **sí** |
 * | `linked_accounts` | una cuenta que ya existía y se vincula a otra | **no** |
 *
 * Verzay | Atencion es del segundo tipo: una cuenta de primer nivel, sin
 * `owner_id`, vinculada bajo Grupo Verzay. Así que `ownerId ?? id` daba
 * `atencion` para su gente y `grupo` para la madre: **dos hilos distintos**,
 * cada uno viendo solo lo suyo.
 *
 * Y lo que lo convierte en un fallo y no en un diseño es que
 * `getTeamAdvisorInfos` **sí cruza** —su `UNION` trae las vinculadas como
 * gente mencionable—, o sea que la lista de a quién se puede mencionar
 * alcanzaba más lejos que el hilo donde caen los mensajes. Es exactamente lo
 * que la regla del chat de equipo prohibía.
 *
 * # Un solo nivel, a propósito
 *
 * `linked_accounts` modela «esta cuenta cuelga de esta otra», no un árbol. Ir
 * a buscar nietas sería inventarse una jerarquía que nadie ha configurado, y
 * un ciclo mal metido en esa tabla colgaría la consulta.
 */

export type Familia = {
    /** La cuenta que manda: la madre, o ella misma si no cuelga de ninguna. */
    raiz: string;
    /** La raíz y sus vinculadas. Siempre trae al menos la cuenta preguntada. */
    cuentas: string[];
};

/**
 * La familia de una cuenta.
 *
 * **Nunca lanza**: si la tabla de vinculadas no se puede leer se sigue con la
 * cuenta sola, que es el lado seguro —se ve menos, nunca de más—. Pero **no es
 * mudo**: una familia recortada se nota como «mis mensajes no le llegan a
 * nadie», que es justo el fallo del que venimos.
 */
export async function laFamiliaDeLaCuenta(cuentaId: string): Promise<Familia> {
    const id = String(cuentaId ?? "").trim();
    if (!id) return { raiz: "", cuentas: [] };

    try {
        // Primero hacia arriba: ¿de quién cuelgo? Los dos caminos, como en
        // `cuentasDeLasQueCuelga`. Si cuelgo de varias —no debería, pero la
        // tabla no lo impide— manda la primera de forma estable, ordenada,
        // para que dos peticiones no elijan raíces distintas y partan el hilo
        // otra vez.
        const arriba = await db.$queryRaw<{ id: string }[]>`
            SELECT la."master_user_id" AS id
            FROM "linked_accounts" la
            WHERE la."linked_user_id" = ${id}
            UNION
            SELECT u."owner_id" AS id
            FROM "User" u
            WHERE u.id = ${id} AND u."owner_id" IS NOT NULL
            ORDER BY id ASC
        `;
        const raiz = arriba[0]?.id?.trim() || id;

        // Y después hacia abajo desde la raíz: sus vinculadas.
        const abajo = await db.$queryRaw<{ id: string }[]>`
            SELECT la."linked_user_id" AS id
            FROM "linked_accounts" la
            WHERE la."master_user_id" = ${raiz}
        `;

        const cuentas = new Set<string>([raiz, id]);
        for (const f of abajo) if (f.id?.trim()) cuentas.add(f.id.trim());
        return { raiz, cuentas: Array.from(cuentas) };
    } catch (error) {
        console.warn("[chat-equipo] no se pudo resolver la familia de la cuenta", {
            cuenta: id,
            error: error instanceof Error ? error.message : String(error),
        });
        return { raiz: id, cuentas: [id] };
    }
}

/** ¿Es esta cuenta la madre de su familia? Solo ella reparte canales que cruzan. */
export function esLaCuentaMadre(familia: Familia, cuentaId: string): boolean {
    return Boolean(cuentaId) && familia.raiz === cuentaId;
}
