import "server-only";

import {
    elEmbudoDeLaConversacion,
    elIndiceDelColorDeLaEtapa,
    laEtapaDeLaConversacion,
    type Embudo,
    type Etapa,
    type EtapaDeLaFila,
} from "@/lib/embudos";
import {
    lasAsignacionesDeVarias,
    lasEtapasDe,
    lasPosicionesDeVarios,
    losEmbudosDeVarias,
} from "@/lib/embudos-db";

/**
 * La etapa del embudo de TODAS las conversaciones de la bandeja, en bloque.
 *
 * # Por qué en bloque y aquí
 *
 * La fila de la lista pinta la etapa igual que pinta el estado del lead o el
 * asesor, así que se necesita para cada chat. Pedirla de a una —como hace la
 * cabecera del chat, que es UNA conversación— serían cientos de consultas por
 * vuelta: es literalmente *muchas peticiones pequeñas son turno, no trabajo*.
 * Va donde ya están las demás cosas de la fila, dentro de
 * `getSesionesDeLaCuenta`, y en el mismo `Promise.all`.
 *
 * Son **cuatro consultas en total** —los embudos de todas las cuentas, sus
 * asignaciones, las etapas de los embudos que se usan y las posiciones de las
 * conversaciones—, no una por chat ni dos por cuenta.
 *
 * # La regla no se vuelve a escribir
 *
 * De qué embudo es una conversación y en qué etapa está lo deciden las MISMAS
 * funciones puras que usan el tablero y la cabecera del chat
 * (`elEmbudoDeLaConversacion`, `laEtapaDeLaConversacion`). Con la regla escrita
 * aquí otra vez, la fila diría una etapa y el tablero otra, y no habría forma
 * de saber cuál miente.
 *
 * # Y la bandeja es de VARIAS cuentas
 *
 * Un embudo es de una cuenta, y la bandeja enseña además las líneas de las
 * cuentas que cuelgan de ella. Así que los embudos se resuelven **por la cuenta
 * de cada conversación** (`sesion.userId`), no por la de quien mira: la etapa de
 * una conversación de Ventas sale de los embudos de Ventas.
 *
 * # Best-effort, y nunca muda
 *
 * Esto es un adorno de la fila: si falla, la bandeja tiene que salir igual —sin
 * pastilla de etapa y con todo lo demás—. Por eso va en su propio `catch`, como
 * los recordatorios. Pero no es mudo: una pastilla que deja de salir sin decir
 * nada se lee como que los embudos se borraron.
 */
export type ConversacionParaEtapa = {
    id: number;
    userId: string;
    assignedAdvisorId: string | null;
};

export async function lasEtapasDeLaBandeja(
    conversaciones: readonly ConversacionParaEtapa[],
): Promise<Map<number, EtapaDeLaFila>> {
    const etapasPorSesion = new Map<number, EtapaDeLaFila>();
    if (conversaciones.length === 0) return etapasPorSesion;

    try {
        const cuentas = Array.from(new Set(conversaciones.map((c) => c.userId).filter(Boolean)));
        if (cuentas.length === 0) return etapasPorSesion;

        // Embudos y asignaciones de TODAS las cuentas: dos consultas, no dos por
        // cuenta. Una cuenta sin embudos no aporta nada y sus filas se quedan
        // sin pastilla, que es lo pedido.
        const [embudosDeLaCuenta, asignacionesDeLaCuenta] = await Promise.all([
            losEmbudosDeVarias(cuentas),
            lasAsignacionesDeVarias(cuentas),
        ]);

        // A qué embudo cae cada conversación, con la regla de siempre.
        const embudoDeLaSesion = new Map<number, string>();
        for (const c of conversaciones) {
            const embudos: Embudo[] = embudosDeLaCuenta.get(c.userId) ?? [];
            if (embudos.length === 0) continue;
            const embudoId = elEmbudoDeLaConversacion(
                c.assignedAdvisorId,
                asignacionesDeLaCuenta.get(c.userId) ?? {},
                embudos,
            );
            if (embudoId) embudoDeLaSesion.set(c.id, embudoId);
        }
        if (embudoDeLaSesion.size === 0) return etapasPorSesion;

        const embudosUsados = Array.from(new Set(embudoDeLaSesion.values()));
        const [etapas, posiciones] = await Promise.all([
            lasEtapasDe(embudosUsados),
            lasPosicionesDeVarios(embudosUsados, Array.from(embudoDeLaSesion.keys())),
        ]);

        // Las etapas de cada embudo, EN SU ORDEN: la posición es la que decide
        // el color de una etapa que no tiene uno elegido.
        const etapasDelEmbudo = new Map<string, Etapa[]>();
        for (const etapa of etapas) {
            const lista = etapasDelEmbudo.get(etapa.embudoId) ?? [];
            lista.push(etapa);
            etapasDelEmbudo.set(etapa.embudoId, lista);
        }
        for (const lista of etapasDelEmbudo.values()) lista.sort((a, b) => a.orden - b.orden);

        for (const [sessionId, embudoId] of embudoDeLaSesion) {
            const lista = etapasDelEmbudo.get(embudoId);
            if (!lista || lista.length === 0) continue;
            const etapaId = laEtapaDeLaConversacion(posiciones.get(`${embudoId}::${sessionId}`), lista);
            const posicion = lista.findIndex((e) => e.id === etapaId);
            if (posicion < 0) continue;
            const etapa = lista[posicion];
            etapasPorSesion.set(sessionId, {
                id: etapa.id,
                nombre: etapa.nombre,
                color: elIndiceDelColorDeLaEtapa(etapa.color, posicion),
            });
        }

        return etapasPorSesion;
    } catch (error) {
        console.error("[chats] no se pudieron leer las etapas del embudo de la bandeja", error);
        return etapasPorSesion;
    }
}
