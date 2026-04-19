"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PedidoFunctionEl } from "@/types/agentAi";
import { useEffect, useState } from "react";
import { CopyIcon, ExternalLink, SaveIcon, Loader2 } from "lucide-react"; // 👈 NUEVO: Loader2
import { getUserAppointmentUrl } from "@/actions/userClientDataActions";
import { toast } from "sonner";

/* ----------------- Editor de campos para "Pedidos" ----------------- */
export const PedidoFieldsEditor = ({
    stepId,
    elId,
    element,
    onAdd,
    onRemove,
}: {
    stepId: string;
    elId: string;
    element: PedidoFunctionEl;
    onAdd: (field: string) => void;
    onRemove: (field: string) => void;
}) => {
    const subtype = element.subtype.toLowerCase();
    const isAppointment = subtype === "citas";
    const [input, setInput] = useState("");
    const [appointmentUrl, setAppointmentUrl] = useState<string>("");
    const [loadingUrl, setLoadingUrl] = useState(false);

    const add = () => {
        if (!input.trim()) return;
        onAdd(` * ${input}`);
        setInput("");
    };

    useEffect(() => {
        if (!isAppointment) return;

        let cancelled = false;

        const fetchUrl = async () => {
            try {
                setLoadingUrl(true);
                const url = await getUserAppointmentUrl();
                if (!cancelled) {
                    setAppointmentUrl(url || "");
                }
            } catch (error) {
                console.error("[PedidoFieldsEditor] Error obteniendo URL de cita:", error);
                if (!cancelled) {
                    setAppointmentUrl("");
                }
            } finally {
                if (!cancelled) {
                    setLoadingUrl(false);
                }
            }
        };

        fetchUrl();

        return () => {
            cancelled = true;
        };
    }, [isAppointment, stepId, elId]);

    const handleCopyUrl = () => {
        if (!appointmentUrl) return;
        navigator.clipboard.writeText(appointmentUrl).catch((err) => {
            console.error("No se pudo copiar la URL:", err);
        });

        toast.success("Copiado");
    };

    return (
        <div className="space-y-2 pb-3">
            {!isAppointment &&
                <>
                    <label className="text-xs font-medium">Campos/datos:</label>
                    <div className="flex gap-2">
                        <Input
                            placeholder="Ej.: cc, name, direccion…"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    add();
                                }
                            }}
                        />
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={add}
                            aria-label="Guardar"
                            className="
            gap-0 sm:gap-2 px-2 sm:px-3 h-9
            bg-emerald-600 text-white
            hover:bg-emerald-700
            focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2
            disabled:bg-emerald-600/60 disabled:text-white/80
          "
                        >
                            <SaveIcon />
                        </Button>
                    </div>

                    {
                        element.fields && element.fields.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {element.fields.map((f) => (
                                    <Badge key={f} variant="outline" className="gap-1">
                                        {f}
                                        <button
                                            type="button"
                                            aria-label={`Eliminar ${f}`}
                                            className="ml-1 opacity-70 hover:opacity-100"
                                            onClick={() => onRemove(f)}
                                        >
                                            ×
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">Aún no hay campos agregados.</p>
                        )
                    }
                </>
            }

            {/* Solo para subtype "citas": mostramos la URL del appointment en un input readonly */}
            {isAppointment && (
                <div className="mt-3 space-y-2 rounded-md border-border bg-muted/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <p className="flex items-center gap-2 text-xs font-semibold">
                                Enlace de la cita
                                <Badge variant="outline" className="text-[10px] px-1 py-0">
                                    Auto
                                </Badge>
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Esta URL se genera automáticamente según la configuración del flujo de
                                agendamiento.
                            </p>
                        </div>

                        {loadingUrl && (
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>Generando enlace…</span>
                            </div>
                        )}
                    </div>

                    {loadingUrl ? (
                        // Skeleton de la caja de URL mientras carga
                        <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
                    ) : (
                        <div className="flex items-center gap-2">
                            <Input
                                readOnly
                                value={appointmentUrl}
                                placeholder="Sin URL disponible"
                                className="text-xs"
                            />
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                disabled={!appointmentUrl}
                                onClick={handleCopyUrl}
                                aria-label="Copiar URL"
                            >
                                <CopyIcon className="h-4 w-4" />
                            </Button>
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                disabled={!appointmentUrl}
                                asChild
                                aria-label="Abrir URL en una nueva pestaña"
                            >
                                <a href={appointmentUrl || "#"} target="_blank" rel="noreferrer">
                                    <ExternalLink className="h-4 w-4" />
                                </a>
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};