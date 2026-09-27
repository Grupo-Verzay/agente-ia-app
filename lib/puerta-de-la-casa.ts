import "server-only";

import { currentUser } from "@/lib/auth";
import { mandaEnLaCasaDeVerdad } from "@/lib/mando-de-la-casa";

/**
 * La puerta de las acciones de la plataforma: resuelve quién llama y dice si
 * manda en la casa (`lib/mando-de-la-casa.ts`).
 *
 * Devuelve la persona o `null`, **y el rechazo no es mudo**: lo normal no es un
 * ataque, es una pantalla que se abrió a quien no debía, y sin el aviso no hay
 * forma de saber cuál. Va aparte de la regla para que la regla se pueda probar
 * sin arrastrar la sesión.
 */
export async function quienMandaEnLaCasa(donde: string) {
    const persona = await currentUser();
    if (persona && (await mandaEnLaCasaDeVerdad(persona))) return persona;
    console.warn("[casa] acción de la plataforma rechazada", {
        donde,
        persona: persona?.id ?? null,
        rol: persona?.role ?? null,
    });
    return null;
}
