"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { PromptPreviewInterface } from "@/types/agentAi";

export const PromptPreview = ({ prompt }: PromptPreviewInterface) => {
    const text = prompt ?? "";

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success("Texto copiado al portapapeles");
        } catch {
            try {
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
                toast.success("Texto copiado al portapapeles");
            } catch {
                toast.error("No se pudo copiar el texto");
            }
        }
    };

    return (
        <Card className="border-none h-full">
            <CardContent className="p-0 h-full">
                <div className="relative h-full">
                    {/* Botón copiar */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopy}
                        aria-label="Copiar texto"
                        className="absolute right-6 top-3 opacity-70 hover:opacity-100 transition-opacity z-10"
                    >
                        <Copy className="h-4 w-4" />
                    </Button>

                    {/* Vista de texto preservando formato */}
                    <pre
                        className="
              h-full w-full
              m-0 p-4 pr-12
              text-sm
              overflow-auto
              whitespace-pre-wrap
              break-words
              font-mono
              tab-8
            "
                    >
                        {text}
                    </pre>
                </div>
            </CardContent>
        </Card>
    );
};
