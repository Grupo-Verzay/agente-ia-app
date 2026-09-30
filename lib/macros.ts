/**
 * Las reglas de las MACROS: qué acciones hay, cómo se llaman, qué le falta a
 * cada una para poder correrse, por qué línea sale lo que envían y cómo se
 * cuenta lo que pasó al correrlas.
 *
 * Puro: lo usan la pantalla de Mis macros (el editor, la lista y sus filtros),
 * la acción que la corre sobre una conversación, el botón «Macros» de Chats y
 * la guía pública. Con una lista en cada sitio, el día que se añada una acción
 * la guía la nombraría y el editor no, o al revés.
 *
 * # Por qué existe
 *
 * Documentar la pantalla destapó que una macro podía decir «Macro aplicada» sin
 * haber hecho nada:
 *
 * - Lo que ENVÍA (mensaje, archivo, respuesta rápida, flujo) salía siempre por
 *   el camino de Evolution. En una línea de WhatsApp Mensajería o de un canal
 *   de Meta la acción devolvía «no hay instancia o API key» —sin lanzar—, así
 *   que se contaba como hecha y al cliente no le llegaba nada.
 * - Una acción a medio configurar (un mensaje vacío, un flujo sin elegir) se
 *   saltaba en silencio y también se contaba como hecha.
 *
 * Así que se decide aquí qué le falta a cada una (`porQueNoEstaLista`): el
 * editor no deja guardar una macro con una acción a medias, y al correrla lo
 * que no está lista se CUENTA como fallida y se dice por qué.
 */
import type { LeadStatus } from "@/types/session";

export type MacroActionType =
    | "SEND_TEXT"
    | "SEND_QUICK_REPLY"
    | "SEND_TEXT_VIA"
    | "SEND_FILE"
    | "EXECUTE_FLOW"
    | "ADD_TAG"
    | "REMOVE_TAG"
    | "CHANGE_STAGE"
    | "ASSIGN_ADVISOR"
    | "TRANSFER_ADVISOR"
    | "CREATE_TASK"
    | "INTERNAL_NOTE"
    | "TOGGLE_AI"
    | "WAIT"
    | "RESOLVE";

export type MacroActionItem = {
    type: MacroActionType;
    config?: {
        text?: string;
        instanceName?: string; // línea por la que se envía (SEND_TEXT_VIA)
        // SEND_TEXT_VIA por una línea de Meta: plantilla aprobada en vez de
        // texto libre. Fuera de la ventana de 24 h Meta solo acepta plantillas.
        viaMode?: "text" | "template"; // por defecto "text"
        templateName?: string;
        templateLanguage?: string;
        templateBody?: string; // cuerpo con {{n}} (para pintar el saliente en el panel)
        templateParams?: string[]; // valores de {{1}}, {{2}}…
        quickReplyId?: number;
        tagId?: number;
        // La CALIFICACIÓN del lead (Frío, Tibio…). La llave se llama `stage` y
        // la acción `CHANGE_STAGE` por las macros que ya están guardadas; en la
        // pantalla es «Cambiar calificación», que es como la llama el resto de
        // la plataforma («etapa» es la del embudo, otra cosa).
        stage?: string | null;
        advisorId?: string;
        content?: string;
        disabled?: boolean;
        workflowId?: string;
        // SEND_FILE (un archivo fijo, subido al bucket)
        mediaUrl?: string;
        mediatype?: string; // image | video | audio | document
        mimetype?: string;
        fileName?: string;
        caption?: string;
        // CREATE_TASK
        taskTitle?: string;
        taskType?: string;
        taskDays?: number; // vence hoy + N días
        // WAIT
        seconds?: number;
    };
};

/** Cómo se llama cada acción en la pantalla, en el orden en que se ofrece. */
export const ETIQUETA_DE_ACCION: Record<MacroActionType, string> = {
    SEND_TEXT: "Enviar mensaje",
    SEND_QUICK_REPLY: "Enviar respuesta rápida",
    SEND_TEXT_VIA: "Enviar por otra línea",
    SEND_FILE: "Enviar archivo o nota de voz",
    EXECUTE_FLOW: "Ejecutar flujo",
    ADD_TAG: "Agregar etiqueta",
    REMOVE_TAG: "Quitar etiqueta",
    CHANGE_STAGE: "Cambiar calificación",
    ASSIGN_ADVISOR: "Asignar asesor",
    TRANSFER_ADVISOR: "Transferir asesor",
    CREATE_TASK: "Crear tarea",
    INTERNAL_NOTE: "Agregar nota interna",
    TOGGLE_AI: "Agente IA",
    WAIT: "Esperar (pausa)",
    RESOLVE: "Resolver conversación",
};

