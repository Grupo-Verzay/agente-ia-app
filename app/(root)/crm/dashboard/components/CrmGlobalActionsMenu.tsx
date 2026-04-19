"use client";

import { useMemo, useState } from "react";
import { Ban, MoreHorizontal, MoreVertical, RefreshCcw, Trash2 } from "lucide-react";

import {
  cancelUserActiveCrmFollowUps,
  deleteUserActiveCrmFollowUps,
  deleteUserSentCrmFollowUps,
  reactivateUserSentCrmFollowUps,
} from "@/actions/crm-follow-up-actions";
import { deleteAllRegistrosByUserId, deleteRegistrosByTipoAndUserId } from "@/actions/registro-action";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TipoRegistro } from "@/types/session";
import { toast } from "sonner";
import { CrmConfirmActionDialog } from "./CrmConfirmActionDialog";
import type { DashboardStats } from "./MainDashboard";

type GlobalActionId =
  | "cancel-active-follow-ups"
  | "delete-active-follow-ups"
  | "delete-sent-follow-ups"
  | "reactivate-sent-follow-ups"
  | "delete-all-records"
  | `delete-tipo-${TipoRegistro}`;

type ActionConfig = {
  label: string;
  description: string;
  confirmLabel: string;
  tone: "default" | "destructive";
  disabled: boolean;
  execute: () => Promise<{ success: boolean; message: string }>;
};

const TIPO_LABELS: Record<TipoRegistro, string> = {
  REPORTE: "Reportes",
  SOLICITUD: "Solicitudes",
  PEDIDO: "Pedidos",
  RECLAMO: "Reclamos",
  PAGO: "Pagos",
  RESERVA: "Reservas",
};

