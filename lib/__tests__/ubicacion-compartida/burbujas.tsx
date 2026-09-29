import React from "react";
import { createRoot } from "react-dom/client";
import { MessageBubble } from "@/app/(root)/chats/_components/MessageBubble";
import { toUIMessages } from "@/app/(root)/chats/_components/chat-message-utils";

/**
 * Las burbujas REALES tal como las arma la conversación: los mensajes guardados
 * pasan por `toUIMessages` y cada burbuja se pinta con las mismas props que le
 * da `ChatMessageList`. Es la MISMA maqueta en los dos modos: en el roto se
 * empaqueta con los componentes de antes, y el banco afirma lo que salía.
 *
 * No importa nada de `lib/ubicacion-de-whatsapp`: ese módulo no existía antes,
 * y los mensajes van escritos con la forma que guarda Evolution, que es la que
 * ya había en la base.
 */
declare global {
    interface Window { listo?: boolean; burbujas?: { id: string; content: string; ubicacion: boolean }[] }
}

const jid = "573001112233@s.whatsapp.net";
const mensajes = [
    {
        key: { id: "ubicacion", fromMe: false, remoteJid: jid },
        messageType: "locationMessage",
        messageTimestamp: 1_700_000_000,
        message: {
            conversation: "[Ubicación]",
            locationMessage: {
                degreesLatitude: 10.9878,
                degreesLongitude: -74.7889,
                name: "Tienda El Sol",
                address: "Cra 53 #75-20, Barranquilla",
                url: "https://evil.example.com/phish",
            },
        },
    },
    {
        key: { id: "envivo", fromMe: true, remoteJid: jid },
        messageType: "liveLocationMessage",
        messageTimestamp: 1_700_000_100,
        message: { liveLocationMessage: { degreesLatitude: 4.6097, degreesLongitude: -74.0817 } },
    },
    {
        key: { id: "documento", fromMe: false, remoteJid: jid },
        messageType: "documentMessage",
        messageTimestamp: 1_700_000_200,
        message: {
            documentMessage: {
                url: "https://ejemplo.invalid/cotizacion.docx",
                mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                fileName: "cotizacion.docx",
            },
        },
    },
];

const burbujas = toUIMessages(mensajes as never, undefined, new Map()) as Array<Record<string, any>>;
window.burbujas = burbujas.map((b) => ({ id: String(b.id), content: String(b.content ?? ""), ubicacion: Boolean(b.ubicacion) }));

createRoot(document.getElementById("app")!).render(
    <div className="app-module-content" style={{ padding: 24 }}>
        {burbujas.map((b) => (
            <div key={b.id} data-burbuja={b.id} style={{ marginBottom: 16 }}>
                <MessageBubble
                    message={b.content}
                    isUserMessage={b.sender === "user"}
                    timestamp={b.ts}
                    media={b.media}
                    messageId={b.id}
                    {...({ ubicacion: b.ubicacion } as Record<string, unknown>)}
                />
            </div>
        ))}
    </div>,
);
window.listo = true;
