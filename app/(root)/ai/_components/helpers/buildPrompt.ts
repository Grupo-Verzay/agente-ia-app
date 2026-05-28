import { BusinessValues } from "@/types/agentAi";
import { addPromptItem as add } from "./";

const FIRMA_TEMPLATE =
    "### FIRMA DEL AGENTE\n" +
    "* **Nombre:** *@name*.\n" +
    "* **Firma obligatoria:** Cada mensaje debe iniciar con `*@name*` — NUNCA al final.\n" +
    "* **Siempre pon la firma:** *@name* al inicio de cada mensaje o respuesta que le des al usuario. Esto permite mantener una identidad clara del agente y una conversación ordenada.\n\n" +
    "### Ejemplo de uso real:\n\n" +
    "**Usuario:**\n" +
    "¿Quien eres?\n\n" +
    "**Respuesta del agente:**\n" +
    "@name\n" +
    "Soy un asistente virtual. ¿En qué puedo ayudarte hoy?";

function buildFirmaBlock(name: string): string {
    return FIRMA_TEMPLATE.replaceAll("@name", name.trim());
}

export const buildPrompt = (v: BusinessValues, firma?: { enabled: boolean; name: string }): string => {
    const lines: string[] = [];

    // if (!v.nombre?.trim()) {
    //   return `Completa al menos el nombre del negocio para generar el prompt.`;
    // }

    if (v.notas?.trim()) {
        const identity = v.notas.trim().replace(/#{1,3}\s*🔒\s*MOTOR[\s\S]*/i, "").trim();
        if (identity) {
            lines.push("## IDENTIDAD\n");
            lines.push(identity);
            lines.push(`\n---\n`);
        }
    }

    lines.push(`## DATOS DEL NEGOCIO\n`);
    lines.push(`* **Nombre:** ${v.nombre.trim()}`);

    add(lines, "* **Sector/Rubro:**", v.sector);
    add(lines, "* **Ubicación/Dirección:**", v.ubicacion);
    add(lines, "* **Horarios de atención:**", v.horarios);
    add(lines, "* **Google Maps:**", v.maps);
    add(lines, "* **Número de contacto:**", v.telefono);
    add(lines, "* **Correo electrónico:**", v.email);
    add(lines, "* **Sitio web:**", v.sitio);
    add(lines, "* **Facebook:**", v.facebook);
    add(lines, "* **Instagram:**", v.instagram);
    add(lines, "* **TikTok:**", v.tiktok);
    add(lines, "* **YouTube:**", v.youtube);
    lines.push(`\n---\n`);
    if (v.training?.trim()) {
        lines.push("## INICIO\n");
        lines.push(v.training.trim());
    }

    if (v.faq?.trim()) {
        lines.push("\n## PREGUNTAS & RESPUESTAS\n");
        lines.push(v.faq.trim());
    }

    if (v.products?.trim()) {
        lines.push("\n---\n\n## CATÁLOGO / PRODUCTOS\n");
        lines.push(v.products.trim());
    }

    if (v.more?.trim()) {
        lines.push("\n---\n\n## EXTRAS\n");
        lines.push(v.more.trim());
    }

    if (v.management?.trim()) {
        lines.push("\n---\n\n## GESTIÓN\n");
        lines.push(v.management.trim());
    }

    if (firma?.enabled && firma.name.trim()) {
        lines.push("\n---\n\n" + buildFirmaBlock(firma.name));
    }

    return lines.join("\n");
};