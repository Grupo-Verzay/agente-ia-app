// app/(root)/ai/_components/PromptToolbar.tsx
"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { usePromptActions } from "./hooks/usePromptActions";

export function PromptToolbar(props: {
    promptId: string;
    version: number;
    userId: string;
    onVersionChange: (v: number) => void;
    onConflict?: (serverState: any) => void;
    revalidatePath?: string;
    revisions?: Array<{ revisionNumber: number; label?: string }>;
    onManualSave?: () => Promise<void>;
    manualOnly?: boolean;
    successMessage?: string;
    /**
     * Si queda algo sin guardar. Sin esto el boton se comporta como siempre
     * (verde y diciendo "Guardar"), asi que quien no lo pase no nota el cambio.
     */
    hasChanges?: boolean;
    /** Se llama despues de guardar bien, para poder marcar que ya no hay nada pendiente. */
    onSaved?: () => void;
}) {
    const {
        promptId,
        version,
        userId,
        onVersionChange,
        onConflict,
        revalidatePath,
        onManualSave,
        manualOnly = false,
        successMessage = "Guardado correctamente",
        hasChanges,
        onSaved,
    } = props;

    const router = useRouter();
    const { loading, error, publish } = usePromptActions({
        promptId,
        version,
        publishedBy: userId,
        onVersionChange,
        onConflict,
        revalidatePath,
    });

    const [isPending, startTransition] = useTransition();
    const [isManualSaving, setIsManualSaving] = useState(false);

    const isSaving = manualOnly ? isManualSaving : !!loading || isPending;
    // Sin hasChanges no se puede saber si falta algo, asi que se asume que si:
    // es el comportamiento de siempre y nunca dice "Guardado" a la ligera.
    const todoGuardado = hasChanges === false && !isSaving;

    const handleSave = useCallback(async (saveNote?: string) => {
        try {
            if (onManualSave) {
                setIsManualSaving(true);
                await onManualSave();
                setIsManualSaving(false);
            }
            if (manualOnly) {
                onSaved?.();
                toast.success(successMessage);
                return;
            }
            await publish(saveNote?.trim() || undefined);
            onSaved?.();
            startTransition(() => { router.refresh(); });
            toast.success(successMessage);
        } catch (e: any) {
            toast.error(e?.message ?? "No se pudo guardar");
        } finally {
            setIsManualSaving(false);
        }
    }, [manualOnly, onManualSave, onSaved, publish, router, startTransition, successMessage]);

    useEffect(() => {
        if (error) toast.error(error);
    }, [error]);

    return (
        <>
            <div aria-live="polite" aria-atomic="true" className="sr-only">
                {isSaving ? "Guardando..." : todoGuardado ? "Todo guardado" : "Hay cambios sin guardar"}
            </div>

            <TooltipProvider>
                <div className="flex items-center">
                    {/* Botón principal Guardar */}
                    <Tooltip delayDuration={200}>
                        <TooltipTrigger asChild>
                            <Button
                                onClick={() => handleSave()}
                                disabled={isSaving}
                                aria-busy={isSaving}
                                aria-label={todoGuardado ? "Todo guardado" : "Guardar"}
                                className={[
                                    "gap-0 sm:gap-2 px-2 sm:px-3 h-9",
                                    // En gris cuando no queda nada pendiente. Sigue pulsable:
                                    // apagarlo obligaria a adivinar si esta gris porque ya
                                    // guardo o porque se rompio algo.
                                    todoGuardado
                                        ? "bg-muted text-muted-foreground hover:bg-muted/80 border border-border"
                                        : "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:bg-emerald-600/60 disabled:text-white/80",
                                ].join(" ")}
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span className="hidden sm:inline">Guardando...</span>
                                    </>
                                ) : todoGuardado ? (
                                    <>
                                        <Check className="h-4 w-4" />
                                        <span className="hidden sm:inline">Guardado</span>
                                    </>
                                ) : (
                                    <>
                                        <UploadCloud className="h-4 w-4" />
                                        <span className="hidden sm:inline">Guardar</span>
                                    </>
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            {todoGuardado ? "No hay cambios sin guardar" : "Guardar versión"}
                        </TooltipContent>
                    </Tooltip>

                </div>
            </TooltipProvider>

            {error && !manualOnly && <span className="text-xs text-destructive">{error}</span>}
        </>
    );
}
