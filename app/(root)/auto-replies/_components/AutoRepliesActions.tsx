"use client";

import { useState } from "react";
import { MoreVerticalIcon, ShuffleIcon, TrashIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import TooltipWrapper from "@/components/TooltipWrapper";
import { GenericDeleteDialog } from "@/components/shared/GenericDeleteDialog";
import { deleteRR } from "@/actions/rr-actions";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getWorkflowEditorPath } from "@/types/workflow";

interface AutoRepliesActionsProps {
    autoReplieId: number;
    /** El flujo que ejecuta, si existe. Sin él no hay nada que editar. */
    workflow: { id: string; isPro: boolean } | null;
    /** ¿Puede quien mira borrarla? Si no, el menú no se pinta. */
    editable: boolean;
}

/**
 * Los mandos de una respuesta: «Editar» el flujo que ejecuta y el «⋯».
 *
 * «Editar» solo sale cuando el flujo EXISTE. Antes se pintaba siempre en una
 * respuesta de flujo y, si el flujo se había borrado, llevaba a
 * `/workflow/404`: un botón que al pulsarlo lleva a una página de error es peor
 * que no tenerlo.
 *
 * Y el «⋯» con «Eliminar» solo sale a quien puede borrarla: una opción que al
 * pulsarla contesta «No autorizado» es un menú abierto con la puerta cerrada.
 */
export const AutoRepliesActions = ({ autoReplieId, workflow, editable }: AutoRepliesActionsProps) => {
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    return (
        <>
            <GenericDeleteDialog
                open={showDeleteDialog}
                setOpen={setShowDeleteDialog}
                itemId={autoReplieId}
                mutationFn={() => deleteRR(autoReplieId)}
                entityLabel="respuesta rápida"
            />

            {workflow && (
                <Link
                    href={getWorkflowEditorPath(workflow.id, workflow.isPro)}
                    data-zona="editar-flujo"
                    className={cn(
                        buttonVariants({
                            variant: "outline",
                            size: "sm",
                        }),
                        "flex items-center gap-2",
                    )}
                >
                    <ShuffleIcon size={16} />
                    Editar flujo
                </Link>
            )}

            {editable && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant={"outline"} size={"sm"} aria-label="Más acciones" data-zona="mas-acciones">
                            <TooltipWrapper content={"Más acciones"}>
                                <div className="flex items-center justify-center w-full h-full">
                                    <MoreVerticalIcon size={18} />
                                </div>
                            </TooltipWrapper>
                        </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="text-destructive flex items-center gap-2"
                            onSelect={() => setShowDeleteDialog(true)}
                        >
                            <TrashIcon size={16} /> Eliminar
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </>
    );
};
