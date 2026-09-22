/**
 * La sesión de next-auth y las cookies de Next, fingidas para el banco del
 * alcance entre cuentas.
 *
 * A diferencia de los otros bancos, aquí `currentUser()` es el DE VERDAD
 * (`lib/auth.ts`): lo que se prueba es justo cómo lee las cookies de
 * «Ingresar» y del conmutador. Así que lo único que se finge es lo que viene de
 * la petición —quién ha iniciado sesión y qué cookies trae— y todo lo de
 * encima corre como en producción.
 */
let _sesion: string | null = null;
const _cookies = new Map<string, string>();

export function ponerLaSesion(userId: string | null, cookies: Record<string, string> = {}) {
    _sesion = userId;
    _cookies.clear();
    for (const [k, v] of Object.entries(cookies)) _cookies.set(k, v);
}

export function lasCookies(): Record<string, string> {
    return Object.fromEntries(_cookies);
}

export async function auth() {
    return _sesion ? { user: { id: _sesion } } : null;
}

export function cookies() {
    return {
        get: (name: string) => (_cookies.has(name) ? { name, value: _cookies.get(name)! } : undefined),
        getAll: () => Array.from(_cookies.entries()).map(([name, value]) => ({ name, value })),
        set: (name: string, value: string) => void _cookies.set(name, value),
        delete: (name: string) => void _cookies.delete(name),
        has: (name: string) => _cookies.has(name),
    };
}

export async function headers() {
    return new Map<string, string>([["host", "localhost"]]);
}

// Lo demás que `@/auth` exporta y el banco no usa.
export async function signIn() {
    throw new Error("signIn no se usa en este banco");
}
export async function signOut() {}
export const handlers = {};
