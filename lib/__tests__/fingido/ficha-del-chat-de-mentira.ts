/**
 * El servidor de mentira del banco de LA NOTA POR LÍNEA, para el hook de la
 * conversación abierta (`useChatSession`).
 *
 * Contesta `getSessionByRemoteJid` con la MISMA regla que el de verdad para lo
 * que aquí importa —filtra por `instanceId` si se pide, y si no se queda con la
 * ficha más reciente— y apunta cada pregunta, para poder afirmar QUÉ preguntó
 * el hook. Y deja retener una respuesta, para soltarla tarde: es lo que hace
 * falta para probar que una respuesta de la conversación anterior no se pinta
 * encima de la de ahora.
 *
 * Lo que la regla de verdad decide contra Postgres lo prueba el otro fichero
 * del banco; aquí lo que se prueba es el hook.
 */
type Ficha = { id: number; userId: string; instanceId: string; remoteJid: string; updatedAt: number; pushName?: string };
type Opciones = { aliases?: string[]; instanceId?: string } | undefined;

let fichas: Ficha[] = [];
export const preguntas: Array<{ cuentas: string[]; remoteJid: string; opciones: Opciones }> = [];
let retener = false;
const retenidas: Array<() => void> = [];

export function ponerFichas(nuevas: Ficha[]) {
    fichas = nuevas;
    preguntas.length = 0;
}

/** La SIGUIENTE pregunta no contesta hasta que se suelte. */
export function retenerLaSiguiente() {
    retener = true;
}
/** Suelta las respuestas retenidas, en el orden en que se pidieron. */
export function soltar() {
    while (retenidas.length) retenidas.shift()!();
}

export async function getSessionByRemoteJid(userId: string | string[], remoteJid: string, opciones?: Opciones) {
    const cuentas = (Array.isArray(userId) ? userId : [userId]).filter(Boolean);
    preguntas.push({ cuentas, remoteJid, opciones });
    if (retener) {
        retener = false;
        await new Promise<void>((resolve) => retenidas.push(resolve));
    }
    const candidatos = new Set([remoteJid, ...(opciones?.aliases ?? [])]);
    const linea = opciones?.instanceId?.trim();
    const ganadora = fichas
        .filter((f) => cuentas.includes(f.userId) && candidatos.has(f.remoteJid))
        .filter((f) => !linea || f.instanceId === linea)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!ganadora) return { success: false, message: "No se encontró sesión." };
    return { success: true, data: { ...ganadora } };
}

export async function updateLeadPushNameAction() {
    return { success: true };
}
