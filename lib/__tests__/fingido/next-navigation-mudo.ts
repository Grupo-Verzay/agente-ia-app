/** `next/navigation` fuera de Next: lo que se pulse se anota y no navega. */
export function useRouter() {
    return {
        push: (url: string) => {
            const w = globalThis as unknown as { __navegado?: string[] };
            (w.__navegado ??= []).push(url);
        },
        replace: () => {},
        refresh: () => {},
        back: () => {},
        forward: () => {},
        prefetch: () => {},
    };
}
export function usePathname() {
    return "/crm/llamadas";
}
export function useSearchParams() {
    return new URLSearchParams();
}
