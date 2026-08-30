import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Ids de todas las cuentas asociadas a quien está usando la App: la activa, su
 * sesión real, las que tiene vinculadas y aquellas de las que él es el vinculado.
 *
 * Es el mismo alcance con el que la bandeja LEE los chats, y por eso tiene que
 * ser también el alcance con el que se puede actuar sobre ellos. Cuando no
 * cuadraban, salía lo que se veía en pantalla: una conversación que se abre
 * perfectamente y, al intentar resolverla o reabrirla, un "No autorizado" —
 * porque la sesión pertenece a una cuenta vinculada y la comprobación miraba
 * solo la cuenta activa.
 *
 * Se derivan aquí, en el servidor, a propósito: no pueden venir del cliente
 * porque entonces bastaría con mandar ids ajenos para leer o escribir cosas de
 * otro.
 *
 * Un fallo leyendo la tabla deja la cuenta activa como único alcance, que es el
 * lado seguro: se pierde acceso a lo vinculado, no se gana a lo ajeno.
 */
export async function getAssociatedAccountIds(user: {
  id: string;
  ownerId?: string | null;
  sessionUserId?: string;
}): Promise<string[]> {
  const activeId = user.ownerId ?? user.id;
  const sessionId = user.sessionUserId ?? user.id;
  const ids = new Set<string>([activeId, sessionId, user.id]);

  try {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT la."linked_user_id" AS id
      FROM "linked_accounts" la
      WHERE la."master_user_id" IN (${Prisma.join([activeId, sessionId])})
      UNION
      SELECT la."master_user_id" AS id
      FROM "linked_accounts" la
      WHERE la."linked_user_id" IN (${Prisma.join([activeId, sessionId])})
    `;
    for (const row of rows) if (row.id) ids.add(row.id);
  } catch {
    // Sin la tabla de vinculadas seguimos con la cuenta activa.
  }

  return Array.from(ids);
}
