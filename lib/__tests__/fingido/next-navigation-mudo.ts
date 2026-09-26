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
/**
 * Añadido para el banco de los botones del borde: el copiloto lo pide
 * (`useChatContext`). Es aditivo — quien no lo importe no lo nota.
 */
export function useParams() {
    return {} as Record<string, string | string[]>;
}
