import "server-only";

import { db } from "@/lib/db";
import { recordarPorSesion } from "@/lib/cache-de-sesion";
import { TOPE_DE_LA_FAMILIA } from "@/lib/familia-de-cuentas";
import {
    puedeLlegarA,
    type EnlaceEntreCuentas,
    type Veredicto,
} from "@/lib/alcance-entre-cuentas";

/**
 * Los enlaces con SENTIDO de la familia de una cuenta, más el salto por
 * `owner_id` si esa cuenta cuelga de otra (una sub-cuenta creada desde Equipo).
 *
 * **Lanza** si no se pueden leer, a diferencia de `laFamiliaDeLaCuenta`. Aquí
 * no hay lado seguro en seguir con la lista vacía: sin enlaces, «¿está por
 * encima?» contesta que no y la puerta se abriría hacia arriba. Quien llama
 * convierte el fallo en un «no».
 *
 * Se recuerda cinco segundos por cuenta —la llave son los ids que deciden y
 * nada más—: `assertCanAccessTargetUser` lo pregunta en cada acción de una
 * pantalla, y la familia de una cuenta no cambia entre una y la siguiente.
 */
export function losEnlacesDeLaCuenta(cuentaId: string): Promise<EnlaceEntreCuentas[]> {
    const id = String(cuentaId ?? "").trim();
    if (!id) return Promise.resolve([]);
    return recordarPorSesion(`alcance-entre-cuentas|${id}`, () => leerLosEnlaces(id));
}

async function leerLosEnlaces(id: string): Promise<EnlaceEntreCuentas[]> {
    const componente = await db.$queryRaw<{ id: string }[]>`
        WITH RECURSIVE familia(id) AS (
            SELECT ${id}::text
          UNION
            SELECT CASE WHEN la."master_user_id" = f.id
                        THEN la."linked_user_id"
                        ELSE la."master_user_id" END
            FROM familia f
            JOIN "linked_accounts" la
              ON la."master_user_id" = f.id OR la."linked_user_id" = f.id
        )
        SELECT id FROM familia LIMIT ${TOPE_DE_LA_FAMILIA}
    `;
    const cuentas = componente.map((f) => f.id).filter(Boolean);

    const enlaces = await db.$queryRaw<EnlaceEntreCuentas[]>`
        SELECT la."master_user_id" AS de, la."linked_user_id" AS a
        FROM "linked_accounts" la
        WHERE la."master_user_id" = ANY(${cuentas}::text[])
          AND la."linked_user_id" = ANY(${cuentas}::text[])
    `;

    const duena = await db.$queryRaw<{ id: string }[]>`
        SELECT u."owner_id" AS id FROM "User" u
        WHERE u.id = ${id} AND u."owner_id" IS NOT NULL
        LIMIT 1
    `;
    if (duena[0]?.id) enlaces.push({ de: duena[0].id, a: id });

    return enlaces;
}

/**
 * Juzga si quien actúa por `cuenta` puede llegar a `objetivoId`.
 *
 * Nunca lanza: cualquier fallo es un «no», y se dice. Una puerta que se abre
 * cuando no puede leer la base es la puerta más cara de todas.
 */
export async function juzgarElAlcance(input: {
    esSuperAdmin: boolean;
    cuenta: string;
    objetivoId: string;
    donde: string;
}): Promise<Veredicto & { objetivo?: { id: string; cuentaId: string } }> {
    if (input.esSuperAdmin) return { puede: true };
    try {
        const fila = await db.user.findUnique({
            where: { id: input.objetivoId },
            select: { id: true, role: true, ownerId: true },
        });
        // Un objetivo que no existe no es un permiso que negar: de eso se
        // encarga cada puerta con su «no existe».
        if (!fila) return { puede: true };

        const cuentaId = fila.ownerId ?? fila.id;
        const rolDeLaCuenta =
            cuentaId === fila.id
                ? fila.role
                : (
                      await db.user.findUnique({
                          where: { id: cuentaId },
                          select: { role: true },
                      })
                  )?.role ?? null;

        const veredicto = puedeLlegarA({
            esSuperAdmin: false,
            cuenta: input.cuenta,
            objetivo: { id: fila.id, role: fila.role, cuentaId, rolDeLaCuenta },
            enlaces: await losEnlacesDeLaCuenta(input.cuenta),
        });

        if (!veredicto.puede) {
            console.warn("[cuentas] se intentó llegar a una cuenta fuera del alcance", {
                donde: input.donde,
                desde: input.cuenta,
                objetivo: input.objetivoId,
                motivo: veredicto.motivo,
            });
        }
        return { ...veredicto, objetivo: { id: fila.id, cuentaId } };
    } catch (error) {
        console.warn("[cuentas] no se pudo comprobar el alcance; se niega", {
            donde: input.donde,
            desde: input.cuenta,
            objetivo: input.objetivoId,
            error: error instanceof Error ? error.message : String(error),
        });
        return { puede: false, motivo: "por-encima" };
    }
}
