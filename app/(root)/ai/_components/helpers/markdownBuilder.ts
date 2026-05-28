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
        const n = idx + 1;

        if (renderMode === "answer") {
            // FAQ: título (pregunta) + mainMessage (respuesta directa)
            // Si mainMessage está vacío, cae atrás a elementos de texto como fallback
            const head = nonEmpty(s.title) ? `### ${n}. ${s.title}` : `### ${n}.`;
            if (nonEmpty(s.mainMessage)) {
                return [head, s.mainMessage!].join("\n\n");
            }
            // Fallback para datos anteriores que tenían la respuesta en elementos
            const textBody = (s.elements ?? [])
                .filter((el) => (el as AnyElement).kind === "text")
                .flatMap((el) => renderElement(el as AnyElement, flowBehaviorText))
                .filter(Boolean);
            return [head, ...textBody].join("\n\n");
        }

        if (renderMode === "qa") {
            // Productos / Extras: título + solo elementos de texto (sin mainMessage, sin funciones)
            const head = nonEmpty(s.title) ? `### ${n}. ${s.title}` : `### ${n}.`;
            const body = (s.elements ?? [])
                .filter((el) => (el as AnyElement).kind === "text")
                .flatMap((el) => renderElement(el as AnyElement, flowBehaviorText))
                .filter(Boolean);
            return [head, ...body].join("\n\n");
        }

        if (renderMode === "management") {
            // Título + todos los elementos, sin mainMessage
            const head = `### ${sectionPrefix} ${n}` + (nonEmpty(s.title) ? `: ${s.title}` : "");
            const body: string[] = [];
            for (const el of s.elements ?? []) {
                body.push(...renderElement(el as AnyElement, flowBehaviorText));
            }
            return [head, ...body.filter(Boolean)].join("\n\n");
        }

        // "full" — comportamiento original
        const head = `### ${sectionPrefix} ${n}` + (nonEmpty(s.title) ? `: ${s.title}` : "");
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