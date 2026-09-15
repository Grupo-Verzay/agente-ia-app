import { createHash } from "node:crypto";

/**
 * Recuerda QUIEN ERES durante unos segundos, por proceso.
 *
 * ## El problema
 *
 * `currentUser()` cuesta entre 2 y 4 consultas -la sesion, el usuario real, el
 * efectivo y, segun el caso, las credenciales del dueño o las cuentas
 * vinculadas-. Esta memoizado con `cache()` de React, pero eso deduplica
 * **dentro de un render**, y un route handler no abre ese ambito: ahi `cache()`
 * es un paso directo.
 *
 * Con todo Chats fuera de la cola de acciones, una sola carga son la lista, el
 * bootstrap, las sesiones y hasta dos precargas: cinco peticiones, cada una
 * resolviendo lo mismo desde cero. Medido cuando la precarga subio a cuatro a
 * la vez: `acceso` paso de 65-72 ms a 427-606.
 *
 * ## La llave ES la credencial
 *
 * Se guarda contra las **tres cosas que deciden el resultado**, que son las
 * mismas tres que lee `_currentUser`: las cookies de sesion de Auth.js, el
 * `impersonate_user_id` y el `active_account_id`.
 *
 * Que la llave sea la credencial tiene dos consecuencias, y las dos importan:
 *
 * 1. **Dos personas no pueden compartir entrada.** La cookie de sesion es un
 *    JWT firmado y distinto por persona; dos llaves iguales exigirian dos
 *    cookies byte a byte identicas, o sea la misma sesion.
 * 2. **El conmutador de cuentas se invalida solo.** Entrar a la cuenta de un
 *    cliente escribe `impersonate_user_id`; salir la borra. Como esa cookie es
 *    parte de la llave, la peticion siguiente calcula otra llave y no encuentra
 *    nada. No hay una lista de sitios que haya que acordarse de invalidar: si
 *    cambia lo que decide quien eres, cambia la llave.
 *
 * ## Lo que esto NO cubre
 *
 * Si a alguien le cambian el rol o le deshabilitan la cuenta, sus peticiones
 * siguen viendo el valor anterior **hasta 5 segundos**. Se acepta a sabiendas,
 * y lo que acota el daño es que aqui se cachea **quien eres**, no **a que
 * llegas**: `getAssociatedAccountIds`, `assertCanAccessTargetUser` y las
 * puertas de las rutas de Chats consultan en vivo en cada llamada.
 */

/** Segundos, no minutos: cubre una carga de Chats y poco mas. */
export const TTL_MS = 5_000;

/** Acotado: un proceso de larga vida no puede acumular sesiones sin freno. */
const TOPE_DE_ENTRADAS = 500;

/** Separador de campos al armar la llave. No aparece en una cookie. */
const SEPARADOR = "|::|";

type Entrada<T> = { valor: Promise<T>; at: number };

const entradas = new Map<string, Entrada<unknown>>();

/** Cookies cuyo nombre delata la sesion, en cualquiera de sus formas. */
function esCookieDeSesion(nombre: string): boolean {
  // `authjs.session-token`, `next-auth.session-token`, con o sin el prefijo
  // `__Secure-` de HTTPS, y sus TROZOS (`.0`, `.1`) cuando la cookie es grande.
  // Mirar solo una de las partes haria que dos sesiones que comparten el primer
  // trozo cayeran en la misma llave.
  return nombre.includes("session-token");
}

/**
 * La llave de esta peticion, o `null` si no hay sesion.
 *
 * Pura a proposito: recibe las cookies y devuelve una cadena. Asi se puede
 * probar sin levantar nada, que es la unica forma de demostrar que dos personas
 * distintas no colisionan.
 */
export function llaveDeLaSesion(
  cookies: Array<{ name: string; value: string }>,
): string | null {
  const deSesion = cookies
    .filter((c) => esCookieDeSesion(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `${c.name}=${c.value}`);

  // Sin cookie de sesion no hay nada que recordar: que lo resuelva cada vez.
  if (deSesion.length === 0) return null;

  const impersonate = cookies.find((c) => c.name === "impersonate_user_id")?.value ?? "";
  const activa = cookies.find((c) => c.name === "active_account_id")?.value ?? "";

  // Se guarda el HASH y no las cookies en crudo: si algun dia se vuelca la
  // memoria del proceso, las llaves de este mapa no son credenciales.
  return createHash("sha256")
    .update([deSesion.join("\n"), impersonate, activa].join(SEPARADOR))
    .digest("hex");
}

/**
 * Devuelve lo recordado para esa llave, o resuelve y lo recuerda.
 *
 * Guarda la PROMESA, no el valor: dos peticiones que entran a la vez comparten
 * una sola resolucion en vez de lanzar dos.
 *
 * `sirveParaCachear` decide que se queda. Un `null` -sin sesion- nunca se
 * cachea: seria recordar que alguien no ha entrado, y eso tiene que volver a
 * comprobarse siempre.
 *
 * `ahoraMs` es un parametro para poder probar la caducidad sin esperar cinco
 * segundos de reloj.
 */
export function recordarPorSesion<T>(
  llave: string | null,
  resolver: () => Promise<T>,
  opciones?: { sirveParaCachear?: (valor: T) => boolean; ahoraMs?: number },
): Promise<T> {
  if (!llave) return resolver();

  const ahora = opciones?.ahoraMs ?? Date.now();
  const guardada = entradas.get(llave) as Entrada<T> | undefined;
  if (guardada && ahora - guardada.at < TTL_MS) return guardada.valor;

  const promesa = resolver();
  entradas.set(llave, { valor: promesa, at: ahora });

  // Lo que no sirve para cachear se quita en cuanto se sabe. Y si la resolucion
  // revienta tampoco se deja el fallo pegado: la siguiente vuelve a intentarlo.
  const sirve = opciones?.sirveParaCachear;
  void promesa.then(
    (valor) => {
      if (sirve && !sirve(valor) && entradas.get(llave)?.valor === promesa) {
        entradas.delete(llave);
      }
    },
    () => {
      if (entradas.get(llave)?.valor === promesa) entradas.delete(llave);
    },
  );

  limpiar(ahora);
  return promesa;
}

function limpiar(ahora: number): void {
  // Barrido barato: solo cuando el mapa ya es grande merece la pena recorrerlo.
  if (entradas.size <= TOPE_DE_ENTRADAS) return;
  for (const [llave, entrada] of Array.from(entradas.entries())) {
    if (ahora - entrada.at >= TTL_MS) entradas.delete(llave);
  }
  // Si aun asi sigue lleno -500 sesiones vivas en cinco segundos-, se vacia: es
  // una cache, y quedarse sin memoria es peor que resolver de mas.
  if (entradas.size > TOPE_DE_ENTRADAS) entradas.clear();
}

/** Solo para las pruebas. */
export function vaciarParaPruebas(): void {
  entradas.clear();
}
