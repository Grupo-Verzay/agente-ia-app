import "server-only";

import { db } from "@/lib/db";
import { laCuentaDeLaAccion } from "@/lib/cuenta-de-la-accion";

/**
 * De quién es el dato que una acción va a tocar, cuando lo que llega del
 * navegador NO es una cuenta sino el id de una cosa: una conversación, un
 * flujo, un paso de un flujo o el entrenamiento de un agente.
 *
 * # El agujero que esto cierra
 *
 * `lib/cuenta-de-la-accion.ts` cerró las acciones que reciben un `userId`.
 * Quedaban las que reciben el id de la COSA y no preguntaban de quién era:
 *
 * ```ts
 * export async function getInternalNotesBySessionAction(sessionId: number) {
 *   await assertAuthorized();                       // «hay sesión», y ya
 *   return db.internalNote.findMany({ where: { sessionId } });
 * }
 * ```
 *
 * Con la sesión de cualquier cuenta y otro número se leían las notas internas
 * de una conversación ajena, se tomaba su chat, se reescribía el entrenamiento
 * de su agente o se vaciaba su flujo. No hace falta ni estar en la pantalla:
 * **una acción de servidor ES un endpoint.**
 *
 * # La regla, en una línea
 *
 * > **El dueño sale de la FILA, no del navegador**, y se pregunta con la
 * > puerta de siempre (`laCuentaDeLaAccion` → `assertCanAccessTargetUser`).
 *
 * Así las cuatro funciones de aquí dicen EXACTAMENTE lo mismo que las 129
 * acciones que ya pasan por esa puerta: uno mismo, el asesor sobre su dueño,
 * lo que cuelga hacia abajo por `linked_accounts`, y el rol de la cuenta. No
 * hay una quinta regla que mantener a la par.
 *
 * # Y devuelven `null`, no lanzan
 *
 * «No existe» y «no es tuyo» se contestan igual a propósito: decir «no
 * puedes» ya cuenta que existe. Quien llama convierte el `null` en su propio
 * «No autorizado» —o su «no encontrado»— en la forma que ya devolvía.
 */

/** La conversación (`Session`) y la cuenta comprobada, o `null`. */
export async function laCuentaDeLaConversacion(sessionId: unknown) {
    const id = Number(sessionId);
    if (!Number.isInteger(id) || id <= 0) return null;
    const sesion = await db.session.findUnique({
        where: { id },
        select: { id: true, userId: true, remoteJid: true },
    });
    if (!sesion?.userId) return null;
    const cuenta = await laCuentaDeLaAccion(sesion.userId);
    return cuenta ? { cuenta, sesion } : null;
}

/** El flujo (`Workflow`) y la cuenta comprobada, o `null`. */
export async function laCuentaDelFlujo(workflowId: unknown) {
    const id = String(workflowId ?? "").trim();
    if (!id) return null;
    const flujo = await db.workflow.findUnique({
        where: { id },
        select: { id: true, userId: true },
    });
    if (!flujo?.userId) return null;
    const cuenta = await laCuentaDeLaAccion(flujo.userId);
    return cuenta ? { cuenta, flujo } : null;
}

/**
 * Un paso de un flujo (`WorkflowNode`): su dueño es el del flujo que lo
 * contiene. Devuelve también el `workflowId`, que es con lo que quien llama
 * comprueba que el paso sea del flujo que dice ser.
 */
export async function laCuentaDelNodo(nodeId: unknown) {
    const id = String(nodeId ?? "").trim();
    if (!id) return null;
    const nodo = await db.workflowNode.findUnique({
        where: { id },
        select: { id: true, workflowId: true, workflow: { select: { userId: true } } },
    });
    const dueno = nodo?.workflow?.userId;
    if (!nodo || !dueno) return null;
    const cuenta = await laCuentaDeLaAccion(dueno);
    return cuenta ? { cuenta, nodo: { id: nodo.id, workflowId: nodo.workflowId } } : null;
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El entrenamiento de un agente (`AgentPrompt`) y la cuenta comprobada, o `null`. */
export async function laCuentaDelEntrenamiento(promptId: unknown) {
    const id = String(promptId ?? "").trim();
    // La columna es `uuid`: con otra cosa Postgres no contesta «no está», revienta.
    if (!ES_UUID.test(id)) return null;
    const prompt = await db.agentPrompt.findUnique({
        where: { id },
        select: { id: true, userId: true },
    });
    if (!prompt?.userId) return null;
    const cuenta = await laCuentaDeLaAccion(prompt.userId);
    return cuenta ? { cuenta, prompt } : null;
}

/**
 * ¿Es esta persona alguien a quien quien llama puede darle trabajo?
 *
 * Asignar o transferir una conversación pone un id de persona en
 * `assigned_advisor_id`, y ese id llega del navegador. Sin esto se le podía
 * colgar una conversación a cualquier usuario de la plataforma. Se pregunta
 * por la CUENTA de esa persona (`ownerId ?? id`) con la misma puerta: el
 * equipo propio, el de las cuentas que cuelgan de la propia, y nada más.
 */
export async function esGenteQueAlcanzo(personaId: unknown): Promise<boolean> {
    const id = String(personaId ?? "").trim();
    if (!id) return false;
    const persona = await db.user.findUnique({
        where: { id },
        select: { id: true, ownerId: true },
    });
    if (!persona) return false;
    return Boolean(await laCuentaDeLaAccion(persona.ownerId ?? persona.id));
}
