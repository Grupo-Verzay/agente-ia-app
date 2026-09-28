// La campana de verdad, montada sola dentro de una barra como la de arriba.
import React from "react";
import { createRoot } from "react-dom/client";
import { NotificationCenter } from "@/components/shared/NotificationCenter";
import { FRANJA_DEL_PANEL } from "@/lib/panel-lateral";

const w = window as any;
w.montar = () => {
    const nodo = document.getElementById("app")!;
    createRoot(nodo).render(
        <>
        {/* La franja de un panel lateral de verdad —la del chat del equipo, el
            copiloto, las notas y la ficha—, para medir contra ella. */}
        <div data-sonda-panel-lateral className={FRANJA_DEL_PANEL} />
        <div data-barra-de-arriba style={{ display: "flex", justifyContent: "flex-end", height: 56, alignItems: "center", paddingRight: 12, borderBottom: "1px solid #ddd" }}>
            <NotificationCenter />
        </div>
        </>,
    );
};
w.listo = true;
