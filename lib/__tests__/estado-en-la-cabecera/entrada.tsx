import React from "react";
import { createRoot } from "react-dom/client";
import { ChatHeader } from "@/app/(root)/chats/_components/ChatHeader";
import { ChatContactItem } from "@/app/(root)/chats/_components/ChatContactItem";

/** El mismo nombre en la cabecera y en la fila de la lista: con emojis de color,
 * uno con tono de piel, uno con selector de variación y uno compuesto (ZWJ). */
const NOMBRE = "Ramírez 🌷🌼🙏🏻❤️👨‍👩‍👧";

/**
 * La maqueta del banco: la cabecera de la conversación REAL (`ChatHeader`),
 * dentro de `.app-module-content` —que es donde vive en producción, y donde un
 * `.text-sm` vale 16/24 y un `.text-xs` 14/20—, una vez por cada cosa que
 * puede decir la línea de debajo del nombre. Lo único fingido son las acciones
 * de servidor.
 */
const CASOS: Array<{ id: string; presencia?: any; conexion?: any; anuncio?: boolean }> = [
    { id: "escribiendo", presencia: "escribiendo" },
    { id: "grabando", presencia: "grabando" },
    { id: "en_linea", conexion: { estado: "en_linea", lastSeen: null } },
    { id: "ultima_vez", conexion: { estado: "desconectado", lastSeen: Math.floor(Date.now() / 1000) - 3600 } },
    { id: "anuncio", anuncio: true },
    { id: "nada" },
];

const nada = () => {};
const nadaAsync = async () => {};

function sesion(anuncio: boolean): any {
    return {
        id: 7,
        userId: "u1",
        remoteJid: "573001112233@s.whatsapp.net",
        pushName: "Yenny",
        instanceId: "i1",
        status: true,
        tags: [],
        adSource: anuncio ? { title: "Campaña de septiembre" } : null,
    };
}

function Caso({ caso }: { caso: (typeof CASOS)[number] }) {
    return (
        <div data-caso={caso.id} className="flex w-full flex-col" style={{ marginBottom: 24 }}>
            <ChatHeader
                header={{ avatarSrc: "", isPinned: false } as any}
                presencia={caso.presencia ?? null}
                conexion={caso.conexion ?? null}
                session={sesion(Boolean(caso.anuncio))}
                userId="u1"
                allTags={[]}
                displayedContactName={NOMBRE}
                displayedWhatsapp="573001112233"
                instanceName="BANCO_VENTAS"
                remoteJid="573001112233@s.whatsapp.net"
                onBackToList={nada}
                onOpenContactEditor={nada}
                onSessionMutate={nada}
                onSessionRefresh={nadaAsync}
                onToggleInfoPanel={nada}
                onToggleSearch={nada}
                chatView="messages"
                onChatViewChange={nada}
            />
        </div>
    );
}

/** La fila de la lista con el MISMO nombre: es la referencia de cómo se pinta. */
function FilaDeLaLista() {
    return (
        <div data-fila-de-la-lista style={{ width: 380 }}>
            <ChatContactItem
                contact={{ id: "573001112233@s.whatsapp.net", name: NOMBRE, avatarSrc: "", lastMessage: "hola", lastMessageId: "m1", timestamp: "10:00", ts: Date.now(), instanceName: "BANCO_VENTAS" } as any}
                onArchive={nada}
                onDeleteRequest={nada}
                onSelect={nada}
                onTogglePin={nada}
                selected={false}
            />
        </div>
    );
}

function Maqueta() {
    return (
        <div className="app-module-content h-screen overflow-y-auto">
            <FilaDeLaLista />
            {CASOS.map((c) => (
                <Caso key={c.id} caso={c} />
            ))}
        </div>
    );
}

createRoot(document.getElementById("app")!).render(<Maqueta />);
(window as any).listo = true;
