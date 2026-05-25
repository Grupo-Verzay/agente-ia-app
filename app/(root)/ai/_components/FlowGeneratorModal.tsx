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
            <DialogContent className="sm:max-w-xl h-[585px] flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        Generar flujo con IA
                    </DialogTitle>
                    <DialogDescription>
                        Pega aquí toda la información de tu negocio: descripción, catálogo de productos o servicios, precios, horarios, políticas y protocolos de atención. La IA generará el flujo completo y guardará el detalle como base de conocimiento del agente.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3 flex-1 overflow-hidden">
                    <textarea
                        className="w-full flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                        placeholder={`Pega aquí toda la información de tu negocio.\n\nEjemplo:\nSoy Cursos Javeriano, academia de capacitación en Barquisimeto registrada en el MPPE. Ofrecemos cursos de mecánica, estética, electricidad, computación e idiomas. Inscripción $3, clase $8-10, certificado $7 (legalizable). Pagos por Pago Móvil BNC 0191, cédula 20017685, tel. 0424-543-02-56.\n\nCursos disponibles:\n- Barbería: $3 inscripción | 8 clases | $8/clase...\n- Mecánica Diesel: $3 inscripción | 10 clases | $10/clase...\n...`}
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
