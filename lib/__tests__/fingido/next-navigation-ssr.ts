// `next/navigation` para pintar en el servidor del banco: la ruta la pone el
// banco con `globalThis.__ruta` antes de cada `renderToString`.
export function usePathname() { return (globalThis as any).__ruta ?? "/"; }
export function useRouter() {
  return { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, prefetch: () => {} };
}
export function useSearchParams() { return new URLSearchParams(); }
