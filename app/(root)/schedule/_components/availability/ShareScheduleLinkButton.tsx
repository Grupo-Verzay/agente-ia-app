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
        <div className="flex items-center gap-2">
            <Button
                variant="outline"
                onClick={() => window.open(scheduleUrl, "_blank")}
            >
                <LinkIcon className="w-4 h-4 mr-2" />
                Ver página de citas
            </Button>
            <Button variant="secondary" onClick={handleCopy}>
                <Copy className="w-4 h-4 mr-2" />
                {copied ? "Copiado" : "Copiar enlace"}
            </Button>
        </div>
    );
};
