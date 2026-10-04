/** `next/navigation` para las páginas de la guía: `notFound` lanza, como en Next. */
export function notFound(): never {
    throw new Error("notFound");
}
export function useRouter() {
    return { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
}
export function usePathname() {
    return "/guia/leads";
}
export function useSearchParams() {
    return new URLSearchParams();
}
export function useParams() {
    return {} as Record<string, string | string[]>;
}