/**
 * Las acciones por GRUPO, que es como las ofrece el selector del editor (cada
 * grupo es un `<optgroup>`) y como las explica la guía.
 */
export const GRUPOS_DE_ACCIONES: readonly { grupo: string; tipos: readonly MacroActionType[] }[] = [
    { grupo: "Responder", tipos: ["SEND_TEXT", "SEND_QUICK_REPLY", "SEND_TEXT_VIA", "SEND_FILE", "EXECUTE_FLOW"] },
    { grupo: "Clasificar", tipos: ["ADD_TAG", "REMOVE_TAG", "CHANGE_STAGE"] },
    { grupo: "Enrutar", tipos: ["ASSIGN_ADVISOR", "TRANSFER_ADVISOR"] },
    { grupo: "Interno", tipos: ["CREATE_TASK", "INTERNAL_NOTE", "TOGGLE_AI"] },
    { grupo: "Control", tipos: ["WAIT", "RESOLVE"] },
];

/** Todas, en el orden del selector. */
export const ORDEN_DE_ACCIONES: readonly MacroActionType[] = GRUPOS_DE_ACCIONES.flatMap((g) => g.tipos);

/** Las que ENVÍAN algo al cliente: son las que dependen de la línea. */
export const ACCIONES_QUE_ENVIAN: readonly MacroActionType[] = [
    "SEND_TEXT",
    "SEND_QUICK_REPLY",
    "SEND_TEXT_VIA",
    "SEND_FILE",
    "EXECUTE_FLOW",
];

/** El tope de una pausa: la macro corre dentro de una petición y no puede colgarla. */
export const SEGUNDOS_MAXIMOS_DE_ESPERA = 20;

/**
 * La pausa que se pinta cuando nadie la cambió. Es la que el campo enseñaba
 * desde siempre, así que es la que se cumple: antes el campo decía «2» y la
 * acción, sin nada guardado, no esperaba nada.
 */
export const SEGUNDOS_POR_DEFECTO = 2;

/** Cuántos segundos espera una pausa: lo guardado, o los de por defecto. */
export function losSegundosDeLaEspera(c: MacroActionItem["config"]): number {
    const s = c?.seconds;
    return s === undefined || s === null ? SEGUNDOS_POR_DEFECTO : Number(s);
}

/** Los tipos de tarea que ofrece «Crear tarea». */
export const TIPOS_DE_TAREA = ["Seguimiento", "Llamada", "Reunión", "Email", "Tarea"] as const;

/** Los colores rápidos de una macro. */
export const COLORES_DE_MACRO = [
    "#6366f1", "#3b82f6", "#06b6d4", "#14b8a6", "#10b981", "#22c55e",
    "#84cc16", "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#8b5cf6",
] as const;

const lleno = (v: unknown) => typeof v === "string" && v.trim().length > 0;

/**
 * Qué le falta a una acción para poder correrse, o `null` si está lista.
 *
 * Es la MISMA pregunta al guardar y al correr: el editor no deja guardar una
 * acción a medias, y una macro vieja que ya tenga una se cuenta como fallida
 * al correrla, con este mismo motivo, en vez de saltarse en silencio.
 *
 * @param calificaciones  Las que la plataforma reconoce (las de las pastillas).
 */
