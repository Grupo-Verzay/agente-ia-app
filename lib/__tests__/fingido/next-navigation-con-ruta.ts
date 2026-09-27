// `next/navigation` para un navegador suelto: la ruta la mueve el banco con
// `window.navegar(ruta)`, y `usePathname` se entera como en la App.
import { useSyncExternalStore } from "react";

let ruta = "/";
const oyentes = new Set<() => void>();
(window as any).navegar = (nueva: string) => {
  ruta = nueva;
  oyentes.forEach((o) => o());
};
export function usePathname() {
  return useSyncExternalStore(
    (o) => { oyentes.add(o); return () => oyentes.delete(o); },
    () => ruta,
    () => ruta,
  );
}
export function useRouter() {
  return { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, prefetch: () => {} };
}
export function useSearchParams() { return new URLSearchParams(); }
