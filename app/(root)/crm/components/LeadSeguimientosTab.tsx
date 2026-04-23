"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCcw, Trash2, XCircle } from "lucide-react";

import {
  cancelSessionCrmFollowUps,
  getSessionCrmFollowUps,
  retrySessionReactivatableCrmFollowUps,
  type SessionFollowUpItem,
} from "@/actions/crm-follow-up-actions";
import {
  getSessionLegacySeguimientos,
  deleteSeguimientoById,
  deleteAllSeguimientosByRemoteJid,
  type LegacySeguimientoItem,
} from "@/actions/seguimientos-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { CrmConfirmActionDialog } from "../dashboard/components/CrmConfirmActionDialog";
import { CrmFollowUpItemActions } from "../dashboard/components/CrmFollowUpItemActions";
import { LeadStatusBadge } from "../dashboard/components/records-table/LeadStatusBadge";
import type { SessionCrmFollowUpHistoryItem } from "@/types/session";
import { toast } from "sonner";

/* ===== STATUS LABELS & STYLES ===== */

const CRM_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  PROCESSING: "Procesando",
  SENT: "Enviado",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
  SKIPPED: "Omitido",
};

const CRM_STATUS_CLASSES: Record<string, string> = {
  PENDING: "border-amber-300 bg-amber-100 text-amber-800",
  PROCESSING: "border-blue-300 bg-blue-100 text-blue-800",
  SENT: "border-emerald-300 bg-emerald-100 text-emerald-800",
  FAILED: "border-rose-300 bg-rose-100 text-rose-800",
  CANCELLED: "border-slate-300 bg-slate-200 text-slate-700",
  SKIPPED: "border-violet-300 bg-violet-100 text-violet-800",
};

const LEGACY_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  sent: "Enviado",
  failed: "Fallido",
  cancelled: "Cancelado",
  processing: "Procesando",
};

const LEGACY_STATUS_CLASSES: Record<string, string> = {
  pending: "border-amber-300 bg-amber-100 text-amber-800",
  sent: "border-emerald-300 bg-emerald-100 text-emerald-800",
  failed: "border-rose-300 bg-rose-100 text-rose-800",
  cancelled: "border-slate-300 bg-slate-200 text-slate-700",
  processing: "border-blue-300 bg-blue-100 text-blue-800",
};

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function toHistoryItem(item: SessionFollowUpItem): SessionCrmFollowUpHistoryItem {
  return {
    id: item.id,
    status: item.status,
    leadStatusSnapshot: item.leadStatusSnapshot,
    attemptCount: item.attemptCount,
    message: item.generatedMessage,
    errorReason: item.errorReason,
    scheduledFor: item.scheduledFor,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/* ===== SECCIÓN FLUJOS (LEGACY) ===== */

function LegacySeguimientoCard({
  item,
  onDeleted,
}: {
  item: LegacySeguimientoItem;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const statusLabel = LEGACY_STATUS_LABELS[item.followUpStatus] ?? item.followUpStatus;
  const statusClass = LEGACY_STATUS_CLASSES[item.followUpStatus] ?? "border-slate-200 bg-slate-50 text-slate-600";

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteSeguimientoById(item.id);
    if (result.success) {
      toast.success(result.message);
      onDeleted();
    } else {
      toast.error(result.message);
    }
    setDeleting(false);
  };

  return (
    <div className="rounded-md border border-border/70 bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={statusClass}>
            {statusLabel}
          </Badge>
          {item.tipo && (
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600 text-[11px]">
              {item.tipo}
            </Badge>
          )}
          <span className="text-[11px] text-muted-foreground">
            Intento {item.followUpAttempt} / {item.followUpMaxAttempts}
          </span>
          <span className="text-[11px] text-muted-foreground capitalize">
            • Modo: {item.followUpMode}
          </span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          disabled={deleting}
          onClick={handleDelete}
          title="Eliminar seguimiento"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {item.followUpGoal && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          <span className="font-medium">Objetivo:</span> {item.followUpGoal}
        </p>
      )}

      <div className="mt-2 grid gap-0.5 text-[11px] text-muted-foreground">
        {item.time && <span>Programado: {item.time}</span>}
        <span>Instancia: {item.instancia ?? "N/A"}</span>
        <span>Creado: {formatDate(item.createdAt)}</span>
      </div>

      {(item.generatedMessage || item.mensaje) && (
        <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
          {item.generatedMessage || item.mensaje}
        </p>
      )}

      {item.errorReason && (
        <div className="mt-2 rounded-md border border-rose-300 bg-rose-100 px-2 py-1.5">
          <p className="text-[11px] font-medium text-rose-700">Error</p>
          <p className="whitespace-pre-wrap text-xs text-rose-700">{item.errorReason}</p>
        </div>
      )}
    </div>
  );
}

/* ===== SECCIÓN IA CRM ===== */

function CrmFollowUpCard({
  item,
  userId,
  onUpdated,
}: {
  item: SessionFollowUpItem;
  userId: string;
  onUpdated: () => void;
}) {
  const historyItem = toHistoryItem(item);
  return (
    <div className="rounded-md border border-border/70 bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className={CRM_STATUS_CLASSES[item.status] ?? "border-slate-200 bg-slate-50 text-slate-600"}
          >
            {CRM_STATUS_LABELS[item.status] ?? item.status}
          </Badge>
          <LeadStatusBadge status={item.leadStatusSnapshot} />
          <span className="text-[11px] text-muted-foreground">
            {item.attemptCount === 0 && item.status === "PENDING"
              ? "Aún no ejecutado"
              : `Intento ${Math.max(item.attemptCount, 1)} / ${item.maxAttempts}`}
          </span>
        </div>
        <CrmFollowUpItemActions item={historyItem} userId={userId} onUpdated={onUpdated} />
      </div>

      {item.goalSnapshot && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          <span className="font-medium">Objetivo:</span> {item.goalSnapshot}
        </p>
      )}

      <div className="mt-2 grid gap-0.5 text-[11px] text-muted-foreground">
        <span>Programado: {formatDate(item.scheduledFor) ?? "Sin fecha"}</span>
        {item.sentAt && <span>Enviado: {formatDate(item.sentAt)}</span>}
        {item.cancelledAt && <span>Cancelado: {formatDate(item.cancelledAt)}</span>}
        <span>Creado: {formatDate(item.createdAt)}</span>
      </div>

      {item.generatedMessage && (
        <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
          {item.generatedMessage}
        </p>
      )}

      {item.errorReason && (
        <div className="mt-2 rounded-md border border-rose-300 bg-rose-100 px-2 py-1.5">
          <p className="text-[11px] font-medium text-rose-700">Error</p>
          <p className="whitespace-pre-wrap text-xs text-rose-700">{item.errorReason}</p>
        </div>
      )}
    </div>
  );
}

