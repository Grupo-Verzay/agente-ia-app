"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { Registro } from "@prisma/client";

import {
  deleteRegistro,
  deleteRegistrosBySessionId,
} from "@/actions/registro-action";
import { RegistroUpsertDialog } from "@/app/(root)/crm/components/RegistroUpsertDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RegistroWithSession } from "@/types/session";
import { toast } from "sonner";
import { CrmConfirmActionDialog } from "../CrmConfirmActionDialog";
import {
  getDisplayNombreFromRegistro,
  getDisplayWhatsappFromSession,
} from "../../helpers";

export function CrmRecordActionsCell({
  registro,
  onUpdated,
}: {
  registro: RegistroWithSession;
  onUpdated?: () => Promise<void> | void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteRecordOpen, setDeleteRecordOpen] = useState(false);
  const [deleteLeadMovementsOpen, setDeleteLeadMovementsOpen] = useState(false);

  const displayName = getDisplayNombreFromRegistro(registro);
  const displayWhatsapp = getDisplayWhatsappFromSession(registro.session);

  const handleDeleteRegistro = async () => {
    const toastId = `crm-delete-registro-${registro.id}`;
    toast.loading("Eliminando registro...", { id: toastId });

    const result = await deleteRegistro(registro.id);
    if (!result.success) {
      toast.error(result.message ?? "No se pudo eliminar el registro.", {
        id: toastId,
      });
      throw new Error(result.message ?? "No se pudo eliminar el registro.");
    }

    await onUpdated?.();
    toast.success("Registro eliminado correctamente.", { id: toastId });
  };

  const handleDeleteLeadMovements = async () => {
    const toastId = `crm-delete-session-records-${registro.sessionId}`;
    toast.loading("Eliminando movimientos del lead...", { id: toastId });

    const result = await deleteRegistrosBySessionId(registro.sessionId);
    if (!result.success) {
      toast.error(result.message, { id: toastId });
      throw new Error(result.message);
    }

    await onUpdated?.();
    toast.success(result.message, { id: toastId });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Acciones del registro"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Editar registro
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() => setDeleteRecordOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar registro
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => setDeleteLeadMovementsOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar movimientos del lead
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RegistroUpsertDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        sessionId={registro.sessionId}
        sessionPushName={registro.session.pushName}
        initialTipo={registro.tipo}
        registro={registro as Registro}
        onSuccess={() => {
          void onUpdated?.();
        }}
      />

      <CrmConfirmActionDialog
        open={deleteRecordOpen}
        onOpenChange={setDeleteRecordOpen}
        title="Eliminar registro"
        description={`Se eliminara el registro de ${displayName} (${displayWhatsapp}). Esta accion no se puede deshacer.`}
        confirmLabel="Eliminar registro"
        tone="destructive"
        onConfirm={handleDeleteRegistro}
      />

      <CrmConfirmActionDialog
        open={deleteLeadMovementsOpen}
        onOpenChange={setDeleteLeadMovementsOpen}
        title="Eliminar movimientos del lead"
        description={`Se eliminaran todos los movimientos del lead ${displayName} (${displayWhatsapp}). Esta accion no se puede deshacer.`}
        confirmLabel="Eliminar movimientos"
        tone="destructive"
        onConfirm={handleDeleteLeadMovements}
      />
    </>
  );
}
