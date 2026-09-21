/**
 * `currentUser()` de mentira, para el banco de «Quitar de espera».
 *
 * El de verdad arrastra next-auth entero, y lo que este banco prueba no es
 * quien inicio sesion: es que apagar el sello de «En espera» no toca nada mas
 * —ni el asignado, ni el estado, ni la IA— y que un motivo nuevo la vuelve a
 * encender. Se sustituye con un alias de esbuild, asi que lo que corre es el
 * codigo de produccion **menos esta puerta**: la accion, la comprobacion de
 * permisos (`puedeCerrarOReabrir` → `getAssociatedAccountIds`) y el borrado del
 * sello son los de verdad, contra Postgres.
 */
type Fila = Record<string, unknown> | null;

let quien: Fila = null;

export function ponerAQuienMira(nuevo: Fila) {
  quien = nuevo;
}

export async function currentUser(): Promise<Fila> {
  return quien;
}
