import { AnyElement, BuildCfg, DraftLike, flowBehaviorText, FnCommon, notifyPrompt, Step } from "@/types/agentAi";

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

// Template configs por subtipo de captura_datos
const CAPTURA_CFG: Record<string, { singular: string; datosLabel: string; camposDetail: string }> = {
    Solicitudes: {
        singular: "solicitud",
        datosLabel: "escritos por el cliente",
        camposDetail: "*(nombre, documento, descripción de la solicitud, notas, etc.)*",
    },
    Reclamos: {
        singular: "reporte",
        datosLabel: "escritos por el cliente",
        camposDetail: "*(nombre, documento, descripción del reporte, notas, etc.)*",
    },
    Pedidos: {
        singular: "pedido",
        datosLabel: "De acuerdo a los ingresados en el sistema",
        camposDetail: "*(nombre, documento, descripción del pedido, cantidad, producto, color/talla, dirección, ciudad, envío/retiro, fecha, método de pago, monto, comprobante, notas, etc.)*",
    },
    Reservas: {
        singular: "reserva",
        datosLabel: "escritos por el cliente",
        camposDetail: "*(nombre, documento, descripción de la reserva, fecha, hora, cantidad, notas, etc.)*",
    },
};

function buildCapturaBlock(el: FnCommon, k?: number): string[] {
    const subtype = el.subtype;
    const fields = el.fields ?? [];
    const kStr = k !== undefined ? `(${k}) ` : "";

    if (subtype === "Citas") {
        const url = trim(el.prompt);
        const validUrl = url && url !== "URL de agendamiento" ? url : "";
        const urlLine = validUrl ? `\n\n👉 ${validUrl}` : "";
        const header = `**${kStr}Toma de cita**`;
        const citasBehavior = `* **COMPORTAMIENTO OBLIGATORIO:** — Tras enviar el link de la cita, responde **únicamente** lo indicado en **REGLA/PARÁMETRO**. Si **no hay una orden clara**, adapta una **respuesta contextual** para guiar al usuario al siguiente paso lógico de la conversación. **No añadas texto innecesario.**`;
        return [`${header}\n- ${kStr}🗓 Puedes agendar tu cita en nuestro calendario.${urlLine}`, citasBehavior];
    }

    const cfg = CAPTURA_CFG[subtype ?? "Solicitudes"] ?? CAPTURA_CFG["Solicitudes"];
    const { singular, datosLabel, camposDetail } = cfg;

    const fieldLines = fields
        .map(f => { const name = f.trim().replace(/^\*\s*/, ""); return name ? `* *${name}*:` : ""; })
        .filter(Boolean)
        .join("\n");

    const header = `**${kStr}Toma de ${singular}**`;
    const intro = `- ${kStr}Para procesar tu *${singular}*, por favor indicame los siguientes datos.`;
    const datosBlock = `* * *Datos*: [${datosLabel}]\nEjemplo.${fieldLines ? "\n" + fieldLines : ""}`;
    const blockquote = `> Para la toma de tu ${singular} correctamente.`;

    const comportamiento = `* **COMPORTAMIENTO OBLIGATORIO:** Pasos de recolección y almacenamiento de datos\nTodos los datos del usuario deben ser **guardados en tu Memoria o Sistema** en tiempo real para no volver a pedirlos más adelante.\n\n#### PASO 1: PLANTILLA DE REGISTRO, ACTUALIZACIÓN Y CONFIRMACIÓN DE DATOS COMPLETOS.\n* *Datos*: [Todos los datos suministrados por el usuario]\n\n¿Esta correcto para *tomar tu ${singular}?*\n\n#### PASO 2: REGISTRO CUANDO TENGAS LOS DATOS COMPLETOS.\n* **CAMPOS A REGISTRAR (COMUNES):** en \`DETALLES\` *(string, una sola línea)* → **resumen unificado** con todos los datos recolectados del usuario ${camposDetail} en formato \`Clave: Valor\` separado por \`, \`.\n* **Regla:** omite las claves vacías; solo incluye lo que exista.\n* **WhatsApp:** se toma automáticamente del número de teléfono (no solicitar).\n* **Fecha:** se toma automáticamente de la **zona horaria del sistema** (no solicitar).\n* Asegúrate de incluir todos los datos provistos por el usuario.\n* **Notificación**: tras registrar, ejecuta la **tool**: \`Notificacion Asesor\`.\n* **COMPORTAMIENTO OBLIGATORIO:** Tras ejecutar la tool, responde **únicamente** lo indicado en **REGLA/PARÁMETRO**.\nSi **no hay una orden clara**, envía el siguiente **mensaje de confirmación** al usuario:\n> 📝 ¡He **registrado** tu **${singular}**! 👨🏻‍💻 Un asesor se pondrá en contacto a la brevedad posible. ⏰`;

    return [`${header}\n${intro}\n${datosBlock}\n\n${blockquote}`, comportamiento];
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
            return buildCapturaBlock(el, k);
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
                ? `### ${sectionPrefix} ${n} — ${s.title}`
                : `### ${sectionPrefix} ${n}`;
            const body: string[] = [];
            const label = resolveLabel(n);
            if (nonEmpty(s.mainMessage)) {
                const content = label ? `* **${label}**\n${s.mainMessage!}` : s.mainMessage!;
                body.push(content);
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