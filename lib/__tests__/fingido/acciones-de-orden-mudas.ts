/**
 * El guardado del orden de una columna, mudo.
 *
 * `components/shared/OrdenDeColumna.tsx` lo importa, y esa acción arrastra
 * `lib/tickets-db` —y con él `server-only` y `node:crypto`—, o sea medio
 * servidor dentro de un paquete de navegador. La lista de directos del chat de
 * equipo se arrastra con él; la cabecera que este banco mide, no.
 */
export async function guardarElOrdenDeLaColumnaAction() {
    return { success: false as const, message: "el banco no guarda ningun orden" };
}
