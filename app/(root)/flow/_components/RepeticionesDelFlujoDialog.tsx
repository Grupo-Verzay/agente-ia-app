"use client";

import { useEffect, useRef, useState } from "react";
import { Repeat, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CustomDialogHeader from "@/components/shared/CustomDialogHeader";
import { TimeInput } from "@/components/shared/TimeInput";
import {
    comoRepeticiones,
    esperaEnMinutos,
    esperaParaElFormulario,
    TOPE_DE_EJECUCIONES,
    type RepeticionesDeFlujo,
    type UnidadDeEspera,
} from "@/lib/repeticiones-de-flujo";
import {
    guardarRepeticionesDelFlujoAction,
    leerRepeticionesDelFlujoAction,
} from "@/actions/repeticiones-de-flujo-actions";

/**
 * Cuántas veces puede dispararse este flujo en una misma conversación, y
 * cuánto tiene que pasar entre una vez y la siguiente.
 *
 * Nace con lo que diga la base —lo de siempre si no hay nada: 1 vez y sin
 * espera— y solo cambia cuando el dueño pulsa Guardar.
 */
export function RepeticionesDelFlujoDialog({
    workflowId,
    workflowName,
    open,
    onOpenChange,
    onGuardado,
}: {
    workflowId: string;
    workflowName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onGuardado?: (r: RepeticionesDeFlujo) => void;
}) {
    const [cargando, setCargando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [maxTexto, setMaxTexto] = useState("1");
    const [espera, setEspera] = useState<{ valor: string; unidad: UnidadDeEspera }>({ valor: "", unidad: "minutes" });
    // El selector de tiempo lee su valor al montar: se remonta al llegar los datos.
    const [versionDelSelector, setVersionDelSelector] = useState(0);
    const esperaRef = useRef(espera);
    esperaRef.current = espera;

    useEffect(() => {
        if (!open) return;
        let vivo = true;
        setCargando(true);
        leerRepeticionesDelFlujoAction(workflowId)
            .then((res) => {
                if (!vivo) return;
                if (!res.success || !res.data) {
                    toast.error(res.message || "No se pudieron leer las repeticiones.");
                    return;
                }
                setMaxTexto(String(res.data.maxEjecuciones));
                setEspera(esperaParaElFormulario(res.data.esperaMinutos));
                setVersionDelSelector((v) => v + 1);
            })
            .catch(() => vivo && toast.error("No se pudieron leer las repeticiones."))
            .finally(() => vivo && setCargando(false));
        return () => {
            vivo = false;
        };
    }, [open, workflowId]);

    const guardar = async () => {
        const max = Number.parseInt(maxTexto, 10);
        if (!Number.isFinite(max) || max < 1) {
            toast.error("El máximo de ejecuciones tiene que ser 1 o más.");
            return;
        }
        const entrada = comoRepeticiones({
            maxEjecuciones: max,
            esperaMinutos: esperaEnMinutos(esperaRef.current.valor, esperaRef.current.unidad),
        });
        setGuardando(true);
        try {
            const res = await guardarRepeticionesDelFlujoAction(workflowId, entrada);
            if (!res.success || !res.data) {
                toast.error(res.message);
                return;
            }
            toast.success(res.message);
            onGuardado?.(res.data);
            onOpenChange(false);
        } catch {
            // Una acción que revienta no puede dejar el botón en «Guardando…».
            toast.error("No se pudieron guardar las repeticiones del flujo.");
        } finally {
            setGuardando(false);
        }
    };

    const valorDelSelector = `${espera.unidad}-${espera.valor === "" ? 0 : espera.valor}`;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="px-0 sm:max-w-[420px]">
                <CustomDialogHeader icon={Repeat} title="REPETICIONES DEL FLUJO" subTitle={workflowName.toUpperCase()} />
                <div className="space-y-4 px-6 pb-2">
                    {cargando ? (
                        <div className="flex items-center justify-center py-10 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                    ) : (
                        <>
                            <p className="text-xs text-muted-foreground">
                                Por defecto un flujo se dispara una sola vez por conversación. Ábrelo solo en los
                                que lo necesiten, como medios de pago o ubicación.
                            </p>

                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor={`max-${workflowId}`} className="text-sm font-semibold">
                                        Máximo de ejecuciones
                                    </Label>
                                    <span className="text-xs text-muted-foreground">Por conversación</span>
                                </div>
                                <Input
                                    id={`max-${workflowId}`}
                                    type="number"
                                    min={1}
                                    max={TOPE_DE_EJECUCIONES}
                                    inputMode="numeric"
                                    className="text-left text-sm"
                                    value={maxTexto}
                                    disabled={guardando}
                                    onChange={(e) => setMaxTexto(e.target.value)}
                                />
                            </div>

                            <TimeInput
                                key={versionDelSelector}
                                label="Tiempo de espera entre ejecuciones"
                                permitirVacio
                                placeholder="Sin espera"
                                currentValue={valorDelSelector}
                                onChange={(v) => {
                                    const [unidad, valor] = v.split("-");
                                    const n = Number.parseInt(valor ?? "", 10);
                                    setEspera({
                                        unidad: (["minutes", "hours", "days"].includes(unidad) ? unidad : "minutes") as UnidadDeEspera,
                                        valor: Number.isFinite(n) && n > 0 ? String(n) : "",
                                    });
                                }}
                            />
                            <p className="-mt-2 text-[11px] text-muted-foreground">
                                Déjalo vacío para que pueda volver a dispararse sin esperar.
                            </p>
                        </>
                    )}
                </div>
                <DialogFooter className="px-6">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
                        Cancelar
                    </Button>
                    <Button variant="save" onClick={guardar} disabled={guardando || cargando}>
                        {guardando ? "Guardando…" : "Guardar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
