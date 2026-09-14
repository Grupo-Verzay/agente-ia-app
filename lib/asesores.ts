import type { AdvisorInfo } from "@/actions/team-actions";

/**
 * La lista de asesores, con la cuenta propia dentro.
 *
 * La cuenta propia sale en el desplegable para poder asignarse chats a uno
 * mismo, pero **no es un asesor dado de alta en Equipo**: por eso entra con
 * `esDelEquipo: false` y no suma en el contador del icono.
 *
 * Vive aqui porque habia DOS copias de esto —una en `chats/page.tsx` y otra en
 * `actions/chat-bootstrap-actions.ts`— y las dos arman la misma lista por
 * caminos distintos: la primera para el primer pintado, la segunda para la
 * carga inicial. Dos copias de la misma regla es como dos pantallas acaban
 * diciendo numeros distintos del mismo dato.
 *
 * El orden importa y no es casual: la cuenta propia se pone PRIMERO y las de la
 * consulta despues, para que si alguien esta en las dos gane la del equipo, que
 * es la que trae su rol y su marca de verdad.
 */
export function conLaCuentaPropia(
  asesores: AdvisorInfo[],
  user: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    company?: string | null;
    advisorRole?: string | null;
  },
): AdvisorInfo[] {
  if (!user.id) return asesores;

  const cuentaPropia: AdvisorInfo = {
    id: user.id,
    name: user.company || user.name || user.email || "Yo",
    email: user.email || "",
    advisorRole: user.advisorRole ?? null,
    esDelEquipo: false,
  };

  const porId = new Map<string, AdvisorInfo>();
  porId.set(cuentaPropia.id, cuentaPropia);
  for (const asesor of asesores) porId.set(asesor.id, asesor);
  return Array.from(porId.values());
}
