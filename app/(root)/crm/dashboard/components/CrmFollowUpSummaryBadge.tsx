"use client";

import { useState } from "react";
import { RefreshCcw, XCircle } from "lucide-react";

import {
  cancelSessionCrmFollowUps,
  retrySessionReactivatableCrmFollowUps,
} from "@/actions/crm-follow-up-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  SessionCrmFollowUpHistoryItem,
  SessionCrmFollowUpSummary,
} from "@/types/session";
import { toast } from "sonner";
import { CrmConfirmActionDialog } from "./CrmConfirmActionDialog";
import { CrmFollowUpItemActions } from "./CrmFollowUpItemActions";
import { LeadStatusBadge } from "./records-table/LeadStatusBadge";

const STATUS_LABELS = {
  PENDING: "Follows",
  PROCESSING: "Procesando",
  SENT: "Enviado",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
  SKIPPED: "Omitido",
} as const;

function getStatusClassName(status: SessionCrmFollowUpSummary["latestStatus"]) {
  switch (status) {
    case "PENDING":
      return "border-amber-300 bg-amber-100 text-amber-800";
    case "PROCESSING":
      return "border-blue-300 bg-blue-100 text-blue-800";
    case "SENT":
      return "border-emerald-300 bg-emerald-100 text-emerald-800";
    case "FAILED":
      return "border-rose-300 bg-rose-100 text-rose-800";
    case "CANCELLED":
      return "border-slate-300 bg-slate-200 text-slate-700";
    case "SKIPPED":
      return "border-violet-300 bg-violet-100 text-violet-800";
    default:
      return "border-slate-300 bg-slate-100 text-slate-600";
  }
}

