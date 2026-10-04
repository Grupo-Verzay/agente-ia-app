// La landing principal ENTERA, la de VERDAD (`LandingClient`), con sus
// acciones de servidor mudas (`scripts/empaquetar-con-acciones-mudas.mjs`).
// Es lo que mide el banco de la guía dentro del plan: que ninguna sección
// pinte una franja, una raya o una sombra que la separe de la de al lado.
import React from "react";
import { createRoot } from "react-dom/client";
import * as Landing from "@/app/(public)/inicio/_components/LandingClient";

const L = Landing as any;
const w = window as any;

createRoot(document.getElementById("app")!).render(
    <div className="min-h-full bg-[#0a0f1a]">
        <L.LandingClient guiasDeAyuda={[]} />
    </div>,
);
w.listo = true;
