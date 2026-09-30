/**
 * `next/navigation` fuera de Next, leyendo la dirección de VERDAD de la página.
 *
 * El mudo (`next-navigation-mudo.ts`) devuelve siempre unos parámetros vacíos,
 * y el banco de Copiloto necesita justo lo contrario: que `?u=` llegue a la
 * pantalla tal cual lo escribe quien manda el enlace, para ver qué se embebe.
 */
export function useSearchParams() {
    return new URLSearchParams(globalThis.location?.search ?? "");
}
export function usePathname() {
    return globalThis.location?.pathname ?? "/";
}
export function useRouter() {
    return { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
}
export function useParams() {
    return {} as Record<string, string | string[]>;
}
