import React from "react";
import { createRoot } from "react-dom/client";
import { ChatContactItem } from "@/app/(root)/chats/_components/ChatContactItem";
import { ChatHeader } from "@/app/(root)/chats/_components/ChatHeader";

/**
 * La maqueta del banco: la fila de la bandeja (`ChatContactItem`) y la cabecera
 * de la conversación (`ChatHeader`), las DOS reales, dentro de
 * `.app-module-content` —que es donde viven en producción, y donde un `.text-xs`
 * vale 14/20 y no 12/16—. Lo único fingido son las acciones de servidor.
 *
 * Las filas son cuatro y cada una contesta una pregunta:
 *   - `sin_etapa`: una cuenta que no usa embudos. No pinta pastilla.
 *   - `corta`:     el caso normal, «Nuevo».
 *   - `larga`:     el nombre más largo que admite una etapa (40 caracteres).
 *   - `anchas`:    40 letras anchas, que es lo que el recorte por caracteres NO
 *                  acota y el tope de ancho sí.
 *
 * La de estado sale en todas: es la referencia contra la que se mide la de
 * etapa, y «Sin clasificar» es además el ancho que el encargo puso de listón.
 */

const nada = () => {};
const nadaAsync = async () => {};

const ETAPA_LARGA = "Esperando respuesta del cliente final";
const ETAPA_ANCHA = "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW";

const FILAS: Array<{ id: string; etapa: any; lead: any }> = [
    // La referencia de ANCHO: «Sin clasificar», que es el listón del encargo.
    { id: "sin_etapa", etapa: null, lead: null },
    // Las demás llevan estado puesto, que es la forma NORMAL de la pastilla de
    // al lado —con su fondo y su `font-medium`— y por tanto contra la que se
    // compara. «Sin clasificar» es el caso vacío y va en punteado.
    { id: "corta", etapa: { id: "e1", nombre: "Nuevo", color: 1 }, lead: "TIBIO" },
    { id: "larga", etapa: { id: "e2", nombre: ETAPA_LARGA, color: 2 }, lead: "TIBIO" },
    { id: "anchas", etapa: { id: "e3", nombre: ETAPA_ANCHA, color: 3 }, lead: "TIBIO" },
];

const ASESORES = [
    { id: "a1", name: "Sofía Pérez", email: "sofia@x.com" },
    { id: "a2", name: "Yair Silvera", email: "yair@x.com" },
] as any;

function sesionDeLaFila(etapa: any, lead: any = null) {
    return {
        id: 7,
        userId: "u1",
        remoteJid: "573001112233@s.whatsapp.net",
        pushName: "Yenny",
        instanceId: "i1",
        status: true,
        tags: [],
        leadStatus: lead,
        assignedAdvisorId: null,
        etapa,
    };
}

function Fila({ id, etapa, lead }: { id: string; etapa: any; lead: any }) {
    return (
        <div data-fila={id} style={{ width: 380, marginBottom: 8 }}>
            <ChatContactItem
                contact={
                    {
                        id: "573001112233@s.whatsapp.net",
                        name: "Yenny Ramírez",
                        avatarSrc: "",
                        lastMessage: "hola",
                        lastMessageId: "m1",
                        timestamp: "10:00",
                        ts: Date.now(),
                        instanceName: "BANCO_VENTAS",
                        chatSession: sesionDeLaFila(etapa, lead),
                    } as any
                }
                advisors={ASESORES}
                currentAdvisorId="a1"
                advisorRole="administrador"
                onArchive={nada}
                onDeleteRequest={nada}
                onSelect={nada}
                onTogglePin={nada}
                selected={false}
            />
        </div>
    );
}

/** La cabecera, con etapa y sin ella: el icono y su globo. */
function Cabecera({ id, etapa }: { id: string; etapa: any }) {
    return (
        <div data-cabecera={id} className="flex w-full flex-col" style={{ marginBottom: 24 }}>
            <ChatHeader
                header={{ avatarSrc: "", isPinned: false } as any}
                presencia={null}
                conexion={null}
                session={sesionDeLaFila(etapa) as any}
                userId="u1"
                allTags={[]}
                advisors={ASESORES}
                currentAdvisorId="a1"
                displayedContactName="Yenny Ramírez"
                displayedWhatsapp="573001112233"
                instanceName="BANCO_VENTAS"
                remoteJid="573001112233@s.whatsapp.net"
                etapaDelEmbudo={etapa}
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

function Maqueta() {
    return (
        <div className="app-module-content h-screen overflow-y-auto">
            {FILAS.map((f) => (
                <Fila key={f.id} id={f.id} etapa={f.etapa} lead={f.lead} />
            ))}
            <Cabecera id="con_etapa" etapa={{ id: "e2", nombre: ETAPA_LARGA, color: 2 }} />
            <Cabecera id="sin_etapa" etapa={null} />
        </div>
    );
}

createRoot(document.getElementById("app")!).render(<Maqueta />);
(window as any).listo = true;
