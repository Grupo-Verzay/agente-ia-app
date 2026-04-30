"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import type { RegistroWithSession } from "@/types/session";
import { getDetalleRawValue, isDetalleChanged } from "../../helpers/detalleEdit";

export function CrmRecordDetailCell({
    registro,
    onChangeDetalle,
}: {
    registro: RegistroWithSession;
    onChangeDetalle?: (registroId: number, nuevoDetalle: string) => Promise<boolean>;
}) {
    const detalleRaw = getDetalleRawValue(registro);
    const detalle = detalleRaw || "Sin detalles";
    const isEmpty = !detalleRaw;
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(detalleRaw);
    const [isSaving, setIsSaving] = useState(false);

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen);
        setDraft(detalleRaw);
    };

    const handleSave = async () => {
        if (!onChangeDetalle) return;

        setIsSaving(true);
        const ok = await onChangeDetalle(registro.id, draft.trim());
        setIsSaving(false);

        if (!ok) return;
        setOpen(false);
    };

    const detalleChanged = isDetalleChanged(detalleRaw, draft);

    return (
        <TooltipProvider delayDuration={400}>
            <Tooltip>
                <Popover open={open} onOpenChange={handleOpenChange}>
                    <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                className="w-[250px] text-left"
                                title="Ver y editar detalle"
                            >
                                <span className={`block truncate text-sm ${isEmpty ? "text-muted-foreground italic" : ""}`}>
                                    {detalle}
                                </span>
                            </button>
                        </PopoverTrigger>
                    </TooltipTrigger>

                    <PopoverContent
                        side="top"
                        align="start"
                        className="w-[min(92vw,560px)] p-3"
                    >
                        <div className="space-y-3">
                            <div>
                                <p className="text-sm font-medium">Detalle editable</p>
                                <p className="text-xs text-muted-foreground">
                                    Ajusta el contexto comercial o de soporte del registro.
                                </p>
                            </div>

                            <Textarea
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                className="min-h-[160px] resize-y"
                                placeholder="Escribe el detalle del registro..."
                            />

                            <div className="flex items-center justify-end gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isSaving}
                                    onClick={() => handleOpenChange(false)}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={!onChangeDetalle || !detalleChanged || isSaving}
                                    onClick={handleSave}
                                >
                                    Guardar
                                </Button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>

                {!open && (
                    <TooltipContent
                        side="top"
                        align="start"
                        className="max-w-[320px] space-y-1 rounded-xl border border-border/60 bg-background p-3 text-foreground shadow-md"
                    >
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Detalle
                        </p>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed">
                            {detalle}
                        </p>
                    </TooltipContent>
                )}
            </Tooltip>
        </TooltipProvider>
    );
}
