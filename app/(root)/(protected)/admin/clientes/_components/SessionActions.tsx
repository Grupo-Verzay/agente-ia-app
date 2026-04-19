'use client'

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { MoreHorizontal } from "lucide-react";
import { deleteSession } from "@/actions/session-action";
import { deleteConversationN8N } from "@/actions/n8n-chat-historial-action";
import { toast } from "sonner";

interface SessionActionsProps {
  userId: string;
  sessionId: number;
  remoteJid: string;
  onDeleteSession: (sessionId: number) => void;
}

export function SessionActions({ userId, sessionId, remoteJid, onDeleteSession }: SessionActionsProps) {
  const [openDeleteCliente, setOpenDeleteCliente] = useState(false);

  const handleDeleteCliente = async () => {
    try {
      const res = await deleteSession(userId, sessionId, remoteJid);
      if (res.success) {
        await deleteConversationN8N(userId, sessionId, remoteJid);
        onDeleteSession(sessionId);
        toast.success("Cliente eliminado correctamente.");
      } else {
        toast.error(res.message || "Error al eliminar sesión.");
      }
    } catch (error) {
      toast.error("Error inesperado al eliminar.");
      console.error(error);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setOpenDeleteCliente(true);
            }}
            className="text-red-600 cursor-pointer"
          >
            Eliminar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={openDeleteCliente} onOpenChange={setOpenDeleteCliente}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará la sesión y su historial asociado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteCliente}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
