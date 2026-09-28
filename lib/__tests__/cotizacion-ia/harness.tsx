import React from "react";
import { createRoot } from "react-dom/client";
import { CotizacionesBuilder } from "@/app/(root)/ai/_components/CotizacionesBuilder";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { TYPE_AI_LABELS } from "@/app/(root)/ai/_components/ai-section-labels";

declare const CLASE_DE_LA_CABECERA_VECINA: string;

(window as any).etiquetas = Object.values(TYPE_AI_LABELS);
let guardar: null | (() => Promise<void>) = null;
(window as any).guardarConElBoton = () => guardar?.();

createRoot(document.getElementById("pestana")!).render(
    <div className="app-module-content" style={{ padding: 8 }}>
        {/* La cabecera de la pestaña vecina, con la clase LEÍDA de su archivo. */}
        <Card className="border-muted/60" data-vecina="">
            <CardHeader className={CLASE_DE_LA_CABECERA_VECINA}>
                <CardTitle className="text-base uppercase">Palabras clave</CardTitle>
            </CardHeader>
        </Card>
        <CotizacionesBuilder
            cuentaId="cuenta-banco"
            inicial={{ activa: false, instrucciones: "" }}
            registerSaveHandler={(fn) => (guardar = fn)}
        />
    </div>,
);
(window as any).listo = true;
