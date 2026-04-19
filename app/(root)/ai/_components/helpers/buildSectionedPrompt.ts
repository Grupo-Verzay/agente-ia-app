import { AnyEl, AnyStep, flowBehaviorText as initialFlowBehaviorText, notifyPrompt, PromptBuildConfig } from "@/types/agentAi";

export const transformSubtype = (subtype?: string): string | undefined => {
    const transformMap: Record<string, string> = {
        Solicitudes: "solicitud",
        Reclamos: "reclamo",
        Pedidos: "pedido",
        Reservas: "reserva",
        Citas: "cita",
    };
    return subtype ? transformMap[subtype] : undefined;
};

function trimOrUndefined(s?: string) {
    const t = (s ?? "").trim();
    return t.length ? t : undefined;
}

// nombres de sección “Solicitudes/Reclamos/…”
function getGestionTitle(subtype?: string) {
    const t = (subtype ?? "").toLowerCase();
    if (t === "solicitud") return "Solicitudes";
    if (t === "reclamo") return "Reclamos";
    if (t === "pedido") return "Pedidos";
    if (t === "reserva") return "Reservas";
    if (t === "cita") return "Citas";
    return subtype ? subtype : "Gestión";
}

// textos “Cuando un usuario…”
function getGestionWhenText(subtype?: string) {
    const t = (subtype ?? "").toLowerCase();
    if (t === "solicitud") {
        return "Cuando un usuario exprese una solicitud, recopila todos los datos **uno a uno** o **en una sola toma si el usuario los da completos** de la siguiente manera:";
    }
    if (t === "reclamo") {
        return "Cuando un usuario exprese una queja o problema, debes recopilar los datos **uno a uno** o **en una sola toma si el usuario los da completos** de la siguiente manera:";
    }
    if (t === "pedido") {
        return "Cuando un usuario exprese realizar un **pedido**, recopila todos los datos **uno a uno** o **en una sola toma si el usuario los da completos** de la siguiente manera:";
    }
    if (t === "reserva") {
        return "Cuando un usuario exprese una reserva, recopila todos los datos **uno a uno** o **en una sola toma si el usuario los da completos** de la siguiente manera:";
    }
    if (t === "cita") {
        return "Cuando un usuario exprese agendar una **cita**";
    }
    return "Cuando un usuario exprese esta gestión, recopila todos los datos **uno a uno** o **en una sola toma si el usuario los da completos** de la siguiente manera:";
}

// ejemplos por tipo (si no hay fields, igual queda “Ejemplo…” como en tu muestra)
function getGestionEjemplo(subtype?: string) {
    const t = (subtype ?? "").toLowerCase();
    if (t === "solicitud") return ["Ejemplo.", "* *Nombre*:", "* *Detalles*:"].join("\n");
    if (t === "reclamo") return ["Ejemplo.", "* *Nombre*:", "* *Reporte*:"].join("\n");
    if (t === "pedido")
        return [
            "Ejemplo.",
            "* *Nombre*:",
            "* *Documento*:",
            "* *Celular*:",
            "* *Correo*:",
            "* *Dirección*:",
            "* *Ciudad*:",
            "* *Códigos*:",
            "* *Cantidad*:",
            "* *Color*:",
        ].join("\n");
    if (t === "reserva")
        return ["Ejemplo.", "* *Nombre*:", "* *Fecha*:", "* *Hora*:", "* *Cantidad*:", "* *Detalles*:"].join("\n");
    return "";
}

