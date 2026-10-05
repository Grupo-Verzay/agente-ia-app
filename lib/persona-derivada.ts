import { elParcheDeLaPersona } from "@/lib/pantalla-del-avatar";

/**
 * Por qué hay una persona DERIVADA, y no un parche sobre la de verdad.
 *
 * Las herramientas de la videollamada (`mostrar_pantalla`, `tomar_nota`,
 * `enviar_por_whatsapp`, `agendar_seguimiento`) tienen que estar en la persona
 * de Tavus con la que se crea la conversación: si no, el modelo no puede
 * llamarlas, nombra la dirección en voz alta y la pantalla compartida sale
 * vacía (y el avatar nunca se achica, porque eso solo pasa con una pantalla
 * puesta).
 *
 * Ponerlas con `PATCH` falla en cuanto la persona tiene cambios hechos en el
 * editor de Tavus (PAL Maker): contesta **409 `maker_changes`** y pide
 * `force=true`, que BORRARÍA esas ediciones del cliente. Eso es lo que pasaba en
 * producción, en silencio, en cada llamada.
 *
 * Así que, cuando el parche no entra, se crea una COPIA de la persona con las
 * herramientas puestas y se crea la conversación con ella. La persona original
 * no se toca nunca. La copia se rehace sola cuando la original cambia (la
 * huella), así lo que se edite en Tavus sigue mandando.
 */

/** Sube cuando cambian las herramientas o la forma de la copia: rehace las copias. */
export const VERSION_DE_LA_COPIA = 1;

/** Lo que se copia de la persona original. Nada de ids ni fechas suyas. */
export const CAMPOS_QUE_SE_COPIAN = [
    "persona_name",
    "system_prompt",
    "pipeline_mode",
    "context",
    "default_replica_id",
    "document_ids",
    "document_tags",
    "objectives_id",
    "guardrails_id",
    "layers",
] as const;

export const SUFIJO_DE_LA_COPIA = " · plataforma";

function sinNulos(valor: unknown): unknown {
    if (Array.isArray(valor)) return valor.map(sinNulos);
    if (valor && typeof valor === "object") {
        const fuera: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
            if (v === null || v === undefined) continue;
            fuera[k] = sinNulos(v);
        }
        return fuera;
    }
    return valor;
}

/** JSON con las claves ordenadas: dos lecturas iguales dan el mismo texto. */
export function jsonEstable(valor: unknown): string {
    if (Array.isArray(valor)) return `[${valor.map(jsonEstable).join(",")}]`;
    if (valor && typeof valor === "object") {
        const o = valor as Record<string, unknown>;
        return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${jsonEstable(o[k])}`).join(",")}}`;
    }
    return JSON.stringify(valor ?? null);
}

/** Una clave enmascarada (`sk-****`) no sirve para crear otra persona. */
function tieneUnaClaveEnmascarada(valor: unknown): boolean {
    if (Array.isArray(valor)) return valor.some(tieneUnaClaveEnmascarada);
    if (valor && typeof valor === "object") {
        return Object.entries(valor as Record<string, unknown>).some(([k, v]) =>
            /api_?key|secret|token/i.test(k) && typeof v === "string" ? /\*{3,}|•{3,}|\.\.\./.test(v) : tieneUnaClaveEnmascarada(v),
        );
    }
    return false;
}

/**
 * Lo que decide si la copia sigue valiendo: los campos copiados de la original
 * y la versión. La original editada en Tavus → huella nueva → copia nueva.
 */
export function laBaseDeLaHuella(persona: unknown): string {
    const p = (persona && typeof persona === "object" ? persona : {}) as Record<string, unknown>;
    const campos: Record<string, unknown> = { version: VERSION_DE_LA_COPIA };
    for (const c of CAMPOS_QUE_SE_COPIAN) if (p[c] !== undefined && p[c] !== null) campos[c] = p[c];
    return jsonEstable(sinNulos(campos));
}

export type CopiaDeLaPersona =
    | { ok: true; cuerpo: Record<string, unknown> }
    | { ok: false; motivo: string };

/**
 * El cuerpo de `POST /v2/personas` para la copia: los campos de la original,
 * con nuestras herramientas puestas en `layers.llm.tools` y las suyas
 * conservadas. Se rinde (y lo dice) si la persona trae una clave enmascarada.
 */
export function laCopiaDeLaPersona(persona: unknown): CopiaDeLaPersona {
    const p = (persona && typeof persona === "object" ? persona : null) as Record<string, unknown> | null;
    if (!p) return { ok: false, motivo: "La persona no se pudo leer." };
    const cuerpo: Record<string, unknown> = {};
    for (const c of CAMPOS_QUE_SE_COPIAN) if (p[c] !== undefined && p[c] !== null) cuerpo[c] = sinNulos(p[c]);
    if (tieneUnaClaveEnmascarada(cuerpo.layers)) {
        return { ok: false, motivo: "La persona usa una clave de modelo propia que Tavus no devuelve; no se puede copiar." };
    }
    // Las herramientas se ponen con la MISMA regla que el parche, aplicada a la copia.
    const parche = elParcheDeLaPersona(cuerpo) as { path: string; value: unknown }[] | null;
    if (parche) {
        const [op] = parche;
        const capas = (cuerpo.layers && typeof cuerpo.layers === "object" ? { ...(cuerpo.layers as Record<string, unknown>) } : {}) as Record<string, unknown>;
        if (op.path === "/layers") Object.assign(capas, op.value as Record<string, unknown>);
        else if (op.path === "/layers/llm") capas.llm = op.value;
        else capas.llm = { ...(capas.llm as Record<string, unknown>), tools: op.value };
        cuerpo.layers = capas;
    }
    const nombre = typeof cuerpo.persona_name === "string" && cuerpo.persona_name.trim() ? cuerpo.persona_name.trim() : "Verzy";
    cuerpo.persona_name = nombre.endsWith(SUFIJO_DE_LA_COPIA) ? nombre : `${nombre}${SUFIJO_DE_LA_COPIA}`;
    return { ok: true, cuerpo };
}

/** Tavus pide `force=true` porque la persona tiene ediciones del editor. */
export function esConflictoDelEditor(status: number, texto: string): boolean {
    return status === 409 && /maker_changes|PAL Maker|force=true/i.test(texto);
}
