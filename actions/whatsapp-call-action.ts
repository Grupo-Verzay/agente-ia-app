"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export async function makeWhatsAppCall(sessionId: number): Promise<{
    success: boolean;
    message?: string;
}> {
    const user = await currentUser();
    if (!user?.id) return { success: false, message: "No autenticado" };

    const session = await db.session.findUnique({
        where: { id: sessionId },
        select: { remoteJid: true, userId: true },
    });

    if (!session) return { success: false, message: "Sesión no encontrada" };
    if (session.userId !== user.id) return { success: false, message: "Sin permiso" };

    const userData = await db.user.findUnique({
        where: { id: user.id },
        select: {
            apiKey: { select: { url: true, key: true } },
            instancias: {
                select: { instanceName: true },
                take: 1,
            },
        },
    });

    if (!userData?.apiKey?.url || !userData.instancias[0]) {
        return { success: false, message: "API de WhatsApp no configurada" };
    }

    const rawUrl = userData.apiKey.url;
    const serverUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    const instanceName = userData.instancias[0].instanceName;
    const apikey = userData.apiKey.key ?? "";

    // Extract phone number — strip @s.whatsapp.net or @g.us suffix
    const phoneNumber = session.remoteJid.replace(/@.*/, "");

    try {
        const res = await fetch(`${serverUrl}/call/offer/${instanceName}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey,
            },
            body: JSON.stringify({ number: phoneNumber, isVideo: false, callDuration: 15 }),
        });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            return { success: false, message: `Error ${res.status}: ${body || res.statusText}` };
        }

        return { success: true };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, message: msg };
    }
}
