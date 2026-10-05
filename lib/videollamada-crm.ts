/**
 * El CRM de Verzay que Verzy enseña durante la videollamada. La «pizarra» no es
 * una pantalla aparte: es la cuenta REAL «Verzay Ventas» dentro de Agente IA,
 * con la ficha del prospecto buscado por su número de WhatsApp.
 *
 * Puro: lo usan la vista firmada, la sala y el banco.
 */

/** El nombre de la cuenta a la que entra Verzy, si no viene `VERZY_CUENTA_ID`. */
export const NOMBRE_DE_LA_CUENTA_DE_VERZY = "Verzay Ventas";

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Compara nombres de cuenta sin mayúsculas, tildes, barras ni espacios de más. */
export function laLlaveDelNombreDeCuenta(nombre: string | null | undefined): string {
    return sinTildes(String(nombre ?? "")).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** ¿Esta cuenta es la de Verzy? «Verzay | Ventas», «Verzay Ventas», «verzay-ventas». */
export function esLaCuentaDeVerzy(nombre: string | null | undefined): boolean {
    return laLlaveDelNombreDeCuenta(nombre) === laLlaveDelNombreDeCuenta(NOMBRE_DE_LA_CUENTA_DE_VERZY);
}

/** Las secciones del CRM que Verzy puede enseñar, en el orden en que se ven. */
export const SECCIONES_DEL_CRM = [
    { clave: "crm", ancla: null, titulo: "Ficha del prospecto" },
    { clave: "crm_embudo", ancla: "embudo", titulo: "Embudo de ventas" },
    { clave: "crm_recordatorios", ancla: "recordatorios", titulo: "Recordatorios y citas" },
    { clave: "crm_conversacion", ancla: "conversacion", titulo: "Historial de la conversación" },
] as const;

export const RUTA_DEL_CRM = "/videollamada/vista/crm";

/** ¿Esta ruta es la del CRM? Ahí la sala pone las notas al lado. */
export function esLaVistaDelCrm(ruta: string | null | undefined): boolean {
    return typeof ruta === "string" && ruta.split("#")[0].split("?")[0] === RUTA_DEL_CRM;
}

export type MensajeDelCrm = { deQuien: "cliente" | "negocio"; texto: string; cuando: number };

/** Los últimos mensajes, en orden de lectura y sin vacíos ni repetidos. */
export function laConversacionDelCrm(
    filas: readonly { messageId?: string | null; fromMe: boolean; content: string | null; messageTimestamp: number | bigint | null }[],
    tope = 12,
): MensajeDelCrm[] {
    const vistos = new Set<string>();
    const lista: MensajeDelCrm[] = [];
    for (const f of filas) {
        const texto = String(f.content ?? "").trim();
        if (!texto) continue;
        const llave = f.messageId ? `${f.messageId}:${f.fromMe}` : `${f.fromMe}:${texto}:${f.messageTimestamp}`;
        if (vistos.has(llave)) continue;
        vistos.add(llave);
        const ts = Number(f.messageTimestamp ?? 0);
        lista.push({ deQuien: f.fromMe ? "negocio" : "cliente", texto: texto.slice(0, 400), cuando: ts > 1e12 ? Math.floor(ts / 1000) : ts });
    }
    return lista.sort((a, b) => a.cuando - b.cuando).slice(-tope);
}

/* ── El orden del inicio de la llamada ─────────────────────────────────── */

/** Lo PRIMERO que dice Verzy, sin esperar: y lo mismo si el cliente habla antes. */
export const SALUDO_INICIAL = "Hola, muy buenas, ¿me escuchas?";

/** La segunda pregunta, cuando el cliente confirma que escucha. */
export const SEGUNDA_PREGUNTA = "¿Qué te gustaría resolver hoy en esta reunión?";
