/**
 * `currentUser()` de mentira, para el banco del borrado de Chats.
 *
 * El de verdad arrastra next-auth entero, y lo que este banco prueba no es quien
 * inicio sesion: es que un chat borrado NO vuelve a la lista al recargar. Se
 * sustituye con un alias de esbuild, asi que lo que corre es el codigo de
 * produccion **menos esta puerta** —el borrado, la lectura de marcas y la
 * consulta que arma la bandeja son los de verdad—.
 */
type Fila = Record<string, unknown> | null;

let quien: Fila = null;

export function ponerAQuienMira(nuevo: Fila) {
    quien = nuevo;
}

export async function currentUser(): Promise<Fila> {
    return quien;
}
