/**
 * `next/headers` fingido para el banco de los enlaces de planes: las cookies de
 * la petición salen de `globalThis.__cookies` (que pone cada prueba) y
 * `headers()` solo sabe del host.
 */
type Galletas = Record<string, string>;
const lasDeAhora = (): Galletas => ((globalThis as { __cookies?: Galletas }).__cookies ?? {});

export function cookies() {
    return {
        get(nombre: string) {
            const valor = lasDeAhora()[nombre];
            return valor === undefined ? undefined : { name: nombre, value: valor };
        },
        has: (nombre: string) => nombre in lasDeAhora(),
        getAll: () => Object.entries(lasDeAhora()).map(([name, value]) => ({ name, value })),
    };
}

export function headers() {
    return new Map<string, string>([["host", "localhost"]]);
}
