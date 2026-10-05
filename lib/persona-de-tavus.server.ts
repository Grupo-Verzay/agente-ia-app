import "server-only";

import { createHash } from "node:crypto";

import { elParcheDeLaPersona } from "@/lib/pantalla-del-avatar";
import { esConflictoDelEditor, laBaseDeLaHuella, laCopiaDeLaPersona } from "@/lib/persona-derivada";
import { guardarLaCopia, laCopiaGuardada } from "@/lib/videollamada-ia-db";

/**
 * Con qué persona de Tavus se crea la conversación, de forma que TENGA las
 * herramientas (pantalla, nota, WhatsApp, agendar). Ver `lib/persona-derivada.ts`.
 *
 * 1. Se lee la original. Si ya las tiene, va la original.
 * 2. Si no, se intenta `PATCH` SIN `force`. Si entra, va la original.
 * 3. Si Tavus contesta 409 `maker_changes` (ediciones del editor), NO se fuerza:
 *    se usa una COPIA con las herramientas, guardada por huella y rehecha
 *    cuando la original cambia.
 *
 * Nunca tumba la videollamada: ante cualquier fallo va la original y se dice
 * con `console.error` (sin pantalla, pero con conversación).
 */

export const API_DE_PERSONAS = "https://tavusapi.com/v2/personas";

const enCurso = new Map<string, Promise<string>>();

function laHuella(persona: unknown): string {
    return createHash("sha256").update(laBaseDeLaHuella(persona)).digest("hex");
}

async function decidir(personaId: string, clave: string): Promise<string> {
    const url = `${API_DE_PERSONAS}/${encodeURIComponent(personaId)}`;
    const leida = await fetch(url, { headers: { "x-api-key": clave }, cache: "no-store" });
    if (!leida.ok) throw new Error(`Tavus contestó ${leida.status} al leer la persona`);
    const persona = await leida.json().catch(() => null);
    const parche = elParcheDeLaPersona(persona);
    if (!parche) return personaId;

    const puesta = await fetch(url, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-api-key": clave },
        body: JSON.stringify(parche),
        cache: "no-store",
    });
    if (puesta.ok) {
        console.info("[videollamada] herramientas puestas en la persona", { persona: personaId });
        return personaId;
    }
    const texto = await puesta.text().catch(() => "");
    if (!esConflictoDelEditor(puesta.status, texto)) {
        throw new Error(`Tavus contestó ${puesta.status} al poner las herramientas: ${texto.slice(0, 200)}`);
    }

    // La persona tiene ediciones del editor de Tavus: no se tocan. Va la copia.
    const huella = laHuella(persona);
    const guardada = await laCopiaGuardada(personaId);
    if (guardada && guardada.huella === huella) return guardada.derivadaPersonaId;

    const copia = laCopiaDeLaPersona(persona);
    if (!copia.ok) throw new Error(copia.motivo);
    const creada = await fetch(API_DE_PERSONAS, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": clave },
        body: JSON.stringify(copia.cuerpo),
        cache: "no-store",
    });
    const datos = (await creada.json().catch(() => null)) as { persona_id?: unknown } | null;
    const nueva = typeof datos?.persona_id === "string" ? datos.persona_id : "";
    if (!creada.ok || !nueva) throw new Error(`Tavus contestó ${creada.status} al crear la copia de la persona`);
    await guardarLaCopia(personaId, nueva, huella);
    console.info("[videollamada] la persona tiene ediciones del editor; se usa una copia con las herramientas", {
        persona: personaId,
        copia: nueva,
    });
    if (guardada && guardada.derivadaPersonaId !== nueva) {
        // La copia vieja ya no la usa nadie. Si no se puede borrar, solo estorba.
        void fetch(`${API_DE_PERSONAS}/${encodeURIComponent(guardada.derivadaPersonaId)}`, {
            method: "DELETE",
            headers: { "x-api-key": clave },
            cache: "no-store",
        }).catch(() => undefined);
    }
    return nueva;
}

/** El `persona_id` con el que se crea la conversación. Nunca lanza. */
export async function laPersonaParaLaConversacion(tavus: { clave: string; personaId: string }): Promise<string> {
    const llave = tavus.personaId;
    let promesa = enCurso.get(llave);
    if (!promesa) {
        promesa = decidir(tavus.personaId, tavus.clave)
            .catch((error) => {
                console.error("[videollamada] la persona no tiene las herramientas; la pantalla no va a funcionar", {
                    persona: tavus.personaId,
                    error: error instanceof Error ? error.message : String(error),
                });
                return tavus.personaId;
            })
            .finally(() => enCurso.delete(llave));
        enCurso.set(llave, promesa);
    }
    return promesa;
}
