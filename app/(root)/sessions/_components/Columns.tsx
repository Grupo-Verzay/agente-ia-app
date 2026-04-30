'use client'

import { useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { SwitchStatus } from "./SwitchStatus";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowUpDown, BadgeCheckIcon, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteSession } from "@/actions/session-action";
import { deleteConversationN8N } from "@/actions/n8n-chat-historial-action";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { deleteReminderByInstanceUserRemote } from "@/actions/seguimientos-actions";
import { SessionTagsCombobox } from "../../tags/components";
import { Session, SimpleTag } from "@/types/session";
import { SwitchAgentDisabled } from "./SwitchAgentDisabled";
import { HeaderWithInfo } from "./HeaderWithInfo";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FlowListOrder } from "./FlowListOrder";
import { SeguimientoBadge } from "./SeguimientoBadge";
import { EditableNameCell } from "./EditableNameCell";

export const ActionsCell = ({ session, onDeleteSuccess }: { session: Session, onDeleteSuccess?: (deletedId: number) => void }) => {
  const [openDeleteCliente, setOpenDeleteCliente] = useState(false);
  const [openDeleteHistorial, setOpenDeleteHistorial] = useState(false);
  const [openDeleteReminders, setOpenDeleteReminders] = useState(false);

  const handleDeleteCliente = async () => {
    try {
      const sessionRes = await deleteSession(session.userId, session.id, session.remoteJid);
      if (!sessionRes.success) {
        toast.error(sessionRes.message || "Error al eliminar sesión.");
        return;
      }
      const conversationRes = await deleteConversationN8N(session.userId, session.id, session.remoteJid);
      if (!conversationRes.success) {
        toast.warning(conversationRes.message || "Sesión eliminada pero historial no encontrado.");
      }

      await handleDeleteSeguimientos();
      if (onDeleteSuccess) {
        onDeleteSuccess(session.id);
        toast.success("Cliente eliminado correctamente.");
      }

    } catch (error) {
      toast.error("Error inesperado al eliminar cliente.");
      console.error(error);
    }
  };

  const handleDeleteHistorial = async () => {
    try {
      const conversationRes = await deleteConversationN8N(session.userId, session.id, session.remoteJid);
      if (conversationRes.success) {
        toast.success("Historial eliminado correctamente.");
      } else {
        toast.error(conversationRes.message || "Error al eliminar historial.");
      }
    } catch (error) {
      toast.error("Error inesperado al eliminar historial.");
      console.error(error);
    }
  };

  const handleDeleteSeguimientos = async () => {
    try {
      const reminderRes = await deleteReminderByInstanceUserRemote(
        session.instanceId,
        session.userId,
        session.remoteJid
      )
      if (reminderRes.success) {
        toast.success(reminderRes.message);
      } else {
        toast.error(reminderRes.message || "Error al eliminar seguimientos.");
      }
    } catch (error) {
      toast.error("Error inesperado al eliminar seguimientos.");
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
              setOpenDeleteHistorial(true);
            }}
            className="text-red-600"
          >
            Eliminar historial
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setOpenDeleteCliente(true);
            }}
            className="text-red-600"
          >
            Eliminar sesión
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setOpenDeleteReminders(true);
            }}
            className="text-red-600"
          >
            Eliminar seguimientos
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={openDeleteHistorial} onOpenChange={setOpenDeleteHistorial}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar historial?</AlertDialogTitle>
            <AlertDialogDescription>Eliminará solo el historial de conversación.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteHistorial}
            >
              Eliminar historial
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={openDeleteCliente} onOpenChange={setOpenDeleteCliente}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar sesión?</AlertDialogTitle>
            <AlertDialogDescription>Eliminará la sesión y su historial. ¿Deseas continuar?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteCliente}
            >
              Eliminar sesión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={openDeleteReminders} onOpenChange={setOpenDeleteReminders}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar seguimientos?</AlertDialogTitle>
            <AlertDialogDescription>Eliminará todos los seguimientos asociados al cliente. ¿Deseas continuar?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteSeguimientos}
            >
              Eliminar seguimientos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// --- Columns corregido ---
