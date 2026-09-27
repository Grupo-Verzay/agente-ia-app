/**
 * `next/headers` de mentira para el banco de Correo. La cookie del viaje de
 * autorización y el host salen de `globalThis`, que el banco pone a mano.
 */
const g = globalThis as any;
export function cookies() {
    return {
        get(nombre: string) {
            const v = g.__cookiesDelBanco?.[nombre];
            return v === undefined ? undefined : { name: nombre, value: v };
        },
    };
}
export async function headers() {
    return new Map([["host", g.__hostDelBanco ?? "app.banco.test"], ["x-forwarded-proto", "https"]]);
}
