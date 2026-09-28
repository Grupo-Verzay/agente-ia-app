/**
 * Arnés de la barra de arriba: la `Breadcrumbs` de VERDAD (o la de ANTES, por
 * alias), dentro de una maqueta con la misma forma que el layout —el carril del
 * menú plegado a la izquierda, la barra, y debajo la caja del contenido— y, en
 * Chats y Correos, la columna de la lista con su marca y su ancho de verdad
 * (`--ancho-lateral`).
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { Breadcrumbs } from "@/components/custom/Breadcrumbs";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useModuleStore } from "@/stores/modules/useModuleStore";
import { useChatUnreadStore } from "@/stores/useChatUnreadStore";
import { useCorreosSinLeerStore } from "@/stores/useCorreosSinLeerStore";

const w = window as any;

w.maquetaBarra = (ruta: string, rutas: string[]) => {
    // Los sin leer de cada bandeja (el de ANTES no los lee: no pasa nada).
    // `pedidoEn` reciente: el store no le pregunta a la acción muda.
    const sinLeer = w.__sinLeer ?? { chats: null, correo: null };
    useChatUnreadStore.setState({ sinLeer: sinLeer.chats });
    useCorreosSinLeerStore.setState({ sinLeer: sinLeer.correo, pedidoEn: Date.now() });
    useModuleStore.setState({
        modules: [{ id: "m1", label: "Bandeja", route: "/bandeja", moduleItems: rutas.map((r, i) => ({ id: `i${i}`, url: r })) }] as any,
    });
    w.navegar(ruta);
    const conColumna = ruta.startsWith("/chats") || ruta.startsWith("/correo");
    const nodo = document.getElementById("app")!;
    const raiz = (w.__raiz ??= createRoot(nodo));
    const movil = window.innerWidth < 768;
    raiz.render(
        <SidebarProvider defaultOpen={false}>
            <div style={{ display: "flex", width: "100%", height: "100vh" }}>
                {!movil && <div data-carril style={{ width: 48, flexShrink: 0, borderRight: "1px solid #ddd" }} />}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                    <Breadcrumbs />
                    <div data-contenido-de-la-app className="flex-1 min-h-0 flex flex-col p-0 sm:p-1">
                        <div data-caja-del-contenido className="flex-1 min-h-0 flex sm:rounded-md sm:border sm:border-border/70">
                            {conColumna ? (
                                <>
                                    <aside data-columna-de-chats style={{ width: "var(--ancho-lateral)", flexShrink: 0 }} className="h-full border-r border-border" />
                                    <div style={{ flex: 1 }} />
                                </>
                            ) : (
                                <div style={{ flex: 1 }} />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </SidebarProvider>,
    );
};
w.listo = true;
