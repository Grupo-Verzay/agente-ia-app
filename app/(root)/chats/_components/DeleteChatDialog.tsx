"use client";

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
import type { SidebarContact } from "./chat-sidebar.types";

type DeleteChatDialogProps = {
  onCancel: () => void;
  onConfirm: (id: string) => void;
  target: SidebarContact | null;
};

export function DeleteChatDialog({ onCancel, onConfirm, target }: DeleteChatDialogProps) {
  return (
    <AlertDialog open={Boolean(target)} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar chat de tu bandeja</AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? `El chat con ${target.name} se ocultara de tu bandeja principal. Esta accion no elimina mensajes del proveedor.`
              : "Esta accion ocultara el chat de tu bandeja principal."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={() => {
              if (!target) return;
              onConfirm(target.id);
              onCancel();
            }}
          >
            Eliminar chat
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
