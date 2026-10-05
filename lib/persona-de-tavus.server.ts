import "server-only";

import { elParcheDeLaPersona } from "@/lib/pantalla-del-avatar";

/**
 * Antes de crear una conversación, la persona de Tavus (Verzy, o el avatar
 * propio de la cuenta) tiene que tener la herramienta `mostrar_pantalla`. Si
 * no la tiene, el modelo no puede llamarla: nombra la dirección en voz alta y
 * en la pantalla del cliente no aparece nada. Antes nadie la registraba.
 *
 * Se mira con `GET /v2/personas/<id>` y, si falta o está vieja, se pone con
 * `PATCH` (parche JSON, conservando las demás herramientas). Se recuerda por
 * proceso SOLO si salió bien: un fallo se vuelve a intentar en la siguiente
 * conversación. Nunca tumba la videollamada: sin pantalla, la llamada sigue.
 */

export const API_DE_PERSONAS = "https://tavusapi.com/v2/personas";

const alDia = new Set<string>();
const enCurso = new Map<string, Promise<boolean>>();

async function revisar(personaId: string, clave: string): Promise<boolean> {
    const url = `${API_DE_PERSONAS}/${encodeURIComponent(personaId)}`;
    const leida = await fetch(url, { headers: { "x-api-key": clave }, cache: "no-store" });
    if (!leida.ok) throw new Error(`Tavus contestó ${leida.status} al leer la persona`);
    const parche = elParcheDeLaPersona(await leida.json().catch(() => null));
    if (!parche) return true;
    const puesta = await fetch(url, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-api-key": clave },
        body: JSON.stringify(parche),
        cache: "no-store",
    });
    if (!puesta.ok) {
        const texto = await puesta.text().catch(() => "");
        throw new Error(`Tavus contestó ${puesta.status} al poner la herramienta: ${texto.slice(0, 200)}`);
    }
    console.info("[videollamada] herramienta de la pantalla puesta en la persona", { persona: personaId });
    return true;
}

export async function asegurarLaPantallaEnLaPersona(tavus: { clave: string; personaId: string }): Promise<boolean> {
    const llave = tavus.personaId;
    if (alDia.has(llave)) return true;
    let promesa = enCurso.get(llave);
    if (!promesa) {
        promesa = revisar(tavus.personaId, tavus.clave)
            .then((ok) => {
                if (ok) alDia.add(llave);
                return ok;
            })
            .catch((error) => {
                console.error("[videollamada] no se pudo poner la herramienta de la pantalla en la persona", {
                    persona: tavus.personaId,
                    error: error instanceof Error ? error.message : String(error),
                });
                return false;
            })
            .finally(() => enCurso.delete(llave));
        enCurso.set(llave, promesa);
    }
    return promesa;
}
