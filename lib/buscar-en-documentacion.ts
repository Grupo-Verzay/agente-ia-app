import { sinTildes } from "@/lib/pantalla-de-notas";

/**
 * El buscador de Guías y de Tutoriales: sin mirar mayúsculas ni tildes
 * («leads» encuentra «Leads», «guia» encuentra «Guía»), con la MISMA lista de
 * letras que el buscador de Mis notas. Vacío deja pasar todo.
 */
export function coincideConLaBusqueda(consulta: string, ...campos: Array<string | null | undefined>): boolean {
    const q = sinTildes(consulta.trim());
    if (!q) return true;
    return campos.some((c) => sinTildes(String(c ?? "")).includes(q));
}