function formatElement(el: AnyEl, k: number, flowBehaviorText: string, cfg: PromptBuildConfig): string[] {
    const out: string[] = [];

    if (el.kind === "text") {
        const t = trimOrUndefined(el.text);
        if (t) out.push(`- (${k}) **Regla/parámetro:** ${t}\n`);
        return out;
    }

    if (el.kind === "function") {
        switch (el.fn) {
            case "captura_datos": {
                const newSubtype = transformSubtype(el.subtype);

                // CITA
                if (newSubtype === "cita") {
                    const url = cfg.appointmentUrl?.trim() ? `${cfg.appointmentUrl}` : "<https://enlace/agenda>";

                    // MODO MANAGEMENT (formato gestión)
                    if (cfg.mode === "management") {
                        const gestionName = String(cfg.__managementIndex ?? 1);
                        const ruleParam = trimOrUndefined(el.ruleParam);

                        out.push(
                            [
                                `#### Elementos de la gestión ${gestionName}`,
                                `**(${k}) Toma de cita**`,
                                `- (${k}) 🗓 Puedes agendar tu cita en nuestro calendario.\n`,
                                `👉 ${url}\n`,
                                `* **Comportamiento obligatorio:** Tras enviar el link de la agenda, responde **únicamente** lo indicado en **Regla/parámetro**.`,
                                ` Si **no hay una orden clara**, adapta una **respuesta contextual** para guiar al usuario al siguiente paso lógico de la conversación. **No añadas texto innecesario.**`,
                                ``,
                                ruleParam ? `- (${k}) **Regla/parámetro:** ${ruleParam}` : "",
                            ]
                                .filter(Boolean)
                                .join("\n")
                        );
                        return out;
                    }

                    // MODO DEFAULT (tu salida original)
                    out.push(
                        [
                            `**(${k}) Toma de cita**`,
                            `- (${k}) 🗓 Puedes agendar tu cita en nuestro calendario.\n`,
                            `👉 ${url}\n`,
                            `*  **Comportamiento obligatorio:**`,
                            `  1. Tras enviar el link de la agenda, responde **únicamente** lo indicado en **Regla/parámetro**.`,
                            `  2. Si **no hay una orden clara**, adapta una **respuesta contextual** para guiar al usuario al siguiente paso lógico de la conversación. **No añadas texto innecesario.**\n`,
                        ].join("\n")
                    );
                    return out;
                }

                // MAPA
                const generoMap: Record<string, { articulo: string; label: string }> = {
                    solicitud: { articulo: "de la", label: "solicitud" },
                    reserva: { articulo: "de la", label: "reserva" },
                    cita: { articulo: "de la", label: "cita" },
                    pedido: { articulo: "del", label: "pedido" },
                    reclamo: { articulo: "del", label: "reclamo" },
                };

                const info = newSubtype ? generoMap[newSubtype] ?? { articulo: "la", label: newSubtype } : { articulo: "la", label: "gestión" };

                if (cfg.mode === "management") {
                    const gestionName = String(cfg.__managementIndex ?? 1);
                    const ruleParam = trimOrUndefined(el.ruleParam);

                    const datosBlock = el.fields?.length ? el.fields.map((f) => `* ${f}`).join("\n") : "* * *Datos*: [escritos por el cliente]";
                    // const ejemplo = getGestionEjemplo(newSubtype ?? info.label);

                    out.push(
                        [
                            `#### Elementos de la gestión ${gestionName}`,
                            `**(${k}) Toma de ${info.label}**`,
                            `- (${k}) Para procesar tu *${info.label}*, ${el.prompt ?? "por favor indicame los siguientes datos."}`,
                            `${datosBlock}`,
                            // ejemplo ? `${ejemplo}` : "",
                            ``,
                            `> Para la toma de tu ${info.label} correctamente.`,
                            ``,
                            `* **Comportamiento obligatorio:** Pasos de recolección y almacenamiento de datos`,
                            `Todos los datos del usuario deben ser **guardados en tu Memoria o Sistema** en tiempo real para no volver a pedirlos más adelante.`,
                            ``,
                            `#### Paso 1: Plantilla de registro, actualización y confirmacion de datos completos.`,
                            `* *Datos*: [Todos los datos suministrados por el usuario]`,
                            ``,
                            `¿Esta correcto para *tomar tu ${info.label}?*`,
                            ``,
                            `#### Paso 2: Registro cuando tengas los datos completos.`,
                            `* **Campos a registrar (comunes):** en \`DETALLES\` *(string, una sola línea)* → **resumen unificado** con todos los datos recolectados del usuario *(nombre, documento, descripción de la ${info.label}, notas, etc.)* en formato \`Clave: Valor\` separado por \`, \`.`,
                            `* **Regla:** omite las claves vacías; solo incluye lo que exista.`,
                            `* **WhatsApp:** se toma automáticamente del número de teléfono (no solicitar).`,
                            `* **Fecha:** se toma automáticamente de la **zona horaria del sistema** (no solicitar).`,
                            `* Asegúrate de incluir todos los datos provistos por el usuario.`,
                            `* **Notificación**: tras registrar, ejecuta la **tool**: \`Notificacion Asesor\`.`,
                            `* **Comportamiento obligatorio:** Tras ejecutar la tool, responde **únicamente** lo indicado en **Regla/parámetro**.`,
                            `Si **no hay una orden clara**, envía el siguiente **mensaje de confirmación** al usuario:`,
                            `> 📝 ¡He **registrado** tu ${info.label}! 👨🏻‍💻 El area encargada se pondrá en contacto a la brevedad posible. ⏰`,
                            ``,
                            ruleParam ? `- (${k}) **Regla/parámetro:** ${ruleParam}` : "",
                        ]
                            .filter(Boolean)
                            .join("\n")
                    );

                    return out;
                }

                // DEFAULT (tu salida original)
                const base = `\n### Captura de datos\n**(${k}) Toma de ${newSubtype ?? ""}**\n- (${k}) Para procesar tu *${newSubtype ?? "—"}*, ${el.prompt ?? ""}:`;
                out.push(base);

                if (el.fields?.length) out.push(`${el.fields.join("\n")}`);
                return out;
            }

            case "actualizar_datos": {
                const newSubtype = transformSubtype(el.subtype);
                const base = `\n### Actualizar datos\n**(${k}) Toma de ${newSubtype ?? ""}**\n- (${k}) Para procesar tu *${newSubtype ?? "—"}*, ${el.prompt ?? ""}:`;
                out.push(base);
                if (el.fields?.length) out.push(`${el.fields.join("\n")}`);
                return out;
            }

            case "ejecutar_flujo": {
                out.push(`- (${k}) **Función**: Ejecuta el flujo '${el.flowName || el.flowId || ""}'`);
                out.push(`${flowBehaviorText}\n`);
                return out;
            }

            case "notificar_asesor": {
                out.push(`- (${k}) ${notifyPrompt}\n`);
                return out;
            }

            case "consulta_datos": {
                const newSubtype = transformSubtype(el.subtype);
                const base = `\n### Consulta de datos\n**(${k}) Toma de ${newSubtype ?? ""}**\n- (${k}) Para procesar tu *${newSubtype ?? "—"}*, ${el.prompt ?? ""}:`;
                out.push(base);
                if (el.fields?.length) out.push(`${el.fields.join("\n")}`);
                return out;
            }

            default:
                return out;
        }
    }

    return out;
}