/* ===== COMPONENTE PRINCIPAL ===== */

export function LeadSeguimientosTab({
  sessionId,
  userId,
  remoteJid,
  instanceId,
  mode = "all",
}: {
  sessionId: number;
  userId: string;
  remoteJid: string;
  instanceId: string | null;
  mode?: "all" | "legacy" | "crm";
}) {
  const [crmItems, setCrmItems] = useState<SessionFollowUpItem[]>([]);
  const [legacyItems, setLegacyItems] = useState<LegacySeguimientoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<"cancel" | "reactivate" | "deleteAllLegacy" | null>(null);
  const [pendingAction, setPendingAction] = useState<"cancel" | "reactivate" | "deleteAllLegacy" | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [crmResult, legacyResult] = await Promise.all([
      getSessionCrmFollowUps(sessionId, userId),
      getSessionLegacySeguimientos(remoteJid),
    ]);
    if (crmResult.success && crmResult.data) setCrmItems(crmResult.data);
    if (legacyResult.success && legacyResult.data) setLegacyItems(legacyResult.data);
    setLoading(false);
  }, [sessionId, userId, remoteJid]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const activeCount = crmItems.filter((i) => i.status === "PENDING" || i.status === "PROCESSING").length;
  const reactivatableCount = crmItems.filter((i) =>
    ["FAILED", "SENT", "CANCELLED", "SKIPPED"].includes(i.status)
  ).length;

  const canCancel = Boolean(instanceId) && activeCount > 0;
  const canReactivate = Boolean(instanceId) && reactivatableCount > 0;

  const showLegacy = mode === "all" || mode === "legacy";
  const showCrm = mode === "all" || mode === "crm";

  const handleBulkAction = async (action: "cancel" | "reactivate" | "deleteAllLegacy") => {
    const toastId = `seguimientos-bulk-${action}-${sessionId}`;

    if (action === "deleteAllLegacy") {
      toast.loading("Eliminando seguimientos de flujos...", { id: toastId });
      setPendingAction(action);
      try {
        const result = await deleteAllSeguimientosByRemoteJid(remoteJid);
        if (!result.success) throw new Error(result.message);
        await loadAll();
        toast.success(result.message, { id: toastId });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo eliminar.", { id: toastId });
      } finally {
        setPendingAction(null);
      }
      return;
    }

    if (!instanceId) return;
    toast.loading(action === "cancel" ? "Cancelando follow-ups IA..." : "Reactivando follow-ups IA...", { id: toastId });
    setPendingAction(action);
    try {
      const result =
        action === "cancel"
          ? await cancelSessionCrmFollowUps({ userId, remoteJid, instanceId })
          : await retrySessionReactivatableCrmFollowUps({ userId, remoteJid, instanceId });
      if (!result.success) throw new Error(result.message);
      await loadAll();
      toast.success(result.message, { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo completar la acción.", { id: toastId });
    } finally {
      setPendingAction(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-1">
        {[1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-24 w-full rounded-md" />
        ))}
      </div>
    );
  }

  const isEmpty =
    (showLegacy ? legacyItems.length === 0 : true) &&
    (showCrm ? crmItems.length === 0 : true);

  const hasLegacyActions = showLegacy && legacyItems.length > 0;
  const hasCrmActions = showCrm && (canReactivate || canCancel);
  const hasAnyBottomAction = hasLegacyActions || hasCrmActions;

  const bottomActions = hasAnyBottomAction ? (
    <div className="flex gap-2 border-t pt-3 mt-2">
      {hasLegacyActions && (
        <Button
          variant="outline"
          className="flex-1 text-sm text-destructive hover:text-destructive"
          disabled={pendingAction !== null}
          onClick={() => setConfirmAction("deleteAllLegacy")}
        >
          <Trash2 className="h-4 w-4" />
          Eliminar flujos
        </Button>
      )}
      {showCrm && canReactivate && (
        <Button
          variant="outline"
          className="flex-1 text-sm"
          disabled={pendingAction !== null}
          onClick={() => setConfirmAction("reactivate")}
        >
          <RefreshCcw className="h-4 w-4 text-emerald-500" />
          Reactivar todos
        </Button>
      )}
      {showCrm && canCancel && (
        <Button
          variant="outline"
          className="flex-1 text-sm"
          disabled={pendingAction !== null}
          onClick={() => setConfirmAction("cancel")}
        >
          <XCircle className="h-4 w-4 text-rose-500" />
          Cancelar activos
        </Button>
      )}
    </div>
  ) : null;

  return (
    <>
      <div className="flex flex-col h-full">
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col gap-4 pb-2">

            {isEmpty ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Este lead no tiene seguimientos registrados.
              </p>
            ) : (
              <>
                {/* ===== Seguimientos de Flujos ===== */}
                {showLegacy && (
                  <div className="flex flex-col gap-2">
                    {mode === "all" && (
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">Seguimientos de Flujos</p>
                        <Badge variant="outline" className="text-xs">{legacyItems.length}</Badge>
                        <span className="text-[11px] text-muted-foreground">
                          (pendientes: {legacyItems.filter((i) => i.followUpStatus === "pending").length})
                        </span>
                      </div>
                    )}
                    {legacyItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sin seguimientos de flujos.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {legacyItems.map((item) => (
                          <LegacySeguimientoCard key={item.id} item={item} onDeleted={loadAll} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {mode === "all" && showLegacy && showCrm && <Separator />}

                {/* ===== Follow-ups IA (CRM) ===== */}
                {showCrm && (
                  <div className="flex flex-col gap-2">
                    {mode === "all" && (
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">Follow-ups IA (CRM)</p>
                        <Badge variant="outline" className="text-xs">{crmItems.length}</Badge>
                        {activeCount > 0 && (
                          <span className="text-[11px] text-muted-foreground">(activos: {activeCount})</span>
                        )}
                      </div>
                    )}
                    {crmItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sin follow-ups de IA.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {crmItems.map((item) => (
                          <CrmFollowUpCard key={item.id} item={item} userId={userId} onUpdated={loadAll} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {!isEmpty && bottomActions}
      </div>

      <CrmConfirmActionDialog
        open={confirmAction !== null}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
        title={
          confirmAction === "deleteAllLegacy"
            ? "Eliminar seguimientos de flujos"
            : confirmAction === "cancel"
            ? "Cancelar follow-ups IA"
            : "Reactivar follow-ups IA"
        }
        description={
          confirmAction === "deleteAllLegacy"
            ? "Se eliminarán todos los seguimientos de flujos de este lead. Esta acción no se puede deshacer."
            : confirmAction === "cancel"
            ? "Los follow-ups IA pendientes o en proceso pasarán a estado cancelado."
            : "Los follow-ups IA se reprogramarán usando las reglas actuales del CRM."
        }
        confirmLabel={
          confirmAction === "deleteAllLegacy"
            ? "Eliminar todos"
            : confirmAction === "cancel"
            ? "Cancelar follow-ups"
            : "Reactivar follow-ups"
        }
        tone={confirmAction === "reactivate" ? "default" : "destructive"}
        onConfirm={async () => {
          if (!confirmAction) return;
          await handleBulkAction(confirmAction);
        }}
      />
    </>
  );
}
