import { db } from "@/lib/db";

/**
 * Nodos de automatización de un flujo, y cómo ejecutarlos al lanzarlo a mano.
 *
 * Un flujo lanzado desde el chat ("Atajos → Workflows") lo resuelve la app, que
 * sabe mandar mensajes pero no aplicar un tag ni asignar un asesor. Esos nodos
 * se saltaban en silencio: el mensaje salía y la etiqueta no cambiaba, así que
 * el flujo parecía funcionar a medias.
 *
 * La lógica de cada acción no se repite aquí: vive en el motor, que es el mismo
 * que corre cuando el flujo lo dispara el agente. Esto solo se la pide.
 */

/** Del tipo de nodo del editor al tipo de acción del motor. */
const ACCION_POR_NODO: Record<string, string> = {
    "tag-add": "TAG_ADD",
    "tag-remove": "TAG_REMOVE",
    "assign-advisor": "ASSIGN",
    "create-task": "TASK",
    "notify-advisor": "NOTIFY_ADVISOR",
    "change-status": "CHANGE_STATUS",
    "toggle-ai": "TOGGLE_AI",
    webhook: "WEBHOOK",
    "ai-call": "AI_CALL",
};

export function esNodoDeAutomatizacion(tipo?: string | null): boolean {
    return Boolean(tipo && ACCION_POR_NODO[tipo.trim().toLowerCase()]);
}

/**
 * Ejecuta el nodo de automatización. Devuelve si se pudo.
 *
 * Un fallo no corta el flujo: los mensajes que vienen detrás siguen saliendo,
 * igual que cuando lo dispara el agente.
 */
export async function ejecutarNodoDeAutomatizacion(params: {
    tipo: string;
    /** La configuración del nodo, que se guarda como JSON en su mensaje. */
    message?: string | null;
    userId: string;
    remoteJid: string;
    instanceName: string;
}): Promise<boolean> {
    const type = ACCION_POR_NODO[params.tipo.trim().toLowerCase()];
    if (!type) return false;

    const backendUrl = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");
    const secret = process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? "";
    if (!backendUrl) return false;

    const sessionId = await idDeLaConversacion(params);
    if (!sessionId) return false;

    let config: unknown = {};
    try {
        config = params.message ? JSON.parse(params.message) : {};
    } catch {
        config = {};
    }

    try {
        const res = await fetch(`${backendUrl}/stage-actions/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-secret": secret },
            body: JSON.stringify({ sessionId, type, config }),
            cache: "no-store",
        });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * La conversación sobre la que actúa el nodo.
 *
 * Se busca también por `remoteJidAlt` porque un contacto que entró por `@lid`
 * tiene su sesión guardada con el número en el otro campo.
 */
async function idDeLaConversacion(params: {
    userId: string;
    remoteJid: string;
    instanceName: string;
}): Promise<number | null> {
    try {
        const sesion = await db.session.findFirst({
            where: {
                userId: params.userId,
                OR: [{ remoteJid: params.remoteJid }, { remoteJidAlt: params.remoteJid }],
            },
            orderBy: { updatedAt: "desc" },
            select: { id: true },
        });
        return sesion?.id ?? null;
    } catch {
        return null;
    }
}
