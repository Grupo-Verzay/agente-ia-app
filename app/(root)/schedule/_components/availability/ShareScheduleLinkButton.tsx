"use client";

import { Button } from "@/components/ui/button";
import { Copy, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface Props {
    userId: string;
}

export const ShareScheduleLinkButton = ({ userId }: Props) => {
    const baseUrl = "https://agente.ia-app.com/schedule";
    const scheduleUrl = `${baseUrl}/${userId}`;
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(scheduleUrl);
        setCopied(true);
        toast.success("Enlace copiado al portapapeles.");
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="flex items-center gap-2 w-full sm:w-auto">
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