function formatDate(value?: string | null) {
  if (!value) return null;

  return new Date(value).toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getHistoryAttemptLabel(item: SessionCrmFollowUpHistoryItem) {
  if (item.status === "PENDING" && item.attemptCount === 0) return "Aun no ejecutado";
  return `Intento ${Math.max(item.attemptCount, 1)}`;
}

export function CrmFollowUpSummaryBadge({
  summary,
  userId,
  remoteJid,
  instanceId,
  onUpdated,
}: {
  summary?: SessionCrmFollowUpSummary | null;
  userId?: string;
  remoteJid?: string | null;
  instanceId?: string | null;
  onUpdated?: () => Promise<void> | void;
}) {
  const [pendingAction, setPendingAction] = useState<"cancel" | "reactivate" | null>(null);
  const [confirmAction, setConfirmAction] = useState<"cancel" | "reactivate" | null>(null);

  if (!summary || summary.total === 0) {
    return (
      <Badge variant="outline" className="h-7 gap-1.5 rounded-md px-2 text-xs font-medium border-slate-300 bg-slate-100 text-slate-600">
        Sin follow-up
      </Badge>
    );
  }

  const latestLabel = summary.latestStatus
    ? STATUS_LABELS[summary.latestStatus]
    : "Sin estado";

  const formattedLatestDate = formatDate(summary.latestScheduledFor);

  const canManage = Boolean(userId && remoteJid && instanceId);
  const canCancel = canManage && summary.active > 0;
  const canReactivate = canManage && (summary.failed > 0 || summary.cancelled > 0 || summary.sent > 0);

  const renderBadges = () => (
    <div className="flex gap-1 flex-wrap">
      <Badge variant="outline" className={getStatusClassName(summary.latestStatus)}>
        {latestLabel}
      </Badge>

      {summary.active > 0 && (
        <Badge variant="outline" className="border-blue-300 bg-blue-100 text-blue-800">
          Activos {summary.active}
        </Badge>
      )}

      {summary.sent > 0 && (
        <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-800">
          Enviados {summary.sent}
        </Badge>
      )}

      {summary.failed > 0 && (
        <Badge variant="outline" className="border-rose-300 bg-rose-100 text-rose-800">
          Fallidos {summary.failed}
        </Badge>
      )}
    </div>
  );

  const handleAction = async (action: "cancel" | "reactivate") => {
    if (!userId || !remoteJid || !instanceId) return;

    const toastId = `crm-follow-up-${action}-${instanceId}-${remoteJid}`;
    toast.loading(
      action === "cancel" ? "Cancelando follow-ups..." : "Reactivando follow-ups...",
      { id: toastId }
    );
    setPendingAction(action);

    try {
      const result =
        action === "cancel"
          ? await cancelSessionCrmFollowUps({ userId, remoteJid, instanceId })
          : await retrySessionReactivatableCrmFollowUps({ userId, remoteJid, instanceId });

      if (!result.success) {
        throw new Error(result.message);
      }

      await onUpdated?.();
      toast.success(result.message, { id: toastId });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el follow-up.",
        { id: toastId }
      );
    } finally {
      setPendingAction(null);
    }
  };

  const hasActions = canCancel || canReactivate;

  return (
    <>
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <Popover>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button type="button" className="inline-flex h-7 items-center focus:outline-none">
                <Badge
                  variant="outline"
                  className={`h-7 gap-1.5 rounded-md px-2 text-xs font-medium ${getStatusClassName(summary.latestStatus)}`}
                >
                  {latestLabel}
                  {summary.active > 0 && (
                    <span className="inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-current/20 px-1 text-[10px] font-bold leading-none">
                      {summary.active}
                    </span>
                  )}
                </Badge>
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <PopoverContent align="start" className="w-[380px] p-0">
            <ScrollArea className="h-[420px]">
              <div className="space-y-3 p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Follow-up IA</p>
                  <p className="text-xs text-muted-foreground">
                    {formattedLatestDate
                      ? `Proximo envio: ${formattedLatestDate}`
                      : "Sin programacion disponible"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1">
                  {renderBadges()}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Total: {summary.total}</span>
                  <span>Procesando: {summary.processing}</span>
                  <span>Pendientes: {summary.pending}</span>
                  <span>Cancelados: {summary.cancelled}</span>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium">Ultimo mensaje</p>
                  <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                    {summary.latestGeneratedMessage || "Aun no se ha enviado un mensaje."}
                  </p>
                </div>

                {summary.recentItems.length > 0 && (
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-xs font-medium">Historial reciente</p>
                    <div className="space-y-2">
                      {summary.recentItems.map((item) => {
                        const scheduledFor = formatDate(item.scheduledFor);
                        const updatedAt = formatDate(item.updatedAt);

                        return (
                          <div
                            key={item.id}
                            className="rounded-md border border-border/70 bg-muted/20 p-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1">
                                <Badge
                                  variant="outline"
                                  className={getStatusClassName(item.status)}
                                >
                                  {STATUS_LABELS[item.status]}
                                </Badge>
                                <LeadStatusBadge status={item.leadStatusSnapshot} />
                                <span className="text-[11px] text-muted-foreground">
                                  {getHistoryAttemptLabel(item)}
                                </span>
                              </div>

                              <CrmFollowUpItemActions
                                item={item}
                                userId={userId}
                                onUpdated={onUpdated}
                              />
                            </div>

                            <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
                              <span>Programado: {scheduledFor ?? "Sin fecha"}</span>
                              <span>Actualizado: {updatedAt ?? "Sin fecha"}</span>
                            </div>

                            <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                              {item.message || "Sin mensaje almacenado."}
                            </p>

                            {item.errorReason && (
                              <div className="mt-2 rounded-md border border-rose-300 bg-rose-100 px-2 py-1">
                                <p className="text-[11px] font-medium text-rose-700">Error</p>
                                <p className="whitespace-pre-wrap text-xs text-rose-700">
                                  {item.errorReason}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {hasActions && (
                  <div className="flex gap-2 border-t pt-3">
                    {canReactivate && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        disabled={pendingAction !== null}
                        onClick={() => setConfirmAction("reactivate")}
                      >
                        <RefreshCcw className="h-3.5 w-3.5 text-emerald-500" />
                        Reactivar follow-up
                      </Button>
                    )}

                    {canCancel && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        disabled={pendingAction !== null}
                        onClick={() => setConfirmAction("cancel")}
                      >
                        <XCircle className="h-3.5 w-3.5 text-rose-500" />
                        Cancelar follow-up
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <TooltipContent side="bottom" align="start" className="p-2 space-y-1.5 max-w-[220px]">
          <p className="text-xs font-semibold">Follow-up IA</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            {summary.pending > 0 && (
              <>
                <span className="text-muted-foreground">Pendientes</span>
                <span className="font-medium">{summary.pending}</span>
              </>
            )}
            {summary.active > 0 && (
              <>
                <span className="text-muted-foreground">Activos</span>
                <span className="font-medium">{summary.active}</span>
              </>
            )}
            {summary.sent > 0 && (
              <>
                <span className="text-muted-foreground">Enviados</span>
                <span className="font-medium">{summary.sent}</span>
              </>
            )}
            {summary.failed > 0 && (
              <>
                <span className="text-muted-foreground">Fallidos</span>
                <span className="font-medium">{summary.failed}</span>
              </>
            )}
            {summary.cancelled > 0 && (
              <>
                <span className="text-muted-foreground">Cancelados</span>
                <span className="font-medium">{summary.cancelled}</span>
              </>
            )}
          </div>
          {formattedLatestDate && (
            <p className="text-[11px] text-muted-foreground border-t pt-1">
              Próximo: {formattedLatestDate}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>

    <CrmConfirmActionDialog
      open={confirmAction !== null}
      onOpenChange={(open) => {
        if (!open) setConfirmAction(null);
      }}
      title={
        confirmAction === "cancel"
          ? "Cancelar follow-up"
          : "Reactivar follow-up"
      }
      description={
        confirmAction === "cancel"
          ? "Los follow-ups pendientes o en proceso de este lead pasaran a estado cancelado."
          : "Los follow-ups de este lead se reprogramaran usando las reglas actuales."
      }
      confirmLabel={
        confirmAction === "cancel" ? "Cancelar follow-up" : "Reactivar follow-up"
      }
      tone={confirmAction === "cancel" ? "destructive" : "default"}
      onConfirm={async () => {
        if (!confirmAction) return;
        await handleAction(confirmAction);
      }}
    />
    </>
  );
}
