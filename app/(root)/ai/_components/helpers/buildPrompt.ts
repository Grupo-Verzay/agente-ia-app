import { BusinessValues } from "@/types/agentAi";
import { addPromptItem as add } from "./";

export const buildPrompt = (v: BusinessValues): string => {
    const lines: string[] = [];

    // if (!v.nombre?.trim()) {
    //   return `Completa al menos el nombre del negocio para generar el prompt.`;
    // }

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
    // lines.push(`\n---\n`);
    // lines.push(`${STARTING_INSTRUCTION}`);
    lines.push(`\n---\n`);
    if (v.notas?.trim()) {
        lines.push("### NOTAS ADICIONALES\n");
        lines.push(v.notas.trim());
        lines.push(`\n---\n`);
    }
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

    return lines.join("\n");
};