export function CrmGlobalActionsMenu({
  userId,
  stats,
  onDataChanged,
}: {
  userId: string;
  stats: DashboardStats | null;
  onDataChanged?: () => Promise<void> | void;
}) {
  const [selectedAction, setSelectedAction] = useState<GlobalActionId | null>(null);

  const activeFollowUpsCount = stats?.crmFollowUps.active ?? 0;
  const sentFollowUpsCount = stats?.crmFollowUps.sent ?? 0;
  const totalRegistros = stats?.totalRegistros ?? 0;
  const leadsConMovimientos = stats?.leadsConMovimientos ?? 0;
  
  const countsByTipo = useMemo(
    () => stats?.countsByTipo ?? ({} as Record<TipoRegistro, number>),
    [stats?.countsByTipo]
  );

  const actions = useMemo<Record<GlobalActionId, ActionConfig>>(
    () => {
      const baseActions: Record<
        Exclude<GlobalActionId, `delete-tipo-${TipoRegistro}`>,
        ActionConfig
      > = {
        "cancel-active-follow-ups": {
          label: `Cancelar follow-ups activos (${activeFollowUpsCount})`,
          description:
            "Marcara como cancelados todos los follow-ups pendientes o en proceso del CRM.",
          confirmLabel: "Cancelar activos",
          tone: "destructive",
          disabled: activeFollowUpsCount === 0,
          execute: () => cancelUserActiveCrmFollowUps(userId),
        },
        "delete-active-follow-ups": {
          label: `Eliminar follow-ups activos (${activeFollowUpsCount})`,
          description:
            "Eliminara definitivamente los follow-ups activos. Esta accion no se puede deshacer.",
          confirmLabel: "Eliminar activos",
          tone: "destructive",
          disabled: activeFollowUpsCount === 0,
          execute: () => deleteUserActiveCrmFollowUps(userId),
        },
        "delete-sent-follow-ups": {
          label: `Eliminar follow-ups enviados (${sentFollowUpsCount})`,
          description:
            "Eliminara el historial de follow-ups ya enviados. Esta accion no se puede deshacer.",
          confirmLabel: "Eliminar enviados",
          tone: "destructive",
          disabled: sentFollowUpsCount === 0,
          execute: () => deleteUserSentCrmFollowUps(userId),
        },
        "reactivate-sent-follow-ups": {
          label: `Reactivar follow-ups enviados (${sentFollowUpsCount})`,
          description:
            "Reprogramara nuevamente los follow-ups enviados usando las reglas actuales del CRM.",
          confirmLabel: "Reactivar enviados",
          tone: "default",
          disabled: sentFollowUpsCount === 0,
          execute: () => reactivateUserSentCrmFollowUps(userId),
        },
        "delete-all-records": {
          label: `Eliminar todos los registros (${totalRegistros})`,
          description:
            totalRegistros === 0
              ? "No hay registros cargados actualmente en el CRM."
              : `Eliminara ${totalRegistros} registros y vaciara los movimientos de ${leadsConMovimientos} leads. Esta accion no se puede deshacer.`,
          confirmLabel: "Eliminar registros",
          tone: "destructive",
          disabled: totalRegistros === 0,
          execute: () => deleteAllRegistrosByUserId(userId),
        },
      };

      const tipoActions = {} as Record<`delete-tipo-${TipoRegistro}`, ActionConfig>;

      (Object.entries(countsByTipo) as Array<[TipoRegistro, number]>).forEach(
        ([tipo, count]) => {
          const actionId: `delete-tipo-${TipoRegistro}` = `delete-tipo-${tipo}`;
          const label = TIPO_LABELS[tipo];

          tipoActions[actionId] = {
            label: `Eliminar ${label.toLowerCase()} (${count})`,
            description:
              count === 0
                ? `No hay ${label.toLowerCase()} en el CRM.`
                : `Eliminara ${count} ${label.toLowerCase()} del CRM. Esta accion no se puede deshacer.`,
            confirmLabel: `Eliminar ${label.toLowerCase()}`,
            tone: "destructive",
            disabled: count === 0,
            execute: () => deleteRegistrosByTipoAndUserId(userId, tipo),
          };
        }
      );

      return {
        ...baseActions,
        ...tipoActions,
      };
    },
    [
      activeFollowUpsCount,
      leadsConMovimientos,
      sentFollowUpsCount,
      totalRegistros,
      userId,
      countsByTipo,
    ]
  );

  const currentAction = selectedAction ? actions[selectedAction] : null;

  const handleConfirm = async () => {
    if (!selectedAction) return;

    const action = actions[selectedAction];
    const toastId = `crm-global-action-${selectedAction}`;

    toast.loading("Aplicando cambios globales en el CRM...", { id: toastId });

    const result = await action.execute();
    if (!result.success) {
      toast.error(result.message, { id: toastId });
      throw new Error(result.message);
    }

    await onDataChanged?.();
    toast.success(result.message, { id: toastId });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2">
            <MoreVertical/>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[280px]">
          <DropdownMenuLabel>Follow-ups</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={actions["cancel-active-follow-ups"].disabled}
            onSelect={() => setSelectedAction("cancel-active-follow-ups")}
          >
            <Ban className="h-4 w-4" />
            {actions["cancel-active-follow-ups"].label}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={actions["delete-active-follow-ups"].disabled}
            onSelect={() => setSelectedAction("delete-active-follow-ups")}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            {actions["delete-active-follow-ups"].label}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={actions["delete-sent-follow-ups"].disabled}
            onSelect={() => setSelectedAction("delete-sent-follow-ups")}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            {actions["delete-sent-follow-ups"].label}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={actions["reactivate-sent-follow-ups"].disabled}
            onSelect={() => setSelectedAction("reactivate-sent-follow-ups")}
          >
            <RefreshCcw className="h-4 w-4" />
            {actions["reactivate-sent-follow-ups"].label}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Registros</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={actions["delete-all-records"].disabled}
            onSelect={() => setSelectedAction("delete-all-records")}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            {actions["delete-all-records"].label}
          </DropdownMenuItem>

          {Object.keys(countsByTipo).length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Registros por tipo</DropdownMenuLabel>
              {(Object.entries(countsByTipo) as Array<[TipoRegistro, number]>).map(([tipo, count]) => {
                const actionId: `delete-tipo-${TipoRegistro}` = `delete-tipo-${tipo}`;
                const action = actions[actionId];

                return (
                  <DropdownMenuItem
                    key={actionId}
                    disabled={action.disabled}
                    onSelect={() => setSelectedAction(actionId)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    {action.label}
                  </DropdownMenuItem>
                );
              })}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {currentAction ? (
        <CrmConfirmActionDialog
          open={selectedAction !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedAction(null);
          }}
          title={currentAction.label}
          description={currentAction.description}
          confirmLabel={currentAction.confirmLabel}
          tone={currentAction.tone}
          onConfirm={handleConfirm}
        />
      ) : null}
    </>
  );
}
