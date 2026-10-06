"use client";

/**
 * Cambiar el tipo de activación de un flujo YA creado, con el MISMO selector
 * que «Nuevo flujo». Abre con lo que el flujo es hoy (`laActivacionActual`) y
 * guarda por `cambiarElTipoDelFlujoAction`, que escribe el tipo nuevo y quita
 * los otros dos: el motor lee los tres artefactos en crudo.
 */
import { useState } from "react";
import { Loader2, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelectorDeTipoDeActivacion, type ActivacionEnElSelector } from "@/components/flujos/SelectorDeTipoDeActivacion";
import { cambiarElTipoDelFlujoAction } from "@/actions/workflow-actions";
import { porQueNoSePuedeCambiar, type ActivacionPedida } from "@/lib/tipo-de-activacion";

export function CambiarTipoDelFlujoDialog({
    workflowId,
    workflowName,
    inicial,
    open,
    onOpenChange,
    onGuardado,
}: {
    workflowId: string;
    workflowName: string;
    inicial: Required<ActivacionPedida>;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onGuardado: (guardada: ActivacionPedida) => void;
}) {
    const [activacion, setActivacion] = useState<ActivacionEnElSelector>({
        tipo: inicial.tipo,
        palabras: [...inicial.palabras],
        coincidencia: inicial.coincidencia,
        condicion: inicial.condicion,
    });
    const [guardando, setGuardando] = useState(false);

    const guardar = async () => {
        const pedida = { ...activacion, tipo: activacion.tipo ?? undefined };
        const motivo = porQueNoSePuedeCambiar(pedida);
        if (motivo) return void toast.error(motivo);
        setGuardando(true);
        try {
            const res = await cambiarElTipoDelFlujoAction(workflowId, pedida as ActivacionPedida);
            if (!res.success) return void toast.error(res.message || "No se pudo cambiar el tipo.");
            toast.success(res.message || "Tipo de activación actualizado.");
            onGuardado(pedida as ActivacionPedida);
            onOpenChange(false);
        } catch (error) {
            console.error("[flujos] no se pudo cambiar el tipo desde la tarjeta", error);
            toast.error("No se pudo cambiar el tipo. Revisa la conexión.");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!guardando) onOpenChange(o); }}>
            <DialogContent className="sm:max-w-[480px]" data-cambiar-tipo>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Shuffle className="h-4 w-4 text-blue-600" /> Cambiar tipo de activación
                    </DialogTitle>
                    <DialogDescription className="truncate" title={workflowName}>{workflowName}</DialogDescription>
                </DialogHeader>
                <SelectorDeTipoDeActivacion value={activacion} onChange={setActivacion} palabrasObligatorias />
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>Cancelar</Button>
                    <Button onClick={guardar} disabled={guardando || !activacion.tipo} data-guardar-tipo>
                        {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
