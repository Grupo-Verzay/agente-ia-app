// La tarjeta CORTA de un plan en la landing y el video de la landing, los de
// VERDAD (`PlanCard`, `VideoDeLaLanding` de `LandingClient`), con lo que el
// banco mete en `window.__plan` y `window.__video`. `onOpenDetail` se queda
// para el «antes» (que abría la ventana intermedia); hoy no lo lee nadie.
import React from "react";
import { createRoot } from "react-dom/client";
import * as Landing from "@/app/(public)/inicio/_components/LandingClient";

const L = Landing as any;
const w = window as any;

function Pantalla() {
    return (
        <div className="min-h-full bg-[#0a0f1a] p-6 text-white">
            <div className="mx-auto grid max-w-sm" data-banco="tarjeta">
                <L.PlanCard plan={w.__plan} assistanceType="IA" billingPeriod="monthly" whatsappNumber={null} enOtraPestana={Boolean(w.__enOtraPestana)} onOpenDetail={() => {}} />
            </div>
            {/* El video solo existe como pieza suelta desde este cambio: antes
                iba metido dentro de `LandingClient`. Lo que no se exporta no
                se pinta, y el banco lo dice. */}
            {w.__video && L.VideoDeLaLanding ? (
                <div className="mx-auto mt-6 max-w-2xl" data-banco="video">
                    <L.VideoDeLaLanding valor={w.__video} />
                </div>
            ) : null}
        </div>
    );
}

createRoot(document.getElementById("app")!).render(<Pantalla />);
w.listo = true;
