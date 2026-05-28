import { AnyElement, BuildCfg, DraftLike, flowBehaviorText, notifyPrompt, Step } from "@/types/agentAi";

// Helper genérico para construir markdown de Steps (Extras, FAQ, Products, Training)
const DEFAULTS: Required<Omit<BuildCfg, "sectionPrefix">> & { sectionPrefix: string } = {
    sectionPrefix: "Paso",
    joinSeparator: "\n\n---\n\n",
    flowBehaviorText: flowBehaviorText,
    includeSignature: false,
    signatureSeparator: "\n\n---\n\n",
    renderMode: "full" as const,
};

function trim(s?: string | null) {
    return (s ?? "").trim();
}
function nonEmpty(s?: string | null) {
    return trim(s).length > 0;
}

function renderElement(el: AnyElement, behaviorText: string, k?: number): string[] {
    const out: string[] = [];

    if (el.kind === "text") {
        if (nonEmpty(el.text)) {
            out.push(k !== undefined ? `- (${k}) **REGLA/PARÁMETRO:** — ${el.text!}` : el.text!);
        }
        return out;
    }

    // kind === "function"
    const prefix = k !== undefined ? `- (${k}) ` : "";
    switch (el.fn) {
        case "captura_datos": {
            const prompt = trim(el.prompt);
            const fields = el.fields ?? [];
            out.push(`${prefix}> **FUNCIÓN**: captura_datos\n${prompt || ""}\nCampos: ${fields.join(", ")}`);
            return out;
        }
        case "ejecutar_flujo": {
            const flow = el.flowName || el.flowId || "";
            out.push(`${prefix}> **FUNCIÓN**: Ejecuta el flujo '${flow}'`, behaviorText);
            return out;
        }
        case "notificar_asesor": {
            out.push(`${prefix}> ${notifyPrompt}`);
            return out;
        }
        case "consulta_datos": {
            const prompt = trim(el.prompt);
            out.push(`${prefix}> **FUNCIÓN**: consulta_datos\n${prompt || ""}`);
            return out;
        }
        case "actualizar_datos": {
            const prompt = trim(el.prompt);
            out.push(`${prefix}> **FUNCIÓN**: actualizar_datos\n${prompt || ""}`);
            return out;
        }
        case "enrutamiento": {
            const activeRules = (el.rules ?? []).filter((r) => r.keywords && r.targetStepName);
            if (activeRules.length === 0) return out;
            out.push(`\n🔀 REGLA DE ENRUTAMIENTO POR CAMPAÑA`);
            out.push(`CONDICIÓN: Se evalúa solo en el PRIMER mensaje del chat (current_step == 1).`);
            out.push(`ACCIÓN: Analizar el primer mensaje y enrutar según coincidencia de palabra clave:\n`);
            activeRules.forEach((rule) => {
                const kws = rule.keywords.split(",").map((k) => `"${k.trim()}"`).filter((k) => k !== '""').join(" / ");
                out.push(`   • Contiene ${kws}`);
                out.push(`     → OMITIR BIENVENIDA → Ir a PASO: ${rule.targetStepName.toUpperCase()}\n`);
            });
            out.push(`FALLBACK: Si el mensaje NO coincide con ninguna palabra clave`);
            out.push(`   → NO enrutar → devolver control al Objetivo principal (ejecutar BIENVENIDA normal).`);
            out.push(`PRIORIDAD: Esta regla se evalúa ANTES de la lógica de BIENVENIDA del Objetivo principal.\n`);
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
        renderMode,
        mainMessageLabel,
        elementsLabel,
    } = { ...DEFAULTS, ...(cfg || {}) };

    const resolveLabel = (n: number) =>
        typeof mainMessageLabel === "function" ? mainMessageLabel(n) : (mainMessageLabel ?? "");

    const resolveElementsLabel = (n: number) =>
        typeof elementsLabel === "function" ? elementsLabel(n) : (elementsLabel ?? "ELEMENTOS:");

    const steps: Step[] = Array.isArray(src) ? src : (src?.steps ?? []);

    const blocks: string[] = [];

    // Firma (opcional)
    if (includeSignature && !Array.isArray(src)) {
        const sig = renderSignature(src);
        if (sig) blocks.push(sig);
    }

    // Secciones
    const sections = steps.map((s, idx) => {
        const n = idx + 1;

        if (renderMode === "answer") {
            const head = nonEmpty(s.title)
                ? `### ${sectionPrefix} ${n} — (${s.title})`
                : `### ${sectionPrefix} ${n}`;
            const label = resolveLabel(n);
            const body: string[] = [];
            if (nonEmpty(s.mainMessage)) {
                const labelLine = label ? `* **${label}**` : "";
                if (labelLine) body.push(labelLine);
                body.push(s.mainMessage!);
            }
            const els = s.elements ?? [];
            if (els.length > 0) {
                body.push(`#### ${resolveElementsLabel(n)}`);
                els.forEach((el, idx) => {
                    body.push(...renderElement(el as AnyElement, flowBehaviorText, idx + 1));
                });
            }
            return [head, ...body].filter(Boolean).join("\n\n");
        }

        if (renderMode === "management") {
            const head = nonEmpty(s.title)
                ? `### ${sectionPrefix} ${n} — (${s.title})`
                : `### ${sectionPrefix} ${n}`;
            const body: string[] = [];
            const label = resolveLabel(n);
            if (nonEmpty(s.mainMessage)) {
                if (label) body.push(`* **${label}**`);
                body.push(s.mainMessage!);
            }
            const mgmtEls = s.elements ?? [];
            if (mgmtEls.length > 0) {
                body.push(`#### ${resolveElementsLabel(n)}`);
                mgmtEls.forEach((el, idx) => {
                    body.push(...renderElement(el as AnyElement, flowBehaviorText, idx + 1));
                });
            }
            return [head, ...body.filter(Boolean)].join("\n\n");
        }

        // "full" — Training: mainMessage + elementos numerados con etiquetas
        const head = `### ${sectionPrefix} ${n}` + (nonEmpty(s.title) ? `: ${s.title}` : "");
        const body: string[] = [];
        const fullLabel = resolveLabel(n);
        if (nonEmpty(s.mainMessage)) {
            if (fullLabel) body.push(`* **${fullLabel}**`);
            body.push(s.mainMessage!);
        }
        const els = s.elements ?? [];
        if (els.length > 0) {
            body.push(`#### ${resolveElementsLabel(n)}`);
            els.forEach((el, idx) => {
                body.push(...renderElement(el as AnyElement, flowBehaviorText, idx + 1));
            });
        }
        return [head, ...body.filter(Boolean)].join("\n\n");
    });

    if (sections.length) blocks.push(sections.join(joinSeparator));

    // Unir firma + secciones
    return blocks.join(signatureSeparator);
}