/**
 * Construye un prompt con estructura homogénea para Items/Pasos.
 */
export function buildSectionedPrompt(items: AnyStep[], cfg: PromptBuildConfig): string {
    const blocks: string[] = [];
    const joinSep = cfg.joinSeparator ?? "\n";
    const flowBehaviorText = cfg.flowBehaviorText ?? initialFlowBehaviorText;

    // Firma (opcional)
    if (cfg.firma?.enabled) {
        const ft = trimOrUndefined(cfg.firma.text);
        if (ft) blocks.push(ft);
    }

    // Empty
    if (!items || items.length === 0) {
        blocks.push(cfg.emptyMessage);
        return blocks.join(joinSep);
    }

    // Contenido
    items.forEach((step, i) => {
        const n = i + 1;

        if (cfg.mode === "management") {
            cfg.__managementIndex = n;

            const captura = (step.elements || []).find(
                (el: AnyEl) => el.kind === "function" && el.fn === "captura_datos"
            ) as AnyEl | undefined;

            const newSubtype = transformSubtype(captura?.subtype ?? "") ?? "gestión";

            blocks.push(`\n### Gestión ${n} — ${getGestionTitle(newSubtype)}`);
        } else {
            blocks.push(`\n${cfg.sectionLabel(n, step)}`);
        }

        // Mensaje principal
        const main = trimOrUndefined(step.mainMessage);

        if (cfg.mode === "management") {
            // Objetivo: si cfg.managementObjective existe, usa ese; si no, usa main
            const objective = trimOrUndefined(cfg.managementObjective) ?? main ?? String(n);
            blocks.push(`* **Objetivo principal de la gestión:** ${objective}`);

            // “Cuando un usuario…”
            const captura = (step.elements || []).find(
                (el: AnyEl) => el.kind === "function" && el.fn === "captura_datos"
            ) as AnyEl | undefined;

            const newSubtype = transformSubtype(captura?.subtype ?? "") ?? "gestión";
            blocks.push(`${getGestionWhenText(newSubtype)}\n`);
        } else {
            if (main) blocks.push(`* **${cfg.mainMessageLabel}** \n${main}\n`);
        }

        // Elementos
        const els = Array.isArray(step.elements) ? step.elements : [];

        const hasActions = els.some((el: AnyEl) => {
            if (el.kind === "function") {
                return el.fn === "ejecutar_flujo" || el.fn === "notificar_asesor";
            }
            if (el.kind === "text") {
                return !!trimOrUndefined(el.text);
            }
            return false;
        });

        if (hasActions || cfg.mode === "management") {
            if (cfg.mode !== "management") {
                blocks.push(`${cfg.elementsLabel(n, step)}`);
            }

            els.forEach((el, idx) => {
                const k = idx + 1;
                blocks.push(...formatElement(el, k, flowBehaviorText, cfg));
            });

            blocks.push("---");
        }
    });

    return blocks.join(joinSep);
}