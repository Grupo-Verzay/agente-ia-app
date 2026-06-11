"use client";

import { useState } from "react";
import { MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteAllExternalClientData } from "@/actions/external-client-data-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CrmConfirmActionDialog } from "@/app/(root)/crm/dashboard/components/CrmConfirmActionDialog";

type ActionId = "delete-all-data";

export function MyDataActionsMenu({
  userId,
  total,
  onDataChanged,
}: {
  userId: string;
  total: number;
  onDataChanged?: () => Promise<void> | void;
}) {
  const [selectedAction, setSelectedAction] = useState<ActionId | null>(null);

  const handleConfirm = async () => {
    if (!selectedAction) return;
    const toastId = "my-data-global-action";
    toast.loading("Eliminando datos...", { id: toastId });
    const deleted = await deleteAllExternalClientData(userId);
    await onDataChanged?.();
    toast.success(`${deleted} registro(s) eliminados correctamente.`, { id: toastId });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Datos externos</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={total === 0}
            onSelect={() => setSelectedAction("delete-all-data")}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar todos los datos ({total})
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CrmConfirmActionDialog
        open={selectedAction !== null}
        onOpenChange={(open) => { if (!open) setSelectedAction(null); }}
        title="Eliminar todos los datos externos"
        description={
          total === 0
            ? "No hay datos cargados actualmente."
            : `Se eliminarán ${total} registro(s) de datos externos. Esta acción no se puede deshacer.`
        }
        confirmLabel="Eliminar todos"
        tone="destructive"
        onConfirm={handleConfirm}
      />
    </>
  );
}
