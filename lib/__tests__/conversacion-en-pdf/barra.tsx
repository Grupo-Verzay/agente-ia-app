import React from "react";
import { createRoot } from "react-dom/client";
import { BulkActionBar } from "@/app/(root)/chats/_components/BulkActionBar";

/**
 * La barra en lote REAL, dos veces: la de Chats (con el menú de formatos) y su
 * gemela de Correo (sin él: exporta directo, como siempre).
 */
declare global {
    interface Window { exportados: { donde: string; formato: string | null }[]; listo?: boolean }
}
window.exportados = [];

function App() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24, width: 420 }}>
            <div data-barra="chats">
                <BulkActionBar
                    count={2}
                    totalCount={5}
                    onClear={() => {}}
                    onSelectAll={() => {}}
                    onExport={(formato) => window.exportados.push({ donde: "chats", formato: formato ?? null })}
                    exportaEnFormatos
                />
            </div>
            <div data-barra="correo">
                <BulkActionBar
                    count={2}
                    totalCount={5}
                    onClear={() => {}}
                    onSelectAll={() => {}}
                    onExport={(formato) => window.exportados.push({ donde: "correo", formato: formato ?? null })}
                    sustantivo={{ uno: "correo", varios: "correos" }}
                />
            </div>
        </div>
    );
}

createRoot(document.getElementById("app")!).render(<App />);
window.listo = true;
