import { AnyElement, BuildCfg, DraftLike, flowBehaviorText, notifyPrompt, Step } from "@/types/agentAi";

// Helper genérico para construir markdown de Steps (Extras, FAQ, Products, Training)
const DEFAULTS: Required<Omit<BuildCfg, "sectionPrefix">> & { sectionPrefix: string } = {
    sectionPrefix: "Paso",
    joinSeparator: "\n\n---\n\n",
    flowBehaviorText: flowBehaviorText,
    includeSignature: false,
    signatureSeparator: "\n\n---\n\n",
};

function trim(s?: string | null) {
    return (s ?? "").trim();
}
function nonEmpty(s?: string | null) {
    return trim(s).length > 0;
}

function renderElement(el: AnyElement, behaviorText: string): string[] {
    const out: string[] = [];

    if (el.kind === "text") {
        if (nonEmpty(el.text)) out.push(el.text!);
        return out;
    }

    // kind === "function"
    switch (el.fn) {
        case "captura_datos": {
            const prompt = trim(el.prompt);
            const fields = el.fields ?? [];
            out.push(`> **Función**: captura_datos\n${prompt || ""}\nCampos: ${fields.join(", ")}`);
            return out;
        }
        case "ejecutar_flujo": {
            const flow = el.flowName || el.flowId || "";
            out.push(`> **Función**: Ejecuta el flujo '${flow}'`, behaviorText);
            return out;
        }
        case "notificar_asesor": {
            // out.push(`${notifyPrompt}: ${el.notificationNumber || ""}`);
            out.push(`${notifyPrompt}`);
            return out;
        }
        case "consulta_datos": {
            const prompt = trim(el.prompt);
            out.push(`> **Función**: consulta_datos\n${prompt || ""}`);
            return out;
        }
        case "actualizar_datos": {
            const prompt = trim(el.prompt);
            out.push(`> **Función**: actualizar_datos\n${prompt || ""}`);
            return out;
        }
        default:
            return out;
    }
}

function renderSignature(draft?: DraftLike): string | undefined {
    if (!draft?.firmaEnabled) return;
    const content = trim(draft.firmaText);
    if (!content) return;
    return content;
}

/**
 * Construye el markdown a partir de un draft (con steps) o de un array de steps.
 */
export function buildSectionedMarkdown(
    src: DraftLike | Step[] | undefined,
    cfg?: BuildCfg
): string {
    const {
        sectionPrefix,
        joinSeparator,
        flowBehaviorText,
        includeSignature,
        signatureSeparator,
    } = { ...DEFAULTS, ...(cfg || {}) };

    const steps: Step[] = Array.isArray(src) ? src : (src?.steps ?? []);

    const blocks: string[] = [];

    // Firma (opcional)
    if (includeSignature && !Array.isArray(src)) {
        const sig = renderSignature(src);
        if (sig) blocks.push(sig);
    }

    // Secciones
    const sections = steps.map((s, idx) => {
        const head =
            `### ${sectionPrefix} ${idx + 1}` + (nonEmpty(s.title) ? `: ${s.title}` : "");
        const body: string[] = [];
        if (nonEmpty(s.mainMessage)) body.push(s.mainMessage!);
        for (const el of s.elements ?? []) {
            body.push(...renderElement(el as AnyElement, flowBehaviorText));
        }
        return [head, ...body.filter(Boolean)].join("\n\n");
    });

    if (sections.length) blocks.push(sections.join(joinSeparator));

    // Unir firma + secciones
    return blocks.join(signatureSeparator);
}