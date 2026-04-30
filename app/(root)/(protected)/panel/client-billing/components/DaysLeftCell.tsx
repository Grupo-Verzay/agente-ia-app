// DaysLeftCell.tsx
"use client";

import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMemo } from "react";

type DaysLeftCellProps = {
    /** Número de días restantes (ej: 5). Puede ser null/undefined si no hay dato. */
    dueDate: number | null | undefined;
    className?: string;
};

export function DaysLeftCell({ dueDate, className }: DaysLeftCellProps) {
    const value = typeof dueDate === "number" && Number.isFinite(dueDate) ? dueDate : null;

    const meta = useMemo(() => {
        if (value === null) {
            return {
                label: "—",
                status: "Sin fecha",
                tooltip: "No hay información de días restantes para este cliente.",
                cellClass:
                    "bg-muted/40 text-muted-foreground border border-border/40",
            };
        }

        // Estados:
        // - vencido: negativo (rojo)
        // - vence hoy: 0 (naranja)
        // - próximo a vencer: 1-3 (ámbar)
        // - buenos días: >=4 (verde suave)
        if (value < 0) {
            return {
                label: `${value} d`,
                status: "Vencido",
                tooltip: "Este servicio ya está vencido. Requiere acción inmediata.",
                cellClass: "bg-destructive/15 text-destructive border border-destructive/30",
            };
        }

        if (value === 0) {
            return {
                label: "0 d",
                status: "Vence hoy",
                tooltip: "El servicio vence hoy. Prioriza el cobro/renovación.",
                cellClass:
                    "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30",
            };
        }

        if (value <= 3) {
            return {
                label: `${value} d`,
                status: "Próximo",
                tooltip: "Faltan pocos días. Recomendado enviar recordatorio.",
                cellClass:
                    "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30",
            };
        }

        return {
            label: `${value} d`,
            status: "Vigente",
            tooltip: "Aún hay margen suficiente antes del vencimiento.",
            cellClass:
                "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
        };
    }, [value]);

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div
                        className={cn(
                            "inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium",
                            meta.cellClass,
                            className
                        )}
                    >
                        <span>{meta.label}</span>
                        <span className="text-[11px] opacity-80">• {meta.status}</span>
                    </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] text-xs">
                    {meta.tooltip}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}