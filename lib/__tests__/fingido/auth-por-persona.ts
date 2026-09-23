import { AsyncLocalStorage } from "node:async_hooks";

/**
 * `currentUser()` de mentira para el banco de la llamada del chat de equipo.
 *
 * Aquí hay DOS personas hablando a la vez —dos navegadores—, así que no vale
 * una variable global: dos acciones que se solapan se pisarían la sesión y la
 * llamada de A se ejecutaría como B. Cada acción corre dentro de
 * `comoPersona(...)`, y `AsyncLocalStorage` le da a cada una la suya aunque se
 * crucen sus `await`.
 *
 * Es lo ÚNICO que se finge: las acciones, las consultas y la regla del modo
 * son las de producción.
 */
type Fila = Record<string, unknown> | null;

const quien = new AsyncLocalStorage<Fila>();

export function comoPersona<T>(fila: Fila, fn: () => Promise<T>): Promise<T> {
    return quien.run(fila, fn);
}

export async function currentUser(): Promise<Fila> {
    return quien.getStore() ?? null;
}
