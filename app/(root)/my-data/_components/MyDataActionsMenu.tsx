"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { contarExternalClientData, deleteAllExternalClientData } from "@/actions/external-client-data-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CrmConfirmActionDialog } from "@/app/(root)/crm/dashboard/components/CrmConfirmActionDialog";
import { elNombreDeLaSeccion } from "@/lib/pantalla-de-mis-datos";
import { BotonDelMenuDeLaSeccion } from "./PestanasDeLaSeccion";

type ActionId = "delete-all-data";

/**
 * El «⋯» de la sección de Google Sheets.
 *
 * El número de «Eliminar todos los datos» lo cuenta ÉL, al abrirse y cuando
 * algo cambia. Venía de la pestaña Gestionar, que solo existe mientras se mira:
 * en la de Importar —la que se abre primero— decía «(0)» y apagaba la opción
 * sobre una cuenta con registros, y después de importar no se ponía al día.
 */
export function MyDataActionsMenu({
  userId,
  refreshKey,
  onDataChanged,
}: {
  userId: string;
  refreshKey?: number;
  onDataChanged?: () => Promise<void> | void;
}) {
  const [selectedAction, setSelectedAction] = useState<ActionId | null>(null);
  // `null` es «no se sabe»: un 0 ahí apagaría la opción sin motivo.
  const [total, setTotal] = useState<number | null>(null);

  const contar = useCallback(async () => {
    try {
      setTotal(await contarExternalClientData(userId));
    } catch (error) {
      console.error("[mis-datos] no se pudieron contar los datos importados", error);
      setTotal(null);
    }
  }, [userId]);

  useEffect(() => {
    void contar();
  }, [contar, refreshKey]);

  // Si falla, el diálogo se queda abierto y lo dice: antes el aviso
  // «Eliminando datos...» se quedaba girando para siempre, porque el diálogo se
  // traga el error y nadie cerraba el toast.
  const handleConfirm = async () => {
    if (!selectedAction) return;
    const toastId = "my-data-global-action";
    toast.loading("Eliminando datos...", { id: toastId });
    try {
      const deleted = await deleteAllExternalClientData(userId);
      await contar();
      await onDataChanged?.();
      toast.success(`${deleted} registro(s) eliminados correctamente.`, { id: toastId });
    } catch (error) {
      console.error("[mis-datos] no se pudieron eliminar los datos importados", error);
      toast.error("No se pudieron eliminar los datos. Inténtalo de nuevo.", { id: toastId });
      throw error;
    }
  };

  const cuantos = total === null ? "—" : String(total);

  return (
    <>
      <DropdownMenu onOpenChange={(open) => { if (open) void contar(); }}>
        <DropdownMenuTrigger asChild>
          <BotonDelMenuDeLaSeccion seccion="sheets" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>{elNombreDeLaSeccion("sheets")}</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!total}
            onSelect={() => setSelectedAction("delete-all-data")}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar todos los datos ({cuantos})
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CrmConfirmActionDialog
        open={selectedAction !== null}
        onOpenChange={(open) => { if (!open) setSelectedAction(null); }}
        title="Eliminar todos los datos importados"
        description={
          !total
            ? "No hay datos cargados actualmente."
            : `Se eliminarán ${total} registro(s). Esta acción no se puede deshacer.`
        }
        confirmLabel="Eliminar todos"
        tone="destructive"
        onConfirm={handleConfirm}
      />
    </>
  );
}
