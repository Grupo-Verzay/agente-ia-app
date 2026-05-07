'use client'

import { useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useSidebar } from "@/components/ui/sidebar";
import { fmtPhone } from "@/lib/whatsapp-jid";
import { SwitchStatus } from "./SwitchStatus";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
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
import { FlowListOrder } from "./FlowListOrder";
import { SeguimientoBadge } from "./SeguimientoBadge";
import { EditableNameCell } from "./EditableNameCell";

function DateCell({ value }: { value: string }) {
  const { state } = useSidebar();
  const d = new Date(value);
  const date = d.toLocaleDateString("es-CO", { year: "2-digit", month: "2-digit", day: "2-digit" });
  const time = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true });

  if (state === "expanded") {
    return (
      <div className="leading-tight text-center">
        <div className="whitespace-nowrap text-sm">{date}</div>
        <div className="whitespace-nowrap text-xs text-muted-foreground">{time}</div>
      </div>
    );
  }
  return <span className="block whitespace-nowrap text-center text-sm">{date}, {time}</span>;
}

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
      header: () => <div className="w-full text-center text-sm font-medium text-muted-foreground">WhatsApp</div>,
      cell: ({ row }) => {
        const remoteJid = row.getValue("remoteJid") as string;
        const phone = fmtPhone(remoteJid);
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
      header: () => <div className="w-full text-center text-sm font-medium text-muted-foreground">Nombre</div>,
      cell: ({ row }) => (
        <EditableNameCell session={row.original} onUpdated={mutateSessions} />
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="w-full px-1 text-sm font-medium text-muted-foreground hover:text-foreground justify-center">
          Sesión <ArrowUpDown className="ml-0.5 h-3 w-3" />
        </Button>
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
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="w-full px-1 text-sm font-medium text-muted-foreground hover:text-foreground justify-center">
          Agente <ArrowUpDown className="ml-0.5 h-3 w-3" />
        </Button>
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
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="w-full px-1 text-sm font-medium text-muted-foreground hover:text-foreground justify-center">
          Creado <ArrowUpDown className="ml-0.5 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => <DateCell value={row.getValue("createdAt")} />,
    },
    {
      accessorKey: "flujos",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="w-full px-1 text-sm font-medium text-muted-foreground hover:text-foreground justify-center">
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
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="w-full px-1 text-sm font-medium text-muted-foreground hover:text-foreground justify-center">
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
      header: () => <div className="w-full text-center text-sm font-medium text-muted-foreground">Etiquetas</div>,
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
      header: () => <div className="w-full text-center text-sm font-medium text-muted-foreground">Acciones</div>,
      cell: ({ row }) => (
        <div className="flex justify-center">
          <ActionsCell session={row.original} onDeleteSuccess={onDeleteSuccess} />
        </div>
      ),
    },
  ];