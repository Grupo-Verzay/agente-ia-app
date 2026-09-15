import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { recordarPorSesion } from "@/lib/cache-de-sesion";

/**
 * La llave con la que se recuerda el alcance.
 *
 * NO es la de la sesion: es la de los **ids que deciden la respuesta**. La
 * consulta de abajo solo mira `activeId` y `sessionId`, asi que dos llamadas con
 * los mismos ids devuelven lo mismo venga de donde venga —una ruta, una accion,
 * un usuario u otro—. Con los ids dentro, dos personas distintas no pueden
 * compartir entrada, y ademas se puede llamar desde sitios donde no hay cookies
 * que leer.
 *
 * El prefijo separa este espacio de nombres del de `currentUser`, que guarda
 * hashes en el mismo mapa.
 */
function llaveDelAlcance(ids: string[]): string {
  return `cuentas-asociadas|${Array.from(new Set(ids)).sort().join("|")}`;
}

/**
 * Las respuestas que salieron de un fallo, para no cachearlas.
 *
 * Es un `WeakSet` sobre el array devuelto: no retiene nada -si nadie se queda
 * con ese array, se recoge- y no obliga a cambiarle el tipo de retorno a la
 * función para arrastrar un "esto vino de un error".
 */
const huboFallo = new WeakSet<string[]>();

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
 *
 * ## Por qué se recuerda unos segundos
 *
 * Una sola carga de Chats la llama una vez por petición, y las peticiones de la
 * pantalla son decenas: la lista, el bootstrap, las sesiones y **una precarga
 * de conversación por cada chat que se adelanta**. Medido: 50 llamadas a
 * `/api/chats/conversacion`, y cada una repetía esta consulta —un `UNION` en
 * crudo sobre `linked_accounts`— para devolver la misma lista de ids.
 *
 * Se recuerda con el mismo plazo corto que `currentUser` (5 s, ver
 * `lib/cache-de-sesion.ts`). Vincular o desvincular una cuenta tarda eso en
 * notarse, y vincular no es una operación de cada minuto.
 */
export async function getAssociatedAccountIds(user: {
  id: string;
  ownerId?: string | null;
  sessionUserId?: string;
}): Promise<string[]> {
  const activeId = user.ownerId ?? user.id;
  const sessionId = user.sessionUserId ?? user.id;

  return recordarPorSesion(
    llaveDelAlcance([activeId, sessionId, user.id]),
    () => consultarElAlcance(activeId, sessionId, user.id),
    // Un alcance recortado por un fallo de la base NO se queda pegado cinco
    // segundos: sería propagar una pérdida de acceso a las peticiones de al
    // lado. Se guarda solo lo que salió de una consulta que fue bien.
    { sirveParaCachear: (ids) => ids.length > 0 && !huboFallo.has(ids) },
  );
}

async function consultarElAlcance(
  activeId: string,
  sessionId: string,
  propioId: string,
): Promise<string[]> {
  const ids = new Set<string>([activeId, sessionId, propioId]);

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
  } catch (error) {
    // Sin la tabla de vinculadas seguimos con la cuenta activa. Y se dice: un
    // alcance recortado se nota como un "No autorizado" suelto, que es de lo
    // más difícil de diagnosticar si aquí no hay ni una línea.
    console.warn("[cuentas] no se pudieron leer las cuentas vinculadas", error);
    const soloLasSeguras = Array.from(ids);
    huboFallo.add(soloLasSeguras);
    return soloLasSeguras;
  }

  return Array.from(ids);
}
