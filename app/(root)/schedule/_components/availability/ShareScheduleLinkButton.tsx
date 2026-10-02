"use client";

import { Button } from "@/components/ui/button";
import { Copy, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { elEnlaceDeReserva } from "@/lib/pantalla-de-agenda";

interface Props {
    userId: string;
}

export const ShareScheduleLinkButton = ({ userId }: Props) => {
    // El dominio de la página abierta, no uno escrito a mano: desde el
    // dominio de un reseller el enlace tiene que ser el suyo. Se lee al montar
    // (en el servidor no hay `window`, y las dos salidas no coincidirían).
    const [origen, setOrigen] = useState("");
    useEffect(() => { setOrigen(window.location.origin); }, []);
    const scheduleUrl = elEnlaceDeReserva(origen, userId);
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        // Sin HTTPS el portapapeles lanza: se dice qué hacer en vez de fallar callado.
        try {
            await navigator.clipboard.writeText(scheduleUrl);
            setCopied(true);
            toast.success("Enlace copiado al portapapeles.");
            setTimeout(() => setCopied(false), 1500);
        } catch (error) {
            console.warn("[agenda] no se pudo copiar el enlace de reserva", error);
            toast.error(`No se pudo copiar. Cópialo a mano: ${scheduleUrl}`);
        }
    };

    return (
        <div className="flex items-center gap-2 w-full sm:w-auto" data-enlace-de-reserva={scheduleUrl}>
            <Button
                className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => window.open(scheduleUrl, "_blank")}
            >
                <LinkIcon className="w-4 h-4 mr-2 shrink-0" />
                Ver página citas
            </Button>
            <Button
                className={`flex-1 sm:flex-none ${copied
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-emerald-500 hover:bg-emerald-600 text-white"}`}
                onClick={handleCopy}
            >
                <Copy className="w-4 h-4 mr-2 shrink-0" />
                {copied ? "¡Copiado!" : "Copiar enlace"}
            </Button>
        </div>
    );
};