export const columns = ({ onDeleteSuccess, mutateSessions, allTags, onNavigateToChat }: {
  onDeleteSuccess: (deletedId: number) => void,
  mutateSessions: () => void,
  allTags: SimpleTag[];
  onNavigateToChat: (remoteJid: string) => void;
}): ColumnDef<Session>[] => [
    {
      accessorKey: "remoteJid",
      header: "Celular",
      cell: ({ row }) => {
        const remoteJid = row.getValue("remoteJid") as string;
        const phone = remoteJid.split('@')[0];
        return (
          <button
            onClick={() => onNavigateToChat(remoteJid)}
            className="min-w-[80px] cursor-pointer text-blue-600 hover:text-blue-800 transition-colors"
          >
            <p className="font-medium">{phone}</p>
            {/* <p className="text-xs text-muted-foreground">
              {row.original.instanceId}
            </p> */}
          </button>
        );
      },
    },
    {
      accessorKey: "pushName",
      header: "Nombre",
      cell: ({ row }) => (
        <EditableNameCell session={row.original} onUpdated={mutateSessions} />
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <div className="flex items-center gap-1">
          <HeaderWithInfo
            title="Sesión"
            info="Controla si el chat está activo/inactivo para automatizaciones de conversación (pausas, antiflood, reactivaciones, etc.)."
          />
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            <ArrowUpDown className="h-3 w-3" />
          </Button>
        </div>
      ),
      cell: ({ row }) => {
        const status = row.getValue("status") as boolean;
        const sessionId = row.original.id;
        return (
          <div className="flex justify-center">
            <SwitchStatus checked={status} sessionId={sessionId} mutateSessions={mutateSessions} />
          </div>
        );
      },
    },
    {
      accessorKey: "agentDisabled",
      header: ({ column }) => (
        <div className="flex items-center gap-1">
          <HeaderWithInfo
            title="Agente"
            info="Apaga o enciende el agente IA para este cliente. Si está OFF, el sistema guarda historial, pero no ejecuta IA ni workflows."
          />
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            <ArrowUpDown className="h-3 w-3" />
          </Button>
        </div>
      ),
      cell: ({ row }) => {
        const session = row.original;
        return (
          <div className="flex justify-center">
            <SwitchAgentDisabled
              agentDisabled={!!session.agentDisabled}
              userId={session.userId}
              sessionId={session.id}
              mutateSessions={mutateSessions}
            />
          </div>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="px-1 text-sm">
          Creado <ArrowUpDown className="ml-0.5 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => new Date(row.getValue("createdAt")).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }),
    },
    {
      accessorKey: "flujos",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="px-1 text-sm">
          Flujos <ArrowUpDown className="ml-0.5 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const flows = row.getValue("flujos") || "-";
        return (
          <div className="flex justify-center">
            <FlowListOrder raw={flows.toString()} />
          </div>
        );
      },
    },
    {
      accessorKey: "pendingSeguimientos",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="px-1 text-sm">
          Seguimientos <ArrowUpDown className="ml-0.5 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const count = (row.original.pendingSeguimientos ?? 0) as number;
        return (
          <div className="flex justify-center">
            <SeguimientoBadge count={count} />
          </div>
        );
      },
    },
    {
      id: "tags",
      header: "Etiquetas",
      cell: ({ row }) => {
        const session = row.original;
        const initialSelectedTagIds = (session.tags ?? []).map((t) => t.id);

        return (
          <div className="flex justify-center">
            <SessionTagsCombobox
              userId={session.userId}
              sessionId={session.id}
              allTags={allTags}
              initialSelectedIds={initialSelectedTagIds}
            />
          </div>
        );
      },
    },
    {
      accessorKey: "acciones",
      header: "Acciones",
      cell: ({ row }) => (
        <div className="flex justify-center">
          <ActionsCell session={row.original} onDeleteSuccess={onDeleteSuccess} />
        </div>
      ),
    },
  ];