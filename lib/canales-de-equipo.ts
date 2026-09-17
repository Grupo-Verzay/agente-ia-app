/**
 * Canales y directos del chat interno. Solo tipos y lo que se puede probar sin
 * levantar nada.
 *
 * # Por qué hay canales
 *
 * Un hilo único por cuenta no aguanta un equipo de verdad: ventas lee lo de
 * desarrollo, desarrollo lee lo de marketing, y **el ruido cruzado hace que se
 * abandone**. Y un chat que se abandona es peor que no tenerlo, porque lo que
 * se escribe ahí ya no lo lee nadie.
 *
 * # Las tres decisiones que conviene no deshacer
 *
 * 1. **El general no tiene lista de miembros.** Es de toda la cuenta y punto.
 *    Con filas habría que acordarse de meter a cada persona nueva, y el día
 *    que se olvide alguien se queda fuera del único canal donde está todo el
 *    mundo — y eso no se ve como un error, se ve como «a mí no me llega nada».
 * 2. **Un directo ES un canal**, de `tipo: "directo"` y dos miembros. Así los
 *    mensajes, las menciones, los avisos y el lector del hilo son los MISMOS:
 *    no hay una segunda tubería que mantener a la par. Su identidad es la
 *    pareja ordenada (`llaveDelDirecto`), para que abrirlo dos veces —uno por
 *    cada lado— no cree dos canales.
 * 3. **Quién manda es la puerta que ya existe** (`canManageWorkspace`): dueño,
 *    `administrador` y superadministrador de verdad; el `agente` participa
 *    pero no manda. Escribir aquí una condición nueva es lo que dejó fuera a
 *    media gente en Clientes, Equipo y Analíticas.
 *
 * Puro a propósito: de aquí tira la pantalla, que es un componente de cliente,
 * y el módulo de al lado importa Prisma. Es el mismo reparto de
 * `avisos-de-tarea-tipos` con `avisos-de-tarea`.
 */

export const TIPOS_DE_CANAL = ["general", "area", "directo"] as const;
export type TipoDeCanal = (typeof TIPOS_DE_CANAL)[number];

/**
 * El id del canal general, y es el mismo para todas las cuentas.
 *
 * No es una fila: es una **constante**, y de ahí sale que los mensajes que ya
 * estaban —escritos cuando el hilo era uno solo— caigan en él sin backfill.
 * Su `canalId` en la tabla es `NULL`, y `canalDeLaFila` los traduce.
 */
export const CANAL_GENERAL = "general";

/** Cómo se llama el general en la pantalla. */
export const NOMBRE_DEL_GENERAL = "General";

/** Cuánto se deja escribir en el nombre de un canal. */
export const TOPE_DEL_NOMBRE = 40;

export type CanalDeEquipo = {
    id: string;
    tipo: TipoDeCanal;
    /** Para un directo es el nombre de la OTRA persona, resuelto al leer. */
    nombre: string;
    /** En un directo, quién es la otra persona. Sirve para el avatar y el orden. */
    conQuienId: string | null;
    /** Si quien mira pertenece. Un administrador ve canales a los que no. */
    pertenezco: boolean;
    /** Si quien mira puede escribir aquí. */
    puedoEscribir: boolean;
};

/**
 * La llave de un directo: la pareja, **ordenada**.
 *
 * Ordenada porque el directo de A con B y el de B con A son el mismo, y cada
 * uno lo abre desde su lado. Sin ordenar saldrían dos canales con los mismos
 * dos miembros y la mitad de los mensajes en cada uno — que desde fuera se lee
 * como «me escribió y no me llegó».
 */
export function llaveDelDirecto(unId: string, otroId: string): string | null {
    const a = unId?.trim();
    const b = otroId?.trim();
    if (!a || !b || a === b) return null;
    return [a, b].sort().join("::");
}

/** El `canalId` de una fila: `NULL` es el general, de cuando no había canales. */
export function canalDeLaFila(canalId: string | null | undefined): string {
    return canalId?.trim() || CANAL_GENERAL;
}

/**
 * Cómo se guarda el nombre de un canal.
 *
 * Sin espacios de sobra y con tope. Vacío devuelve cadena vacía, y es quien
 * llama el que decide si eso es un error: aquí no se inventa un nombre.
 */
export function comoSeGuardaElNombre(texto: string | null | undefined): string {
    return (texto ?? "").trim().replace(/\s+/g, " ").slice(0, TOPE_DEL_NOMBRE);
}

/**
 * Quién puede LEER un canal.
 *
 * Tres reglas, y el orden importa:
 *
 * 1. El **general** lo lee toda la cuenta, sin mirar ninguna lista.
 * 2. Un **administrador** lee todo lo de su cuenta: los canales de área y
 *    también los directos. Es una herramienta de trabajo, no un canal privado.
 * 3. Cualquier otra persona lee **lo suyo**: los canales a los que pertenece.
 */
export function puedeLeerElCanal(input: {
    tipo: TipoDeCanal;
    pertenece: boolean;
    manda: boolean;
}): boolean {
    if (input.tipo === "general") return true;
    if (input.manda) return true;
    return input.pertenece;
}

/**
 * Quién puede ESCRIBIR en un canal.
 *
 * La diferencia con leer es **una sola y es la que pediste**: el administrador
 * escribe en todos los canales de su cuenta, y en los directos **solo en los
 * suyos**. Meterse a escribir en la conversación de otros dos no es supervisar,
 * es suplantar: el mensaje saldría dentro de un hilo de dos con un tercero
 * dentro, y ninguno de los dos lo esperaría.
 */
export function puedeEscribirEnElCanal(input: {
    tipo: TipoDeCanal;
    pertenece: boolean;
    manda: boolean;
}): boolean {
    if (input.tipo === "directo") return input.pertenece;
    if (input.tipo === "general") return true;
    if (input.manda) return true;
    return input.pertenece;
}

/**
 * El orden de la lista: General, luego las áreas, luego los directos.
 *
 * Y dentro de cada grupo, por nombre. El general va **siempre el primero**
 * porque es el único que tiene todo el mundo: si se ordenara solo por nombre,
 * en una cuenta con un canal «Atención» el general saldría el segundo y
 * parecería uno más.
 */
export function ordenDeLosCanales(a: CanalDeEquipo, b: CanalDeEquipo): number {
    const peso = (c: CanalDeEquipo) => (c.tipo === "general" ? 0 : c.tipo === "area" ? 1 : 2);
    const d = peso(a) - peso(b);
    if (d !== 0) return d;
    return a.nombre.localeCompare(b.nombre, "es");
}

export function esTipoDeCanal(v: string): v is TipoDeCanal {
    return (TIPOS_DE_CANAL as readonly string[]).includes(v);
}
