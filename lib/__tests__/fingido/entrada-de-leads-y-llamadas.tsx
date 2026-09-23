/**
 * Las DOS tablas, lado a lado, para el banco que las compara: Leads con sus
 * columnas de verdad (`columns` + `DataTable`) y CRM › Llamadas con su
 * `CallsCrmClient` de verdad, consolidando para que haya una fila de otra
 * cuenta de la familia.
 *
 * Lo único fingido son las acciones de servidor —las de Leads las enmudece
 * `empaquetar-con-acciones-mudas.mjs`, las de Llamadas vienen de
 * `fingido/llamadas-del-crm.ts`— y la navegación. `DESDE_LEADS` y
 * `DESDE_LLAMADAS` los pone el script para poder pintar el «antes».
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DataTable } from "@/app/(root)/sessions/_components/data-table";
import { Card } from "@/components/ui/card";
// @ts-expect-error — lo sustituye el script por la ruta del «antes» o del «ahora».
import { columns } from "DESDE_LEADS";
// @ts-expect-error — igual.
import { CallsCrmClient } from "DESDE_LLAMADAS";

const t = (id: number, name: string) => ({ id, name, slug: name.toLowerCase(), color: null, order: id });

/** Tres leads con nombre, número y cuántas etiquetas DISTINTOS entre sí, para
 *  que cada columna ordene en un orden que no coincida con el de las otras. */
const LEADS = [
    { id: 1, remoteJid: "573105550002@s.whatsapp.net", pushName: "Bruno", tags: [t(1, "A"), t(2, "B"), t(3, "C")] },
    { id: 2, remoteJid: "573105550003@s.whatsapp.net", pushName: "Ana", tags: [] },
    { id: 3, remoteJid: "573105550001@s.whatsapp.net", pushName: "Carla", tags: [t(4, "D")] },
].map((s) => ({
    ...s,
    remoteJidAlt: null,
    userId: "u1",
    instanceId: "VERZAY_ATENCION",
    status: true,
    agentDisabled: false,
    createdAt: new Date("2026-09-20T15:00:00Z").toISOString(),
    flujos: "",
    pendingSeguimientos: 0,
    leadStatus: "TIBIO",
}));

(window as any).pintarLeads = () => {
    const raiz = ((window as any).__raizLeads ??= createRoot(document.getElementById("leads")!));
    raiz.render(
        <SidebarProvider>
            {/* El MISMO envoltorio que `sessions-content.tsx`: la Card es la que
                le da el color al texto que las celdas heredan. */}
            <Card className="flex-1 min-h-0 flex flex-col border-border overflow-hidden">
                <div className="flex-1 min-h-0 overflow-auto">
                <DataTable
                    columns={columns({
                        onDeleteSuccess: () => {},
                        mutateSessions: () => {},
                        allTags: [],
                        onNavigateToChat: () => {},
                    })}
                    data={LEADS as any}
                />
                </div>
            </Card>
        </SidebarProvider>,
    );
};

(window as any).pintarLlamadas = () => {
    const raiz = ((window as any).__raizLlamadas ??= createRoot(document.getElementById("llamadas")!));
    raiz.render(
        <CallsCrmClient
            {...({
                embedded: true,
                cuentas: ["u1", "u2"],
                cuentaPropia: "u1",
                unificado: true,
                nombresDeCuenta: { u1: "Verzay | Atención", u2: "Verzay | Ventas" },
            } as any)}
        />,
    );
};
(window as any).listo = true;
