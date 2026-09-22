import { recordarPorSesion } from "@/lib/cache-de-sesion";
import { losEnlacesDeLaCuenta } from "@/lib/alcance-entre-cuentas.server";
import { laFamiliaDeLaCuenta } from "@/lib/familia-de-cuentas";
import { esSuperAdminDeVerdad, type Persona } from "@/lib/super-admin-de-verdad";
import { esAgenteDeLaCuenta, lasCuentasDeLaBandeja } from "@/lib/alcance-de-la-bandeja";

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
function llaveDelAlcance(ids: string[], esSuperAdmin: boolean): string {
  return `cuentas-asociadas|${esSuperAdmin ? "toda" : "abajo"}|${Array.from(new Set(ids)).sort().join("|")}`;
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
 * Ids de las cuentas que alcanza quien está usando la App en Chats: la cuenta
 * por la que actúa, su sesión real, la fila efectiva y **las que cuelgan de esa
 * cuenta hacia abajo** (`lib/alcance-de-la-bandeja.ts`). Nunca la madre ni las
 * hermanas; el superadministrador de verdad, la familia entera.
 *
 * Es el mismo alcance con el que la bandeja LEE los chats, y por eso tiene que
 * ser también el alcance con el que se puede actuar sobre ellos. Cuando no
 * cuadraban, salía lo que se veía en pantalla: una conversación que se abre
 * perfectamente y, al intentar resolverla o reabrirla, un "No autorizado".
 *
 * # Antes miraba en los DOS sentidos, y eso era el punto 5 de la auditoría
 *
 * La consulta juntaba las cuentas vinculadas bajo la propia **y aquellas que la
 * vincularon a ella**, o sea su madre. Desde #898 las puertas de las acciones
 * solo bajan (`assertCanAccessTargetUser`), así que la bandeja de una hija
 * enseñaba las líneas de su madre y cada acción sobre ellas contestaba
 * «No autorizado». Botones rotos.
 *
 * Se derivan aquí, en el servidor, a propósito: no pueden venir del cliente
 * porque entonces bastaría con mandar ids ajenos para leer o escribir cosas de
 * otro.
 *
 * Un fallo leyendo los enlaces deja la cuenta activa como único alcance, que es
 * el lado seguro: se pierde acceso a lo vinculado, no se gana a lo ajeno.
 *
 * ## Por qué se recuerda unos segundos
 *
 * Una sola carga de Chats la llama una vez por petición, y las peticiones de la
 * pantalla son decenas: la lista, el bootstrap, las sesiones y **una precarga
 * de conversación por cada chat que se adelanta**. Se recuerda con el mismo
 * plazo corto que `currentUser` (5 s, ver `lib/cache-de-sesion.ts`).
 */
export async function getAssociatedAccountIds(user: {
  id: string;
  ownerId?: string | null;
  sessionUserId?: string;
} & Persona): Promise<string[]> {
  const activeId = user.ownerId ?? user.id;
  const sessionId = user.sessionUserId ?? user.id;
  // Entra en la llave: el superadministrador y el administrador de la misma
  // cuenta no alcanzan lo mismo, y compartir entrada cinco segundos le pasaría
  // a uno el alcance del otro.
  const esSuperAdmin = esSuperAdminDeVerdad(user);

  return recordarPorSesion(
    llaveDelAlcance([activeId, sessionId, user.id], esSuperAdmin),
    () => consultarElAlcance(activeId, sessionId, user.id, esSuperAdmin),
    // Un alcance recortado por un fallo de la base NO se queda pegado cinco
    // segundos: sería propagar una pérdida de acceso a las peticiones de al
    // lado. Se guarda solo lo que salió de una consulta que fue bien.
    { sirveParaCachear: (ids) => ids.length > 0 && !huboFallo.has(ids) },
  );
}

/**
 * Lo que ENSEÑA la bandeja: lo mismo, salvo para un `agente`, que trabaja en
 * UNA cuenta y no ve las líneas de las que cuelgan de ella. Lo usan la página
 * de Chats y el token de tiempo real, que tienen que decir lo mismo: un aviso
 * en vivo de una línea que no se ve es un aviso de más.
 */
export async function lasCuentasQueVeLaBandeja(user: {
  id: string;
  ownerId?: string | null;
  sessionUserId?: string;
  advisorRole?: string | null;
} & Persona): Promise<string[]> {
  if (esAgenteDeLaCuenta(user)) {
    return lasCuentasDeLaBandeja({
      cuenta: user.ownerId ?? user.id,
      persona: user.sessionUserId ?? user.id,
      efectiva: user.id,
      esSuperAdmin: false,
      esAgente: true,
    });
  }
  return getAssociatedAccountIds(user);
}

async function consultarElAlcance(
  activeId: string,
  sessionId: string,
  propioId: string,
  esSuperAdmin: boolean,
): Promise<string[]> {
  const base = { cuenta: activeId, persona: sessionId, efectiva: propioId, esSuperAdmin };
  try {
    if (esSuperAdmin) {
      const familia = await laFamiliaDeLaCuenta(activeId);
      return lasCuentasDeLaBandeja({ ...base, familia: familia.cuentas });
    }
    const enlaces = await losEnlacesDeLaCuenta(activeId);
    return lasCuentasDeLaBandeja({ ...base, enlaces });
  } catch (error) {
    // Sin los enlaces seguimos con la cuenta activa. Y se dice: un alcance
    // recortado se nota como un "No autorizado" suelto, que es de lo más
    // difícil de diagnosticar si aquí no hay ni una línea.
    console.warn("[cuentas] no se pudieron leer las cuentas vinculadas", error);
    const soloLasSeguras = lasCuentasDeLaBandeja(base);
    huboFallo.add(soloLasSeguras);
    return soloLasSeguras;
  }
}
