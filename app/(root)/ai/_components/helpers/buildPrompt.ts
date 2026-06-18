import { BusinessValues } from "@/types/agentAi";
import { addPromptItem as add } from "./";
import { buildFirmaBlock } from "./firmaTemplate";

export const buildPrompt = (v: BusinessValues, firma?: { enabled: boolean; name: string }): string => {
    const lines: string[] = [];

    // if (!v.nombre?.trim()) {
    //   return `Completa al menos el nombre del negocio para generar el prompt.`;
    // }

    lines.push(`## 🏢 DATOS DEL NEGOCIO\n`);
    lines.push(`* **Nombre:** ${v.nombre.trim()}`);

    add(lines, "* **Sector/Rubro:**", v.sector);
    add(lines, "* **Ubicación/Dirección:**", v.ubicacion);
    add(lines, "* **Horarios de atención:**", v.horarios);
    add(lines, "* **Número de contacto:**", v.telefono);
    add(lines, "* **Correo electrónico:**", v.email);
    add(lines, "* **Sitio web:**", v.sitio);
    add(lines, "* **Facebook:**", v.facebook);
    add(lines, "* **Instagram:**", v.instagram);
    add(lines, "* **TikTok:**", v.tiktok);
    add(lines, "* **YouTube:**", v.youtube);
    add(lines, "* **LinkedIn:**", v.linkedin);
    add(lines, "* **Twitter/X:**", v.twitter);
    add(lines, "* **Telegram:**", v.telegram);
    if (firma?.enabled && firma.name.trim()) {
        lines.push("\n---\n\n" + buildFirmaBlock(firma.name));
    }

    if (v.notas?.trim()) {
        lines.push("\n---\n\n## 📌 NOTAS ADICIONALES\n");
        lines.push(v.notas.trim());
    }

    if (v.training?.trim()) {
        lines.push("\n---\n\n## 👋 FLUJO DE INICIO Y BIENVENIDA\n");
        lines.push(v.training.trim());
    }

    if (v.faq?.trim()) {
        lines.push("\n---\n\n## ❓ PREGUNTAS & RESPUESTAS\n");
        lines.push(v.faq.trim());
    }

    if (v.products?.trim()) {
        lines.push("\n---\n\n## 💎 CATÁLOGO DE: PRODUCTOS Y SERVICIOS\n");
        lines.push(v.products.trim());
    }

    if (v.more?.trim()) {
        lines.push("\n---\n\n## ⚖️ EXTRAS / OBJECIONES\n");
        lines.push(v.more.trim());
    }

    if (v.management?.trim()) {
        lines.push("\n---\n\n## 📦 GESTIÓN / CIERRE\n");
        lines.push(v.management.trim());
    }

    return lines.join("\n");
};