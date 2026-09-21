/**
 * `currentUser()` de mentira, para el banco de la fila de Chats.
 *
 * El de verdad arrastra next-auth entero, y lo que este banco prueba no es
 * quién inició sesión: es que **los valores guardados siguen en la base**
 * después de quitarle a la fila sus dos selectores. Se sustituye con un alias
 * de esbuild, así que lo que corre es el código de producción **menos esta
 * puerta**: la consulta que alimenta la bandeja es la de verdad.
 */
type Fila = Record<string, unknown> | null;

let quien: Fila = null;

export function ponerAQuienMira(nuevo: Fila) {
    quien = nuevo;
}

export async function currentUser(): Promise<Fila> {
    return quien;
}
