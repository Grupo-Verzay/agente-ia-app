/**
 * `currentUser()` de mentira, para el banco de `cuentas-de-finanzas`.
 *
 * El de verdad arrastra next-auth entero, y lo que este banco prueba no es
 * quién ha iniciado sesión: es a qué cuentas llega quien mira, que sale de
 * `linked_accounts` y de `esLaCuentaMadre`. Se sustituye con un alias de
 * esbuild, así que el código que corre es el de producción menos esta puerta.
 *
 * `ponerAQuienMira` admite una FUNCIÓN además de una fila, para poder afirmar
 * que en el camino de siempre —sin parámetro en la URL— a esto no se le
 * pregunta nada.
 */
type Fila = Record<string, unknown> | null;
type Quien = Fila | (() => Fila);

let quien: Quien = null;

export function ponerAQuienMira(nuevo: Quien) {
    quien = nuevo;
}

export async function currentUser(): Promise<Fila> {
    return typeof quien === "function" ? quien() : quien;
}
