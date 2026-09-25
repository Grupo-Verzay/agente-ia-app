import React from "react";
import { createRoot } from "react-dom/client";
import { ChatHeader } from "@/app/(root)/chats/_components/ChatHeader";

/**
 * La maqueta: la cabecera de la conversación REAL, que es quien pinta los dos
 * desplegables que se comparan —el de Etiquetas (`SessionTagsCombobox` con
 * `panel="cabecera"`) y el de Etapas (`SelectorDeEtapaDelEmbudo`)—.
 *
 * Se monta la cabecera entera y no los dos componentes sueltos a propósito: es
 * ella la que le pasa el `panel` al primero y la que lleva la marca
 * `data-cabecera-de-chat` contra la que los dos se colocan. Montados sueltos se
 * estaría midiendo una composición que producción no tiene, que es justo cómo el
 * banco del #935 se quedó verde con un fallo puesto.
 *
 * Y va dentro de `.app-module-content`, que es donde vive en producción y donde
 * un `.text-xs` vale 14/20 y no 12/16.
 *
 * Los nombres son de una palabra, de varias, y uno más largo que el panel: en
 * mayúscula el mismo nombre ocupa más, así que el último es el que ejerce el
 * recorte y el globo.
 */

const nada = () => {};
const nadaAsync = async () => {};

/**
 * Con un grupo personal dentro, para que cmdk pinte sus RÓTULOS: sin ellos el
 * sangrado del rótulo —la otra mitad de la sangría de más— no se ejerce.
 */
const CUENTA = "u1";

/*
 * El `userId` no es de relleno: la cabecera filtra las etiquetas por la cuenta
 * de la LÍNEA de la conversación (`etiquetasDeLaConversacion`), así que sin él el
 * panel sale vacío y no hay ninguna fila que medir. Lo cazó el propio arnés.
 */
const ETIQUETAS = [
    { id: 1, userId: CUENTA, name: "Cliente", slug: "cliente", color: "#2563eb", sessionCount: 4, grupo: "mias" as const },
    {
        id: 2,
        userId: CUENTA,
        name: "Pago pendiente",
        slug: "pago",
        color: "#f59e0b",
        sessionCount: 12,
        grupo: "de-la-cuenta" as const,
    },
    {
        id: 3,
        userId: CUENTA,
        name: "Esperando documentos del cliente",
        slug: "docs",
        color: "#16a34a",
        sessionCount: 2,
        grupo: "de-la-cuenta" as const,
    },
];

/**
 * La segunda está puesta: ni la primera ni la última, para que su marca no se
 * pueda confundir con un borde del panel. La cabecera saca las puestas de
 * `session.tags`, así que van también ahí.
 */
const SELECCIONADAS = [2];

const ETAPA_ABIERTA = { id: "s2", nombre: "Contactado", color: 2 };

const ASESORES = [
    { id: "a1", name: "Sofía Pérez", email: "sofia@x.com" },
    { id: "a2", name: "Yair Silvera", email: "yair@x.com" },
] as any;

const SESION = {
    id: 7,
    userId: CUENTA,
    remoteJid: "573001112233@s.whatsapp.net",
    pushName: "Yenny",
    instanceId: "i1",
    status: true,
    tags: ETIQUETAS.filter((t) => SELECCIONADAS.includes(t.id)),
    leadStatus: "TIBIO",
    assignedAdvisorId: null,
    etapa: ETAPA_ABIERTA,
};

function Maqueta() {
    return (
        <div className="app-module-content h-screen overflow-hidden">
            <div className="flex w-full flex-col">
                <ChatHeader
                    header={{ avatarSrc: "", isPinned: false } as any}
                    presencia={null}
                    conexion={null}
                    session={SESION as any}
                    userId={CUENTA}
                    allTags={ETIQUETAS as any}
                    advisors={ASESORES}
                    currentAdvisorId="a1"
                    displayedContactName="Yenny Ramírez"
                    displayedWhatsapp="573001112233"
                    instanceName="BANCO_VENTAS"
                    remoteJid="573001112233@s.whatsapp.net"
                    etapaDelEmbudo={ETAPA_ABIERTA}
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
        </div>
    );
}

createRoot(document.getElementById("app")!).render(<Maqueta />);
(window as any).listo = true;
