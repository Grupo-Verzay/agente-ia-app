/**
 * Cambiar el TIPO de activación de un flujo ya creado (Inicio, IA, Flujo o
 * Chatbot).
 *
 * El tipo no es una columna: se DEDUCE de tres cosas (`elTipoDelFlujo`, en
 * `lib/flujos-de-la-lista.ts`) y el motor (`api-webhook`) lee esas tres cosas
 * en crudo, sin mirar ningún tipo:
 *
 * | tipo | qué lo hace serlo | quién lo dispara en el motor |
 * | --- | --- | --- |
 * | Inicio | `triggerOnNewSession` | la bienvenida de un contacto nuevo |
 * | IA | un `IntentTrigger` con su `workflowId` | el agente, por la intención |
 * | Chatbot | palabras clave en `description` | `findWorkflowByDescriptionMatch` |
 * | Flujo | ninguna de las tres | solo a mano o por su nombre |
 *
 * Por eso cambiar de tipo NO es escribir el nuevo: es escribir el nuevo **y
 * quitar los otros dos**. Un chatbot pasado a IA que conservara sus palabras
 * clave seguiría saltando con ellas; un flujo de IA pasado a chatbot que
 * conservara su disparador seguiría saliendo en la lista como IA. Es el fallo
 * que había: el tipo nuevo se añadía y el viejo seguía mandando.
 *
 * Puro: lo usan la acción que guarda, la ventana que lo pide y el banco.
 */
import { elTipoDelFlujo, lasPalabrasClave, type TipoDeFlujo } from "./flujos-de-la-lista";

export const TOPE_DE_PALABRAS_CLAVE = 20;

export type Coincidencia = "exacta" | "contiene";

export interface ActivacionPedida {
    tipo: TipoDeFlujo;
    palabras?: readonly string[];
    coincidencia?: Coincidencia;
    condicion?: string;
}

export interface CambiosDelTipo {
    triggerOnNewSession: boolean;
    /** Lo que se escribe en `description`: el JSON del chatbot, o vacío. */
    description: string;
    /** Con IA, la condición del disparador; en los demás tipos se borra. */
    disparador: { condicion: string } | null;
    /** Solo puede haber una bienvenida por cuenta: las demás se apagan. */
    apagarLasOtrasBienvenidas: boolean;
}

const TIPOS: readonly TipoDeFlujo[] = ["inicio", "ia", "flujo", "chatbot"];

export function esTipoDeFlujo(valor: unknown): valor is TipoDeFlujo {
    return typeof valor === "string" && (TIPOS as readonly string[]).includes(valor);
}

/** Las palabras como se guardan: sin espacios de más, en minúsculas, sin repetir y con su tope. */
export function lasPalabrasQueSeGuardan(palabras: readonly unknown[] | undefined): string[] {
    const vistas = new Set<string>();
    const fuera: string[] = [];
    for (const p of palabras ?? []) {
        if (typeof p !== "string") continue;
        const limpia = p.trim().toLowerCase();
        if (!limpia || vistas.has(limpia)) continue;
        vistas.add(limpia);
        fuera.push(limpia);
        if (fuera.length >= TOPE_DE_PALABRAS_CLAVE) break;
    }
    return fuera;
}

export function laDescripcionDelChatbot(palabras: readonly unknown[] | undefined, coincidencia?: Coincidencia): string {
    const limpias = lasPalabrasQueSeGuardan(palabras);
    if (!limpias.length) return "";
    return JSON.stringify({ matchType: coincidencia === "contiene" ? "contiene" : "exacta", keywords: limpias });
}

/** Por qué no se puede guardar ese tipo, o `null` si se puede. */
export function porQueNoSePuedeCambiar(pedida: Partial<ActivacionPedida> | null | undefined): string | null {
    if (!pedida || !esTipoDeFlujo(pedida.tipo)) return "Elige un tipo de activación.";
    if (pedida.tipo === "chatbot" && !lasPalabrasQueSeGuardan(pedida.palabras).length) {
        return "Agrega al menos una palabra clave: sin ellas el chatbot no se activa.";
    }
    if (pedida.tipo === "ia" && !pedida.condicion?.trim()) {
        return "Escribe la descripción de la intención.";
    }
    return null;
}

/** Qué se escribe para que el flujo sea de ese tipo y de NINGÚN otro. */
export function losCambiosDelTipo(pedida: ActivacionPedida): CambiosDelTipo {
    return {
        triggerOnNewSession: pedida.tipo === "inicio",
        description: pedida.tipo === "chatbot" ? laDescripcionDelChatbot(pedida.palabras, pedida.coincidencia) : "",
        disparador: pedida.tipo === "ia" ? { condicion: (pedida.condicion ?? "").trim() } : null,
        apagarLasOtrasBienvenidas: pedida.tipo === "inicio",
    };
}

/** El tipo que se deduce DESPUÉS de aplicar los cambios: tiene que ser el pedido. */
export function elTipoTrasLosCambios(id: string, cambios: CambiosDelTipo): TipoDeFlujo {
    return elTipoDelFlujo(
        { id, triggerOnNewSession: cambios.triggerOnNewSession, description: cambios.description },
        new Set(cambios.disparador ? [id] : []),
    );
}

/** Con qué abre la ventana de cambiar: lo que el flujo es hoy, para no hacer escribir de nuevo. */
export function laActivacionActual(
    flujo: { id: string; triggerOnNewSession?: boolean | null; description?: string | null },
    condicionDelDisparador: string | null | undefined,
): Required<ActivacionPedida> {
    const tipo = elTipoDelFlujo(flujo, new Set(condicionDelDisparador != null ? [flujo.id] : []));
    let coincidencia: Coincidencia = "exacta";
    try {
        const parsed = JSON.parse(flujo.description ?? "");
        if (parsed?.matchType === "contiene") coincidencia = "contiene";
    } catch {
        // Texto suelto de antes: exacta.
    }
    return {
        tipo,
        palabras: lasPalabrasClave(flujo.description),
        coincidencia,
        condicion: condicionDelDisparador ?? "",
    };
}
