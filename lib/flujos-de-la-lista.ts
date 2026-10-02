/**
 * Las reglas de la LISTA de Crear flujos (`/workflow`): de qué tipo es cada
 * flujo, qué filtra cada pastilla y cuándo se puede reordenar.
 *
 * Puro: lo usan el servidor (que cuenta los flujos de cada tipo), la barra (que
 * filtra con esas mismas pastillas), la guía pública (`lib/guia-flujos.ts`) y el
 * banco. Con el tipo deducido en dos sitios, una pastilla diría «3» y al
 * pulsarla la lista enseñaría 2.
 */

export type TipoDeFlujo = "inicio" | "ia" | "flujo" | "chatbot";

/** Los cuatro tipos, en el orden de las pastillas y de la ventana de crear. */
export const TIPOS_DE_FLUJO: readonly {
    clave: TipoDeFlujo;
    nombre: string;
    color: string;
    ayuda: string;
}[] = [
    { clave: "inicio", nombre: "Inicio", color: "#F97316", ayuda: "Se envía solo a quien escribe por primera vez" },
    { clave: "ia", nombre: "IA", color: "#3B82F6", ayuda: "La IA lo lanza cuando entiende lo que pide el cliente" },
    { clave: "flujo", nombre: "Flujo", color: "#8B5CF6", ayuda: "Lo lanzas tú o la IA desde sus instrucciones" },
    { clave: "chatbot", nombre: "Chatbot", color: "#10B981", ayuda: "Se lanza cuando el cliente escribe una palabra clave" },
];

type FlujoMinimo = { id: string; triggerOnNewSession?: boolean | null; description?: string | null };

/**
 * De qué tipo es un flujo. El orden importa y es el de siempre: la bienvenida
 * gana a todo; un flujo con disparador de IA es de IA aunque tenga palabras
 * clave; con palabras clave es un chatbot; y lo demás, un flujo a secas.
 */
export function elTipoDelFlujo(flujo: FlujoMinimo, conDisparadorDeIa: ReadonlySet<string>): TipoDeFlujo {
    if (flujo.triggerOnNewSession) return "inicio";
    if (conDisparadorDeIa.has(flujo.id)) return "ia";
    if (flujo.description?.trim()) return "chatbot";
    return "flujo";
}

/** Cuántos hay de cada tipo, con los cuatro siempre presentes (un tipo sin flujos vale 0). */
export function losConteosPorTipo(flujos: FlujoMinimo[], conDisparadorDeIa: ReadonlySet<string>): Record<TipoDeFlujo, number> {
    const conteos: Record<TipoDeFlujo, number> = { inicio: 0, ia: 0, flujo: 0, chatbot: 0 };
    for (const f of flujos) conteos[elTipoDelFlujo(f, conDisparadorDeIa)]++;
    return conteos;
}

/** Pulsar la pastilla puesta la quita; pulsar otra la pone. */
export function alPulsarUnTipo(actual: TipoDeFlujo | null, pulsado: TipoDeFlujo): TipoDeFlujo | null {
    return actual === pulsado ? null : pulsado;
}

/** Sin tildes ni mayúsculas, para que «envio» encuentre «Envío». */
function sinTildes(texto: string): string {
    return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Las palabras clave de un flujo de Chatbot. Se guardan como JSON
 * (`{ matchType, keywords }`) y las más viejas como texto suelto; buscar sobre
 * el JSON crudo haría que «contiene» encontrara todos los chatbots.
 */
export function lasPalabrasClave(description: string | null | undefined): string[] {
    const texto = description?.trim();
    if (!texto) return [];
    try {
        const parsed = JSON.parse(texto);
        if (parsed && typeof parsed === "object") {
            if (Array.isArray(parsed.keywords)) return parsed.keywords.filter((k: unknown): k is string => typeof k === "string");
            if (typeof parsed.keyword === "string") return parsed.keyword ? [parsed.keyword] : [];
        }
    } catch {
        // Texto suelto de antes: es la palabra clave tal cual.
    }
    return [texto];
}

/** Si un flujo entra en la lista con la búsqueda y la pastilla puestas. Busca en el nombre y en las palabras clave. */
export function pasaElFiltro(
    flujo: FlujoMinimo & { name: string },
    busqueda: string,
    tipo: TipoDeFlujo | null,
    conDisparadorDeIa: ReadonlySet<string>,
): boolean {
    if (tipo && elTipoDelFlujo(flujo, conDisparadorDeIa) !== tipo) return false;
    const q = sinTildes(busqueda.trim());
    if (!q) return true;
    return sinTildes([flujo.name, ...lasPalabrasClave(flujo.description)].join(" ")).includes(q);
}

/**
 * Por qué no se puede arrastrar, o `null` si se puede. Con un filtro puesto la
 * lista enseña solo una parte y el orden se guarda con la posición de cada
 * uno: reordenar ese trozo movería de sitio a los escondidos.
 */
export function porQueNoSePuedeOrdenar(busqueda: string, tipo: TipoDeFlujo | null): string | null {
    if (busqueda.trim() && tipo) return "Quita la búsqueda y el filtro para reordenar.";
    if (busqueda.trim()) return "Borra la búsqueda para reordenar.";
    if (tipo) return "Quita el filtro de tipo para reordenar.";
    return null;
}
