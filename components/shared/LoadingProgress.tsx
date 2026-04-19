"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingProgressProps {
    label?: string;
    description?: string;
    /** 0–100. Si no envías value, funciona como loader infinito */
    value?: number;
    /** Si true, se muestra como overlay centrado de pantalla */
    fullscreen?: boolean;
}

export const LoadingProgress: React.FC<LoadingProgressProps> = ({
    label = "Cargando...",
    description = "Estamos preparando todo para ti.",
    value,
    fullscreen = false,
}) => {
    const clampedValue =
        typeof value === "number"
            ? Math.min(100, Math.max(0, value))
            : undefined;

    return (
        <div
            className={cn(
                "relative z-40",
                fullscreen &&
                "fixed inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm"
            )}
        >
            <div
                className={cn(
                    "relative w-full max-w-md rounded-2xl border border-primary/20",
                    "bg-gradient-to-br from-primary/10 via-background to-background",
                    "shadow-xl px-6 py-5 flex flex-col items-center gap-4 overflow-hidden"
                )}
            >
                {/* Glow de fondo */}
                <div className="pointer-events-none absolute inset-0 opacity-60">
                    <div className="absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-primary/30 blur-3xl" />
                </div>

                {/* Loader circular principal */}
                <div className="relative flex h-20 w-20 items-center justify-center">
                    {/* Anillo externo suave */}
                    <div className="absolute inset-0 rounded-full border border-primary/30 backdrop-blur-sm" />

                    {/* Anillo glow */}
                    <div className="absolute inset-1 rounded-full border border-primary/40 blur-sm" />

                    {/* Spinner recortado */}
                    <div className="absolute inset-0 rounded-full border-2 border-primary/70 border-t-transparent border-b-transparent animate-spin [animation-duration:1.4s]" />

                    {/* Puntos orbitando */}
                    <div className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary shadow-md shadow-primary/70" />
                    <div className="absolute -left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary/70 shadow-md shadow-primary/40" />

                    {/* Centro con icono */}
                    <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-background shadow-md shadow-primary/40">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                </div>

                {/* Texto */}
                <div className="mt-2 flex flex-col items-center gap-1 text-center">
                    <p className="font-semibold text-foreground">{label}</p>
                    <p className="max-w-xs text-sm text-muted-foreground">
                        {description}
                    </p>
                </div>

                {/* Barra de progreso */}
                <div className="mt-4 w-full space-y-2">
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/10">
                        <div
                            className={cn(
                                "h-full rounded-full bg-gradient-to-r from-primary via-primary/80 to-primary/40",
                                clampedValue === undefined &&
                                "animate-[shimmer_1.4s_ease-in-out_infinite]"
                            )}
                            style={
                                clampedValue === undefined
                                    ? { width: "45%" } // loader infinito
                                    : { width: `${clampedValue}%` }
                            }
                        />
                    </div>

                    {clampedValue !== undefined && (
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>Progreso</span>
                            <span className="font-medium text-primary">
                                {Math.round(clampedValue)}%
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
