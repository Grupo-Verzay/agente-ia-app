"use client";

import { useMemo, useState } from "react";
import { MoreHorizontal, Pencil, RefreshCcw, Trash2 } from "lucide-react";

import {
  deleteCrmFollowUpById,
  reactivateCrmFollowUpById,
  updateCrmFollowUpSchedule,
} from "@/actions/crm-follow-up-actions";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { SessionCrmFollowUpHistoryItem } from "@/types/session";
import { toast } from "sonner";
import { CrmConfirmActionDialog } from "./CrmConfirmActionDialog";

function toDatetimeLocalValue(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (segment: number) => String(segment).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CrmFollowUpItemActions({
  item,
  userId,
  onUpdated,
}: {
  item: SessionCrmFollowUpHistoryItem;
  userId?: string;
  onUpdated?: () => Promise<void> | void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [scheduledForDraft, setScheduledForDraft] = useState(
    toDatetimeLocalValue(item.scheduledFor)
  );
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  const canDelete = Boolean(userId);
  const canEdit = Boolean(
    userId && (item.status === "PENDING" || item.status === "PROCESSING")
  );
  const canReactivate = Boolean(
    userId &&
      ["FAILED", "SENT", "CANCELLED", "SKIPPED"].includes(item.status)
  );

  const reactivateDescription = useMemo(() => {
    if (item.status === "SENT") {
      return "Se programara un nuevo envio para este follow-up usando las reglas actuales del CRM.";
    }

    return "Se intentara reactivar este follow-up con las reglas actuales del CRM.";
  }, [item.status]);

  if (!canDelete && !canEdit && !canReactivate) {
    return null;
  }

  const handleEditOpen = () => {
    setScheduledForDraft(toDatetimeLocalValue(item.scheduledFor));
    setEditOpen(true);
  };

  const handleSaveSchedule = async () => {
    if (!userId) return;

    if (!scheduledForDraft) {
      toast.error("Selecciona una fecha y hora para el follow-up.");
      return;
    }

    const scheduledForDate = new Date(scheduledForDraft);
    if (Number.isNaN(scheduledForDate.getTime())) {
      toast.error("La fecha del follow-up no es valida.");
      return;
    }

    const isoScheduledFor = scheduledForDate.toISOString();
    const toastId = `crm-follow-up-schedule-${item.id}`;
    toast.loading("Reprogramando follow-up...", { id: toastId });

    setIsSavingSchedule(true);
    try {
      const result = await updateCrmFollowUpSchedule({
        userId,
        followUpId: item.id,
        scheduledFor: isoScheduledFor,
      });

      if (!result.success) {
        toast.error(result.message, { id: toastId });
        return;
      }

      await onUpdated?.();
      setEditOpen(false);
      toast.success(result.message, { id: toastId });
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleDelete = async () => {
    if (!userId) return;

    const toastId = `crm-follow-up-delete-${item.id}`;
    toast.loading("Eliminando follow-up...", { id: toastId });

    const result = await deleteCrmFollowUpById({
      userId,
      followUpId: item.id,
    });

    if (!result.success) {
      toast.error(result.message, { id: toastId });
      throw new Error(result.message);
    }

    await onUpdated?.();
    toast.success(result.message, { id: toastId });
  };

  const handleReactivate = async () => {
    if (!userId) return;

    const toastId = `crm-follow-up-reactivate-${item.id}`;
    toast.loading("Reactivando follow-up...", { id: toastId });

    const result = await reactivateCrmFollowUpById({
      userId,
      followUpId: item.id,
    });

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
            className="h-7 w-7"
            aria-label="Acciones del follow-up"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit ? (
            <DropdownMenuItem onSelect={handleEditOpen}>
              <Pencil className="h-4 w-4" />
              Editar programacion
            </DropdownMenuItem>
          ) : null}

          {canReactivate ? (
            <DropdownMenuItem onSelect={() => setReactivateOpen(true)}>
              <RefreshCcw className="h-4 w-4" />
              Reactivar
            </DropdownMenuItem>
          ) : null}

          {canDelete ? (
            <DropdownMenuItem
              onSelect={() => setDeleteOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reprogramar follow-up</DialogTitle>
            <DialogDescription>
              Ajusta la fecha y hora del follow-up activo.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Input
              type="datetime-local"
              value={scheduledForDraft}
              onChange={(event) => setScheduledForDraft(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={isSavingSchedule}
              onClick={() => setEditOpen(false)}
            >
              Cancelar
            </Button>
            <Button disabled={isSavingSchedule} onClick={handleSaveSchedule}>
              Guardar programacion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CrmConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Eliminar follow-up"
        description="Este follow-up se eliminara definitivamente del historial del CRM."
        confirmLabel="Eliminar follow-up"
        tone="destructive"
        onConfirm={handleDelete}
      />

      <CrmConfirmActionDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        title="Reactivar follow-up"
        description={reactivateDescription}
        confirmLabel="Reactivar follow-up"
        tone="default"
        onConfirm={handleReactivate}
      />
    </>
  );
}
