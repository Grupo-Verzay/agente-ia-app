/**
 * El despachador de WhatsApp de mentira, para el banco de la CALIDAD SEMANAL.
 *
 * El reporte semanal sale por la línea de la cuenta; aquí no hay Evolution ni
 * Waha, así que se sustituye con un alias de esbuild y se APUNTA lo que se
 * habría mandado. Lo que se prueba es el TEXTO del reporte, no el proveedor.
 */
export const enviados: { remoteJid: string; text: string; cuentaId?: string }[] = [];

export async function resolveWhatsAppDispatcherLine(args?: { ownerUserId?: string | null }) {
    if (!args?.ownerUserId) return null;
    return {
        id: args.ownerUserId,
        notificationNumber: null,
        instanceId: `iid-${args.ownerUserId}`,
        instanceName: `LINEA_${args.ownerUserId}`,
        instanceType: "Whatsapp",
        serverUrl: "http://localhost",
        apiKey: "banco",
        provider: "evolution" as const,
    };
}

export async function sendViaWhatsAppDispatcher(args: { remoteJid: string; text: string; registro?: { cuentaId?: string } }) {
    enviados.push({ remoteJid: args.remoteJid, text: args.text, cuentaId: args.registro?.cuentaId });
    return { success: true };
}
