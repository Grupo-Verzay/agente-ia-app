"use client";

import { deleteEntireWorkflow } from "@/actions/workflow-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  workflowName: string;
  workflowId: string;
  userId: string;
}

function DeleteWorkflowDialog({
  open,
  setOpen,
  workflowName,
  workflowId,
  userId,
}: Props) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await deleteEntireWorkflow(userId, workflowId);
    },
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(`Fase: ${res.stage} - ${res.detail}`, { id: workflowId });
        return;
      }

      toast.success("Flujo y datos eliminados correctamente", { id: workflowId });
      setConfirmText("");
      setOpen(false);
      router.refresh();
    },
    onError: (error: any) => {
      console.error("Error crítico al eliminar flujo:", error);
      toast.error("Error inesperado al intentar eliminar el flujo.", {
        id: workflowId,
      });
    },
  });

  const handleDelete = () => {
    toast.loading("⏳ Eliminando flujo y archivos...", { id: workflowId });
    deleteMutation.mutate();
  };

  const handleCancel = () => {
    setConfirmText("");
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción eliminará <strong>todos los nodos y archivos</strong> del flujo. Es irreversible.
          </AlertDialogDescription>

          <div className="flex flex-col py-4 gap-2">
            <p>
              Para confirmar, escribe: <b className="text-primary">{workflowName}</b>
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Escribe el nombre del flujo"
              disabled={deleteMutation.isPending}
            />
          </div>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={deleteMutation.isPending}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={
              confirmText !== workflowName || deleteMutation.isPending
            }
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
          >
            {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default DeleteWorkflowDialog;