const FIRMA_TEMPLATE =
    "## ✍️ FIRMA DEL AGENTE\n" +
    "* **Nombre:** *@name*.\n" +
    "* **Firma obligatoria:** Cada mensaje debe iniciar con `*@name*` — NUNCA al final.\n" +
    "* **Siempre pon la firma:** *@name* al inicio de cada mensaje o respuesta que le des al usuario. Esto permite mantener una identidad clara del agente y una conversación ordenada.\n\n" +
    "### Ejemplo de uso real:\n\n" +
    "**Usuario:**\n" +
    "¿Quien eres?\n\n" +
    "**Respuesta del agente:**\n" +
    "@name\n" +
    "Soy un asistente virtual. ¿En qué puedo ayudarte hoy?";

export function buildFirmaBlock(name: string): string {
    return FIRMA_TEMPLATE.replaceAll("@name", name.trim());
}
