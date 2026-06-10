const EMOJI_RULES: [RegExp, string][] = [
    [/\b(ia|ai|agente|bot|asistente|virtual|robot|inteligencia|gpt)\b/i, "🤖"],
    [/\b(salud|doctor|m[eé]dico|cl[ií]nica|hospital|enfermera|veterinario|farmacia|dental|odontolog)/i, "🏥"],
    [/\b(finanz|banco|cr[eé]dito|pr[eé]stamo|inversi[oó]n|ahorro|seguro|contabilidad|contador)\b/i, "💰"],
    [/\b(viaje|turismo|hotel|aerol[ií]nea|agencia de viaje|tour|vuelo|hospedaje)\b/i, "✈️"],
    [/\b(comida|restaurante|chef|cocina|men[uú]|delivery|pizza|burger|panader[ií]a|caf[eé]ter[ií]a)\b/i, "🍽️"],
    [/\b(moda|ropa|boutique|fashion|estilo|dise[nñ]o)\b/i, "👗"],
    [/\b(deporte|gym|fitness|entrenamiento|nutrici[oó]n|yoga|crossfit)\b/i, "💪"],
    [/\b(legal|abogado|jur[ií]dico|notaría|notaria|asesor[ií]a|consultor[ií]a)\b/i, "⚖️"],
    [/\b(educaci[oó]n|escuela|academia|curso|capacitaci[oó]n|instituto|colegio|universidad)\b/i, "📚"],
    [/\b(inmobiliaria|bienes ra[ií]ces|arriendo|apartamento|departamento|propiedad)\b/i, "🏠"],
    [/\b(auto|carro|veh[ií]culo|mec[aá]nico|taller|automotriz)\b/i, "🚗"],
    [/\b(tecnolog[ií]a|tech|software|desarrollo|programaci[oó]n|soporte)\b/i, "💻"],
    [/\b(belleza|est[eé]tica|spa|peluquer[ií]a|barber[ií]a|manicure|cosm[eé]tico)\b/i, "💅"],
    [/\b(empresa|corporat|negocios|negocio|compa[nñ][ií]a|servicios)\b/i, "🏢"],
];

const DEFAULT_EMOJI = "✨";

const EMOJI_REGEX = /^\p{Emoji}/u;

function pickEmoji(name: string): string {
    for (const [pattern, emoji] of EMOJI_RULES) {
        if (pattern.test(name)) return emoji;
    }
    return DEFAULT_EMOJI;
}

/** Devuelve el nombre listo para insertar en @name: con emoji al inicio, sin asteriscos. */
function formatFirmaName(rawName: string): string {
    const clean = rawName.trim().replace(/^\*+|\*+$/g, "");
    if (EMOJI_REGEX.test(clean)) return clean;
    return `${pickEmoji(clean)} ${clean}`;
}

const FIRMA_TEMPLATE =
    "## ✍️ FIRMA DEL AGENTE\n" +
    "* **Nombre:** *@name*.\n" +
    "* **Firma obligatoria:** Cada mensaje debe iniciar con `*@name*` — NUNCA al final.\n" +
    "* **Siempre pon la firma:** *@name* al inicio de cada mensaje o respuesta que le des al usuario. Esto permite mantener una identidad clara del agente y una conversación ordenada.\n\n" +
    "### Ejemplo de uso real:\n\n" +
    "**Usuario:**\n" +
    "¿Quien eres?\n\n" +
    "**Respuesta del agente:**\n" +
    "*@name*\n" +
    "Soy un asistente virtual. ¿En qué puedo ayudarte hoy?";

export function buildFirmaBlock(name: string): string {
    const formatted = formatFirmaName(name.trim());
    return FIRMA_TEMPLATE.replaceAll("@name", formatted);
}
