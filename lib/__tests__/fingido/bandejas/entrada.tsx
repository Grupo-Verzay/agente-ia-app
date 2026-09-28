import React from "react";
import { createRoot } from "react-dom/client";
import { CorreoClient } from "@/app/(root)/correo/_components/CorreoClient";
import { PanelSinChat } from "@/app/(root)/chats/_components/PanelSinChat";
import { PanelDeChatsDeAntes } from "@/lib/__tests__/.antes/bandejas/PanelDeChatsDeAntes";
import { Breadcrumbs } from "@/components/custom/Breadcrumbs";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useModuleStore } from "@/stores/modules/useModuleStore";

const w = window as any;
w.pulsadas = [] as string[];

/** Chats: el panel de HOY y el de ANTES (sacado de git), lado a lado. */
w.maquetaChats = () => {
    const nodo = document.getElementById("app")!;
    createRoot(nodo).render(
        <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
            <div data-caja="chats-hoy" style={{ display: "flex", height: "50vh" }}>
                <PanelSinChat alIrA={(t, s) => w.pulsadas.push(`${t}${s ? "+sinLeer" : ""}`)} />
            </div>
            <div data-caja="chats-antes" style={{ display: "flex", height: "50vh" }}>
                <PanelDeChatsDeAntes goToChatTab={() => {}} />
            </div>
        </div>,
    );
};

/** Correo, con su componente de verdad y sin ningún correo abierto. */
w.maquetaCorreo = () => {
    const nodo = document.getElementById("app")!;
    createRoot(nodo).render(
        <div style={{ height: "calc(100vh - 16px)", padding: 8 }}>
            <CorreoClient conectado={null} error={null} />
        </div>,
    );
};

/** La barra de arriba de verdad, con la ruta y el menú que diga el banco. */
w.maquetaBarra = (ruta: string, rutas: string[]) => {
    useModuleStore.setState({
        modules: [{ id: "m1", label: "Bandeja", route: "/bandeja", moduleItems: rutas.map((r, i) => ({ id: `i${i}`, url: r })) }] as any,
    });
    w.navegar(ruta);
    const nodo = document.getElementById("app")!;
    const raiz = (w.__raizBarra ??= createRoot(nodo));
    raiz.render(
        <SidebarProvider defaultOpen={false}>
            <div style={{ width: "100%" }}>
                <Breadcrumbs />
            </div>
        </SidebarProvider>,
    );
};
w.listo = true;
