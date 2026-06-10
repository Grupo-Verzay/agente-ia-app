// app/(root)/ai/_components/PromptToolbar.tsx
"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronDown, Loader2, UploadCloud } from "lucide-react";
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
    const [noteOpen, setNoteOpen] = useState(false);
    const [note, setNote] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const isSaving = manualOnly ? isManualSaving : !!loading || isPending;

    const handleSave = useCallback(async (saveNote?: string) => {
        setNoteOpen(false);
        try {
            if (onManualSave) {
                setIsManualSaving(true);
                await onManualSave();
                setIsManualSaving(false);
            }
            if (manualOnly) {
                toast.success(successMessage);
                return;
            }
            await publish(saveNote?.trim() || undefined);
            startTransition(() => { router.refresh(); });
            toast.success(successMessage);
        } catch (e: any) {
            toast.error(e?.message ?? "No se pudo guardar");
        } finally {
            setIsManualSaving(false);
            setNote("");
        }
    }, [manualOnly, onManualSave, publish, router, startTransition, successMessage]);

    useEffect(() => {
        if (error) toast.error(error);
    }, [error]);

    useEffect(() => {
        if (noteOpen) setTimeout(() => textareaRef.current?.focus(), 50);
    }, [noteOpen]);

    return (
        <>
            <div aria-live="polite" aria-atomic="true" className="sr-only">
                {isSaving ? "Guardando..." : "Listo para guardar"}
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
                                aria-label="Guardar"
                                className="
                                    gap-0 sm:gap-2 px-2 sm:px-3 h-9 rounded-r-none
                                    bg-emerald-600 text-white
                                    hover:bg-emerald-700
                                    focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2
                                    disabled:bg-emerald-600/60 disabled:text-white/80
                                "
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span className="hidden sm:inline">Guardando...</span>
                                    </>
                                ) : (
                                    <>
                                        <UploadCloud className="h-4 w-4" />
                                        <span className="hidden sm:inline">Guardar</span>
                                    </>
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Guardar versión</TooltipContent>
                    </Tooltip>

                    {/* Flecha para guardar con nota */}
                    {!manualOnly && (
                        <Popover open={noteOpen} onOpenChange={setNoteOpen}>
                            <Tooltip delayDuration={200}>
                                <TooltipTrigger asChild>
                                    <PopoverTrigger asChild>
                                        <Button
                                            disabled={isSaving}
                                            size="icon"
                                            className="
                                                h-9 w-7 rounded-l-none border-l border-emerald-500/40
                                                bg-emerald-600 text-white
                                                hover:bg-emerald-700
                                                disabled:bg-emerald-600/60
                                            "
                                            aria-label="Guardar con nota"
                                        >
                                            <ChevronDown className="h-3.5 w-3.5" />
                                        </Button>
                                    </PopoverTrigger>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">Guardar con nota</TooltipContent>
                            </Tooltip>
                            <PopoverContent align="end" className="w-72 p-3 space-y-2">
                                <p className="text-xs font-medium text-foreground">Nota de versión <span className="text-muted-foreground font-normal">(opcional)</span></p>
                                <textarea
                                    ref={textareaRef}
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="Ej: Actualicé precios, agregué horarios..."
                                    rows={3}
                                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-muted-foreground/50"
                                />
                                <div className="flex gap-2 justify-end">
                                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setNoteOpen(false)}>
                                        Cancelar
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                        onClick={() => handleSave(note)}
                                    >
                                        Guardar
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>
                    )}
                </div>
            </TooltipProvider>

            {error && !manualOnly && <span className="text-xs text-destructive">{error}</span>}
        </>
    );
}
