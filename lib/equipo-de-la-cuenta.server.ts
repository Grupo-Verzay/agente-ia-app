import "server-only";

import { db } from "@/lib/db";

/**
 * La gente de una cuenta a la que se le puede dar trabajo en una conversación:
 * su equipo (`owner_id` con papel de asesor), sus cuentas vinculadas y la
 * propia cuenta.
 *
 * Es la MISMA lista con la que ya se decidía a quién se agrega como
 * participante (`addSessionParticipantAction`); ahora la usan también las
 * menciones de una nota. Con dos copias, el día que se afine una se podría
 * mencionar a alguien que no se puede agregar, o al revés.
 *
 * Y dice de cada uno si es **agente**, que es lo único que decide si una
 * mención le abre la conversación: quien no lo es ya la ve.
 */
export async function elEquipoDeLaCuenta(
    cuentaId: string,
): Promise<Map<string, { esAgente: boolean }>> {
    const rows = await db.$queryRaw<{ id: string; rol: string | null }[]>`
        SELECT u.id, u.advisor_role AS rol FROM "User" u
          WHERE u.owner_id = ${cuentaId} AND u.advisor_role IS NOT NULL
        UNION
        SELECT u.id, NULL AS rol FROM "linked_accounts" la
          JOIN "User" u ON u.id = la."linked_user_id"
          WHERE la."master_user_id" = ${cuentaId}
        UNION
        SELECT ${cuentaId} AS id, NULL AS rol
    `;
    const equipo = new Map<string, { esAgente: boolean }>();
    for (const r of rows) {
        const previo = equipo.get(r.id);
        equipo.set(r.id, { esAgente: Boolean(previo?.esAgente) || r.rol === "agente" });
    }
    return equipo;
}
