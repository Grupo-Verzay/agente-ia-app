"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { generateAgentFlow } from "@/actions/generate-agent-flow";

interface FlowGeneratorModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    promptId: string;
    version: number;
}

export function FlowGeneratorModal({ open, onOpenChange, promptId, version }: FlowGeneratorModalProps) {
    const [description, setDescription] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!description.trim()) return;
        setLoading(true);
        setError(null);
        try {
            const result = await generateAgentFlow({ description, promptId, version });
            if (result.success) {
                onOpenChange(false);
                setDescription("");
                window.location.reload();
            } else {
                setError(result.error);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleOpenChange = (nextOpen: boolean) => {
        if (loading) return;
        if (!nextOpen) setError(null);
        onOpenChange(nextOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        Generar flujo con IA
                    </DialogTitle>
                    <DialogDescription>
                        Describe tu negocio y la IA configurará automáticamente todos los apartados del agente.
                        Usa tu propia API Key de OpenAI (gpt-4o-mini).
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3">
                    <textarea
                        className="w-full min-h-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                        placeholder={`Ejemplo:\nSoy una pizzería en Medellín llamada "La Forza". Atendemos de lunes a sábado de 11am a 10pm y domingos de 12pm a 8pm. Manejamos domicilios y recogidas. Nuestros productos principales son pizzas personales ($18.000), medianas ($35.000) y familiares ($55.000). Los clientes pueden hacer pedidos, consultar el menú y pedir el domicilio.`}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={loading}
                    />
                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button onClick={handleGenerate} disabled={loading || !description.trim()}>
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Generando...
                            </>
                        ) : (
                            <>
                                <Sparkles className="mr-2 h-4 w-4" />
                                Generar
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
