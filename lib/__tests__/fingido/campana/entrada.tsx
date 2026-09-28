// La campana de verdad, montada sola dentro de una barra como la de arriba.
import React from "react";
import { createRoot } from "react-dom/client";
import { NotificationCenter } from "@/components/shared/NotificationCenter";

const w = window as any;
w.montar = () => {
    const nodo = document.getElementById("app")!;
    createRoot(nodo).render(
        <div data-barra-de-arriba style={{ display: "flex", justifyContent: "flex-end", height: 56, alignItems: "center", paddingRight: 12, borderBottom: "1px solid #ddd" }}>
            <NotificationCenter />
        </div>,
    );
};
w.listo = true;
