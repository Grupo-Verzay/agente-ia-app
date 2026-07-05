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
          <AlertDialogTitle>Eliminar chat</AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? `El chat con ${target.name} se quitara de esta vista y se eliminara su sesion en la app. Si el cliente vuelve a escribir, aparecera como una conversacion entrante nueva.`
              : "Esta accion quitara el chat de esta vista y eliminara su sesion en la app."}
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
