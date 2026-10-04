// Las SEIS tarjetas de precio de la landing, las de VERDAD (`PlanCard` de
// `LandingClient`), una por nivel, con lo que el banco mete en
// `window.__planes`. Es lo que se mide: la separación entre «Ver todo lo que
// incluye» y «Comenzar ahora», y las direcciones de los dos enlaces.
import React from "react";
import { createRoot } from "react-dom/client";
import * as Landing from "@/app/(public)/inicio/_components/LandingClient";

const L = Landing as any;
const w = window as any;

function Pantalla() {
    return (
        <div className="min-h-full bg-[#0a0f1a] p-6 text-white">
            <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3" data-banco="tarjetas">
                {(w.__planes ?? []).map((plan: any) => (
                    <div key={plan.plan} className="flex" data-tarjeta={plan.plan}>
                        <L.PlanCard
                            plan={plan}
                            assistanceType={w.__asistencia ?? "HUMANO"}
                            billingPeriod="monthly"
                            whatsappNumber={null}
                            enOtraPestana={Boolean(w.__enOtraPestana)}
                            onOpenDetail={() => {}}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

createRoot(document.getElementById("app")!).render(<Pantalla />);
w.listo = true;
