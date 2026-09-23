/**
 * Arnés del banco de la fila de pastillas de Chats (`pastillas-de-la-fila.test.mjs`).
 *
 * Monta la columna de Chats con su MISMA estructura —el envoltorio con
 * `--ancho-lateral` y su `border-r`, el `<aside>`, la lista `overflow-y-auto
 * p-1` y las filas `flex-col gap-1`— al lado de la conversación y, si se pide,
 * de la ficha de contacto. Las filas son `ChatContactItem` de verdad y la clase
 * de la lista es la de verdad (`LISTA_DE_CHATS`): lo único que se finge son las
 * acciones de servidor de la fila (`acciones-mudas.ts`).
 */
import React from "react";
import { createRoot } from "react-dom/client";
// @ts-ignore — las dos rutas las reescribe el script según el modo: en el
// bueno, el componente y la clase de la lista de hoy; en el roto, los de
// `ANTES_REF`, sacados de git.
import { ChatContactItem } from "__FILA__";
// @ts-ignore
import { LISTA_DE_CHATS } from "__LISTA__";

const nada = () => {};
const ASESORES = [
    { id: "a1", name: "Yair Silvera", email: "yair@x.co" },
    { id: "a2", name: "Sofía Ruiz", email: "sofia@x.co" },
];

function contacto(i: number, dosCifras: boolean) {
    const flujos = Array.from({ length: dosCifras ? 11 : 2 }, (_, k) => ({ id: `f${k}`, name: `Flujo ${k}` }));
    return {
        id: `57300111${String(2200 + i)}@s.whatsapp.net`,
        chatSession: {
            id: i + 1,
            userId: "cuenta",
            remoteJid: `57300111${String(2200 + i)}@s.whatsapp.net`,
            pushName: "Marta Restrepo",
            leadStatus: "DESCARTADO",
            assignedAdvisorId: null,
            reminderCount: dosCifras ? 12 : 3,
            pendingSeguimientos: dosCifras ? 14 : 2,
            seguimientosTipos: ["text"],
            flujos: JSON.stringify(flujos),
            tags: [
                { id: "t1", name: "VIP", color: "#7c3aed" },
                { id: "t2", name: "Recompra", color: "#16a34a" },
            ],
            status: true,
        },
        isArchived: false,
        isDeleted: false,
        isPurged: false,
        isGroup: false,
        isPinned: false,
        isUnreadLocal: false,
        lastMessage: "Perfecto, quedo pendiente entonces",
        lastMessageId: "ABC" + i,
        name: "Marta Restrepo",
        avatarSrc: "",
        pinnedAtMs: 0,
        timestamp: "10:24",
        ts: 1_700_000_000,
        instanceName: "VERZAY_VENTAS",
    };
}

(window as any).pintar = (conFicha: boolean, dosCifras = false) => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("app")!));
    const filas = Array.from({ length: 30 }, (_, i) =>
        React.createElement(ChatContactItem as any, {
            key: i,
            contact: contacto(i, dosCifras),
            selected: i === 1,
            onArchive: nada,
            onDeleteRequest: nada,
            onSelect: nada,
            onTogglePin: nada,
            advisors: ASESORES,
            advisorRole: "administrador",
            currentAdvisorId: "a1",
            onAssignAdvisor: nada,
        }),
    );
    raiz.render(
        React.createElement(
            "div",
            { "data-chat-view": "", className: "flex h-full w-full overflow-hidden" },
            React.createElement(
                "div",
                { className: "w-full sm:w-[var(--ancho-lateral)] h-full flex-shrink-0 sm:border-r border-border" },
                React.createElement(
                    "aside",
                    { "data-columna-de-chats": "", className: "flex h-full w-full max-w-[700px] flex-col sm:border-r border-border" },
                    React.createElement("div", { className: "h-[5.125rem] shrink-0 border-b-2" }),
                    React.createElement(
                        "div",
                        { role: "list", className: LISTA_DE_CHATS },
                        React.createElement("div", { className: "flex flex-col gap-1" }, filas),
                    ),
                ),
            ),
            React.createElement("div", { "data-conversacion": "", className: "min-w-0 flex-1 md:min-w-[15rem]" }),
            conFicha
                ? React.createElement("aside", {
                      "data-ficha-de-contacto": "",
                      className: "w-full md:w-[var(--ancho-lateral)] shrink-0 border-l h-full",
                  })
                : null,
        ),
    );
};

(window as any).listo = true;
