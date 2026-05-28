import type { Step } from "@/types/agentAi";

function extractTransitionCondition(step: Step, idx: number): string {
    const mainMsg = (step.mainMessage ?? '');

    // Línea 🔷 REGLA en mainMessage
    const reglaMatch = mainMsg.match(/🔷\s*REGLA[:\s]+([^\n]+)/);
    if (reglaMatch) return reglaMatch[1].replace(/\.$/, '').trim();

    // "Avanza … cuando …" en la NOTA DE CONTROL (tercer elemento de texto)
    const notaEl = (step.elements ?? []).find(
        (el) => el.kind === 'text' && 'text' in el && typeof el.text === 'string' && el.text.includes('NOTA DE CONTROL')
    );
    if (notaEl && notaEl.kind === 'text' && notaEl.text) {
        const m = notaEl.text.match(/[Aa]vanza?\s+(?:a\s+P\d+\s+)?cuando\s+([^.\n]+)/i);
        if (m) return m[1].trim();
    }

    return `Cliente completa el objetivo del paso ${idx + 1}`;
}

/** Construye el bloque de Motor de Flujo Determinista desde los pasos de training. */
export function buildMotorFromTrainingSteps(steps: Step[]): string {
    if (!steps?.length) return '';

    const rows = steps.map((step, idx) => {
        const n = idx + 1;
        const title = (step.title ?? `PASO ${n}`).toUpperCase();
        const condition = extractTransitionCondition(step, idx);
        return `| P${n} | ${title} | ${condition} |`;
    });

    const table = [
        `| Estado | Nombre | Condición para avanzar |`,
        `|--------|--------|------------------------|`,
        ...rows,
        `| FIN | — | Paso P${steps.length} completado |`,
    ].join('\n');

    return `## 🔒 MOTOR FLUJO DETERMINISTA
Estado interno: **current_step** — inicia en P1 en cada conversación nueva.

### TABLA DE TRANSICIÓN
${table}

### REGLAS ABSOLUTAS
R1 — Avance: Solo pasas al siguiente estado cuando se cumple la condición de transición del paso actual.
R2 — Sin retroceso: Nunca vuelves a un paso ya completado.
R3 — Preguntas / Catálogo / Extras / Objeciones: Responder sin modificar current_step. Retornar al paso pendiente.
R4 — Gestión: Ejecutar captura cuando el cliente lo solicite, sin cambiar current_step.
R5 — Un turno, un paso: No ejecutes dos pasos en el mismo mensaje.
R6 — Sin inventar: Usa únicamente la información de la BASE DE CONOCIMIENTO.
R7 — Flujos primero: Ejecuta el flujo indicado antes de emitir cualquier texto en ese paso.
R8 — Reencuadre: Si el cliente desvía la conversación, guíalo de vuelta al objetivo del paso actual.`;
}
