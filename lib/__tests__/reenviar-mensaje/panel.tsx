import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ReenviarMensaje } from "@/components/chats/ReenviarMensaje";
import type { DestinoDelReenvio } from "@/lib/reenviar-mensaje";

/** El panel REAL, con ocho conversaciones de dos líneas. Solo existe en el «ahora». */
declare global {
    interface Window { enviados: DestinoDelReenvio[][]; listo?: boolean; abrir?: () => void }
}
window.enviados = [];

const DESTINOS: DestinoDelReenvio[] = [
    { linea: "VENTAS", remoteJid: "573001110001@s.whatsapp.net", nombre: "María López", numero: "+57 300 1110001" },
    { linea: "VENTAS", remoteJid: "573001110002@s.whatsapp.net", nombre: "Pedro Gómez", numero: "+57 300 1110002" },
    { linea: "ATENCION", remoteJid: "573001110003@s.whatsapp.net", nombre: "Ana Ruiz", numero: "+57 300 1110003" },
    { linea: "ATENCION", remoteJid: "573001110004@s.whatsapp.net", nombre: "Carlos Díaz", numero: "+57 300 1110004" },
    { linea: "VENTAS", remoteJid: "573001110005@s.whatsapp.net", nombre: "Lucía Mora", numero: "+57 300 1110005" },
    { linea: "VENTAS", remoteJid: "573001110006@s.whatsapp.net", nombre: "Jorge Vega", numero: "+57 300 1110006" },
    { linea: "ATENCION", remoteJid: "573001110007@s.whatsapp.net", nombre: "Sofía Pérez", numero: "+57 300 1110007" },
    { linea: "ATENCION", remoteJid: "573001119999@s.whatsapp.net", nombre: "Tienda El Sol", numero: "+57 300 1119999" },
];

function App() {
    const [abierto, setAbierto] = useState(false);
    window.abrir = () => setAbierto(true);
    return (
        <ReenviarMensaje
            abierto={abierto}
            onCerrar={() => setAbierto(false)}
            reenvio={{ kind: "text", text: "Hola, te paso la cotización" }}
            destinos={DESTINOS}
            onReenviar={async (elegidos) => {
                window.enviados.push(elegidos);
                setAbierto(false);
            }}
        />
    );
}

createRoot(document.getElementById("app")!).render(<App />);
window.listo = true;
