/**
 * `currentUser()` de mentira, para el banco de Documentación.
 *
 * El de verdad arrastra next-auth entero, y lo que este banco prueba no es
 * quién ha iniciado sesión: es **hasta dónde llega** quien mira, que sale de
 * `accesoAEsteEspacio` y `accesoAEsteDocumento`. Se sustituye con un alias de
 * esbuild, así que el código que corre es el de producción **menos esta
 * puerta**: las treinta acciones, la decisión pura y las consultas son las de
 * verdad.
 */
type Fila = Record<string, unknown> | null;

let quien: Fila = null;

export function ponerAQuienMira(nuevo: Fila) {
    quien = nuevo;
}

export async function currentUser(): Promise<Fila> {
    return quien;
}
