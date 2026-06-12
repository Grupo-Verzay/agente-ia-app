"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

interface GenericDeleteDialogProps {
    open: boolean;
    setOpen: (open: boolean) => void;
    itemName?: string; // Solo se requiere si `requireConfirmationText` es true
    itemId: string | number;
    mutationFn: (id: string) => Promise<{ success: boolean; message: string }>;
    entityLabel: string; // Ej: "Flujos", "respuesta rápida"
    requireConfirmationText?: boolean; // Si es true, exige escribir el nombre
}

export function GenericDeleteDialog({
    open,
    setOpen,
    itemName = '',
    itemId,
    mutationFn,
    entityLabel,
    requireConfirmationText = false,
}: GenericDeleteDialogProps) {
    const router = useRouter();
    const [confirmText, setConfirmText] = useState("");

    const deleteMutation = useMutation({
        mutationFn,
        onSuccess: (res) => {
            if (!res?.success) {
                toast.error(res?.message || `Hubo un error al eliminar el ${entityLabel}`, { id: itemId });
                return;
            }

            toast.success(res?.message || `${capitalize(entityLabel)} eliminado satisfactoriamente`, { id: itemId });
            setConfirmText("");
            setOpen(false);
            router.refresh();
        },
        onError: (err: any) => {
            toast.error(err?.message || `Hubo un error al eliminar el ${entityLabel}`, { id: itemId });
        },
    });

    const isConfirmDisabled = requireConfirmationText
        ? confirmText !== itemName || deleteMutation.isPending
        : deleteMutation.isPending;

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogContent className='border-border'>
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-black dark:text-gray-100">Se eliminará <strong className="text-red-800">{entityLabel.toUpperCase()}</strong> ¿Estás seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción eliminará <strong className="text-red-800 uppercase">{entityLabel}</strong>. Esta acción no se puede deshacer.  ¿Deseas continuar?
                    </AlertDialogDescription>

                    {requireConfirmationText && (
                        <div className="flex flex-col py-4 gap-2">
                            <p>
                                Escribe <b className="text-primary">{itemName}</b> para confirmar.
                            </p>
                            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
                        </div>
                    )}
                </AlertDialogHeader>

                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setConfirmText("")} className="text-black dark:text-gray-100">Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={isConfirmDisabled}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={(e) => {
                            e.stopPropagation();
                            toast.loading(`Eliminando ${entityLabel}...`, { id: itemId });
                            deleteMutation.mutate(itemId.toString());
                        }}
                    >
                        Eliminar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function capitalize(word: string) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}