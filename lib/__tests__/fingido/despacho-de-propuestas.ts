/**
 * El despachador de WhatsApp de mentira, para el banco de PROPUESTAS.
 *
 * Aquí no hay Evolution ni Waha: se sustituye con un alias de esbuild y se
 * APUNTA lo que se habría mandado. Lo que se prueba es a QUÉ número y desde
 * QUÉ línea sale el enlace, no el proveedor. `conectadas` dice qué líneas
 * contestarían como conectadas; con la pedida desconectada, el despachador de
 * verdad cae a otra conectada de la cuenta, y eso mismo hace este.
 */
export const enviados: { remoteJid: string; text: string; linea: string; cuenta: string }[] = [];
let conectadas: Record<string, string[]> = {};

export function ponerLineasConectadas(mapa: Record<string, string[]>) {
    conectadas = mapa;
}

export async function resolveWhatsAppDispatcherLine(args?: {
    ownerUserId?: string | null;
    preferredInstanceName?: string | null;
}) {
    const cuenta = args?.ownerUserId ?? "";
    const vivas = conectadas[cuenta] ?? [];
    const nombre = vivas.includes(args?.preferredInstanceName ?? "") ? args!.preferredInstanceName! : vivas[0];
    if (!nombre) return null;
    return {
        id: cuenta,
        notificationNumber: null,
        instanceId: `iid-${nombre}`,
        instanceName: nombre,
        instanceType: "Whatsapp",
        serverUrl: "http://localhost",
        apiKey: "banco",
        provider: "evolution" as const,
    };
}

export async function sendViaWhatsAppDispatcher(args: {
    dispatcher: { instanceName: string; id: string };
    remoteJid: string;
    text: string;
}) {
    enviados.push({ remoteJid: args.remoteJid, text: args.text, linea: args.dispatcher.instanceName, cuenta: args.dispatcher.id });
    return { success: true, message: "ok" };
}