export function porQueNoEstaLista(
    a: MacroActionItem,
    calificaciones: readonly string[] = CALIFICACIONES_CONOCIDAS,
): string | null {
    const c = a.config ?? {};
    switch (a.type) {
        case "SEND_TEXT":
            return lleno(c.text) ? null : "Escribe el mensaje.";
        case "SEND_TEXT_VIA":
            if (!lleno(c.instanceName)) return "Elige la línea por la que sale.";
            if (c.viaMode === "template") return lleno(c.templateName) ? null : "Elige la plantilla de Meta.";
            return lleno(c.text) ? null : "Escribe el mensaje.";
        case "SEND_FILE":
            return lleno(c.mediaUrl) ? null : "Sube un archivo o graba una nota de voz.";
        case "SEND_QUICK_REPLY":
            return Number(c.quickReplyId) > 0 ? null : "Elige la respuesta rápida.";
        case "EXECUTE_FLOW":
            return lleno(c.workflowId) ? null : "Elige el flujo.";
        case "ADD_TAG":
        case "REMOVE_TAG":
            return Number(c.tagId) > 0 ? null : "Elige la etiqueta.";
        case "CHANGE_STAGE":
            return typeof c.stage === "string" && calificaciones.includes(c.stage) ? null : "Elige la calificación.";
        case "ASSIGN_ADVISOR":
        case "TRANSFER_ADVISOR":
            return lleno(c.advisorId) ? null : "Elige el asesor.";
        case "CREATE_TASK":
            if (!lleno(c.taskTitle)) return "Escribe el título de la tarea.";
            return lleno(c.advisorId) ? null : "Elige el responsable de la tarea.";
        case "INTERNAL_NOTE":
            return lleno(c.content) ? null : "Escribe la nota.";
        case "WAIT": {
            const s = losSegundosDeLaEspera(c);
            return Number.isFinite(s) && s >= 1 && s <= SEGUNDOS_MAXIMOS_DE_ESPERA
                ? null
                : `Pon cuántos segundos esperar (1 a ${SEGUNDOS_MAXIMOS_DE_ESPERA}).`;
        }
        case "TOGGLE_AI":
        case "RESOLVE":
            return null;
        default:
            return "Esta acción no existe.";
    }
}

/** Las cinco calificaciones de la plataforma (las de las pastillas de Chats). */
export const CALIFICACIONES_CONOCIDAS: readonly LeadStatus[] = ["FRIO", "TIBIO", "CALIENTE", "FINALIZADO", "DESCARTADO"];

/**
 * Qué impide guardar una macro, con el número de la acción que falla. Vacío si
 * se puede guardar.
 */
export function losProblemasDeLaMacro(m: { name: string; actions: MacroActionItem[] }): string[] {
    const problemas: string[] = [];
    if (!m.name.trim()) problemas.push("Ponle un nombre a la macro.");
    if (m.actions.length === 0) problemas.push("Agrega al menos una acción.");
    m.actions.forEach((a, i) => {
        const motivo = porQueNoEstaLista(a);
        if (motivo) problemas.push(`Acción ${i + 1} (${ETIQUETA_DE_ACCION[a.type] ?? a.type}): ${motivo}`);
    });
    return problemas;
}

/* ─── Por qué línea sale lo que envía ─────────────────────────────────── */

/**
 * Cómo se habla con una línea, por su `instanceType`. Es la MISMA partición que
 * la página de Chats usa para armar el juego de acciones de cada línea: una
 * línea de WhatsApp Mensajería (`waha`) no tiene clave de Evolution, y una de
 * Meta o Telegram va por el camino de los canales.
 */
export type ProveedorDeLaLinea = "waha" | "canal" | "evolution";

export function elProveedorDeLaLinea(instanceType: string | null | undefined): ProveedorDeLaLinea {
    const t = (instanceType ?? "").toLowerCase();
    if (t === "waha") return "waha";
    if (t === "meta" || t === "telegram") return "canal";
    return "evolution";
}

/**
 * ¿Se ofrece esta línea en «Enviar por otra línea»? Las que mandan WhatsApp:
 * la línea por QR en sus tres formas (Evolution, Waha y las antiguas sin tipo)
 * y la de Meta. Telegram, Facebook e Instagram no son WhatsApp.
 */
export function seOfreceParaEnviarPorOtraLinea(instanceType: string | null | undefined): boolean {
    const t = (instanceType ?? "").toLowerCase();
    return t === "" || t === "whatsapp" || t === "evolution" || t === "waha" || t === "meta";
}

/* ─── Lo que pasó al correrla ─────────────────────────────────────────── */

export type ResultadoDeAccion = { tipo: MacroActionType; ok: boolean; motivo?: string };

/**
 * El aviso que ve quien corrió la macro. Nunca «aplicada» si algo falló: se
 * nombra cada acción que no salió y por qué, porque un «listo» sobre una macro
 * que no mandó el mensaje es peor que un error — nadie vuelve a mirar.
 */
