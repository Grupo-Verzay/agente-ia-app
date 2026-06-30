"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
        if (nextOpen) setDraft(detalleRaw);
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
        <>
            <TooltipProvider delayDuration={400}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            className="w-[165px] text-left"
                            title="Ver y editar detalle"
                            onClick={() => handleOpenChange(true)}
                        >
                            <span className={`block truncate text-sm ${isEmpty ? "text-muted-foreground italic" : ""}`}>
                                {detalle}
                            </span>
                        </button>
                    </TooltipTrigger>

                    {!open && (
                        <TooltipContent
                            side="top"
                            align="start"
                            className="w-96 max-h-64 overflow-y-auto space-y-1 rounded-xl border border-border/60 bg-background p-3 text-foreground shadow-md"
                        >
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                Detalle
                            </p>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">
                                {detalle}
                            </p>
                        </TooltipContent>
                    )}
                </Tooltip>
            </TooltipProvider>

            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle>Detalle editable</DialogTitle>
                        <DialogDescription>
                            Ajusta el contexto comercial o de soporte del registro.
                        </DialogDescription>
                    </DialogHeader>

                    <Textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        className="min-h-[220px] resize-y"
                        placeholder="Escribe el detalle del registro..."
                    />

                    <DialogFooter>
                        <Button
                            variant="outline"
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
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
