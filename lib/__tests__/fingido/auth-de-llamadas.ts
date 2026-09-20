/**
 * `currentUser()` de mentira, para el banco de Llamadas.
 *
 * El de verdad arrastra next-auth entero, y lo que este banco prueba no es
 * quién ha iniciado sesión: es **qué línea encuentra** la cuenta con la que se
 * mira. Se sustituye con un alias de esbuild, así que el código que corre es el
 * de producción **menos esta puerta**: las acciones, la regla pura y la
 * consulta son las de verdad.
 */
type Fila = Record<string, unknown> | null;

let quien: Fila = null;

export function ponerAQuienMira(nuevo: Fila) {
    quien = nuevo;
}

export async function currentUser(): Promise<Fila> {
    return quien;
}