export function elResumenDeLaEjecucion(resultados: ResultadoDeAccion[]): {
    tono: "ok" | "parcial" | "error";
    mensaje: string;
} {
    const total = resultados.length;
    const fallidas = resultados.filter((r) => !r.ok);
    if (total === 0) return { tono: "error", mensaje: "La macro no tiene acciones." };
    if (fallidas.length === 0) {
        return { tono: "ok", mensaje: `Macro aplicada: ${total} ${total === 1 ? "acción" : "acciones"}.` };
    }
    const detalle = fallidas
        .map((r) => `«${ETIQUETA_DE_ACCION[r.tipo] ?? r.tipo}»${r.motivo ? `: ${r.motivo}` : ""}`)
        .join(" · ");
    if (fallidas.length === total) return { tono: "error", mensaje: `No se aplicó ninguna acción. ${detalle}` };
    return {
        tono: "parcial",
        mensaje: `Se aplicaron ${total - fallidas.length} de ${total} acciones. No se pudo ${detalle}`,
    };
}

/* ─── La lista de la pantalla ─────────────────────────────────────────── */

/**
 * Lo que dice una macro de la lista debajo de su nombre: «5 acciones · 23
 * ejecuciones · Inactiva». El plural de «acción» es «acciones», sin tilde:
 * pegarle «es» al singular daba «acciónes» y «ejecuciónes» en cada fila.
 */
export function elDetalleDeLaFila(m: { acciones: number; ejecuciones: number; activa: boolean }): string {
    const partes = [`${m.acciones} ${m.acciones === 1 ? "acción" : "acciones"}`];
    if (m.ejecuciones > 0) partes.push(`${m.ejecuciones} ${m.ejecuciones === 1 ? "ejecución" : "ejecuciones"}`);
    if (!m.activa) partes.push("Inactiva");
    return partes.join(" · ");
}

export type FiltroDeMacros = "todas" | "activas" | "inactivas";

type MacroDeLaLista = { name: string; enabled: boolean };

/** Lo que enseña la lista con el buscador y la pastilla puestos. */
export function lasMacrosQueSeVen<T extends MacroDeLaLista>(macros: T[], texto: string, filtro: FiltroDeMacros): T[] {
    const q = sinAcentos(texto.trim().toLowerCase());
    return macros.filter((m) => {
        if (filtro === "activas" && !m.enabled) return false;
        if (filtro === "inactivas" && m.enabled) return false;
        return !q || sinAcentos(m.name.toLowerCase()).includes(q);
    });
}

/** Los números de las pastillas: los de la lista entera, no los del filtro puesto. */
export function losConteosDeMacros(macros: MacroDeLaLista[]): Record<FiltroDeMacros, number> {
    const activas = macros.filter((m) => m.enabled).length;
    return { todas: macros.length, activas, inactivas: macros.length - activas };
}

/**
 * ¿Se puede reordenar arrastrando? Solo con la lista ENTERA a la vista: el
 * orden se guarda completo, y con un filtro puesto las escondidas perderían su
 * sitio y saltarían al quitarlo.
 */
export function sePuedeReordenar(texto: string, filtro: FiltroDeMacros): boolean {
    return !texto.trim() && filtro === "todas";
}

/** El texto de la lista vacía: sin macros, sin resultados o sin nada en el filtro. */
export function elMensajeDeLaListaVacia(total: number, texto: string, filtro: FiltroDeMacros): string {
    if (total === 0) return "Aún no tienes macros. Crea la primera con «Nuevo».";
    if (texto.trim()) return `No hay macros que se llamen «${texto.trim()}».`;
    if (filtro === "activas") return "No tienes macros activas.";
    if (filtro === "inactivas") return "No tienes macros inactivas.";
    return "Sin resultados.";
}

/** El menú «Macros» de Chats enseña solo las activas; vacío, dice por qué. */
export function elMensajeDelMenuDelChat(total: number, activas: number): string | null {
    if (activas > 0) return null;
    if (total === 0) return "No tienes macros aún. Créalas en «Gestionar macros».";
    return "Tus macros están desactivadas. Actívalas en «Gestionar macros».";
}

function sinAcentos(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
