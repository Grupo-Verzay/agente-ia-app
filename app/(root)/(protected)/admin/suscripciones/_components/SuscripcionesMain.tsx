"use client";

import { useCallback, useEffect, useState } from "react";
import { SubscriptionStatus } from "@prisma/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle, XCircle, ExternalLink, ImageIcon } from "lucide-react";
import {
  getAllSubscriptionsAdmin,
  approveSubscription,
  rejectSubscription,
  type UserSubscriptionWithPlan,
} from "@/actions/user-subscription-actions";
import { PLAN_LABELS } from "@/types/plans";
import { Plan } from "@prisma/client";

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  PENDING_PAYMENT: "Pendiente pago",
  PENDING_APPROVAL: "Pendiente aprobación",
  ACTIVE: "Activo",
  EXPIRED: "Expirado",
  CANCELLED: "Cancelado",
  REJECTED: "Rechazado",
};

const STATUS_COLORS: Record<SubscriptionStatus, string> = {
  PENDING_PAYMENT: "bg-yellow-100 text-yellow-800",
  PENDING_APPROVAL: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  EXPIRED: "bg-gray-100 text-gray-700",
  CANCELLED: "bg-gray-100 text-gray-700",
  REJECTED: "bg-red-100 text-red-800",
};

const FILTER_OPTIONS: { label: string; value: SubscriptionStatus | "ALL" }[] = [
  { label: "Todos", value: "ALL" },
  { label: "Pendiente aprobación", value: "PENDING_APPROVAL" },
  { label: "Activos", value: "ACTIVE" },
  { label: "Rechazados", value: "REJECTED" },
  { label: "Expirados", value: "EXPIRED" },
];

type ApproveForm = { startDate: string; expiresAt: string; adminNotes: string };
type RejectForm = { reason: string };

export function SuscripcionesMain() {
  const [subs, setSubs] = useState<UserSubscriptionWithPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SubscriptionStatus | "ALL">("PENDING_APPROVAL");
  const [approveTarget, setApproveTarget] = useState<UserSubscriptionWithPlan | null>(null);
  const [rejectTarget, setRejectTarget] = useState<UserSubscriptionWithPlan | null>(null);
  const [approveForm, setApproveForm] = useState<ApproveForm>({ startDate: "", expiresAt: "", adminNotes: "" });
  const [rejectForm, setRejectForm] = useState<RejectForm>({ reason: "" });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllSubscriptionsAdmin(
        filter === "ALL" ? {} : { status: filter }
      );
      if (res.success) setSubs(res.data as UserSubscriptionWithPlan[]);
    } catch (e) {
      console.error("Error cargando suscripciones:", e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void fetchSubs(); }, [fetchSubs]);

  const openApprove = (sub: UserSubscriptionWithPlan) => {
    const start = new Date();
    const expires = new Date();
    expires.setMonth(expires.getMonth() + 1);
    setApproveForm({
      startDate: start.toISOString().slice(0, 10),
      expiresAt: expires.toISOString().slice(0, 10),
      adminNotes: "",
    });
    setApproveTarget(sub);
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    setActionLoading(true);
    const res = await approveSubscription(approveTarget.id, {
      startDate: new Date(approveForm.startDate),
      expiresAt: new Date(approveForm.expiresAt),
      adminNotes: approveForm.adminNotes,
    });
    if (res.success) {
      toast.success(res.message);
      setApproveTarget(null);
      void fetchSubs();
    } else {
      toast.error(res.message);
    }
    setActionLoading(false);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setActionLoading(true);
    const res = await rejectSubscription(rejectTarget.id, rejectForm.reason);
    if (res.success) {
      toast.success(res.message);
      setRejectTarget(null);
      void fetchSubs();
    } else {
      toast.error(res.message);
    }
    setActionLoading(false);
  };

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <div>
        <h2 className="text-lg font-semibold">Suscripciones</h2>
        <p className="text-xs text-muted-foreground">
          Revisa y aprueba los pagos manuales pendientes.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === opt.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
        </div>
      ) : subs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay suscripciones para mostrar.</p>
      ) : (
        <div className="space-y-3">
          {subs.map((sub) => (
            <Card key={sub.id} className="border-border">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">
                        {sub.user.name || sub.user.email}
                      </span>
                      <span className="text-xs text-muted-foreground">{sub.user.email}</span>
                      <Badge className={`text-[10px] ${STATUS_COLORS[sub.status]}`}>
                        {STATUS_LABELS[sub.status]}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>
                        Plan: <strong className="text-foreground">
                          {PLAN_LABELS[sub.subscriptionPlan.plan as Plan]} ({sub.subscriptionPlan.assistanceType})
                        </strong>
                      </span>
                      <span>
                        Método: <strong className="text-foreground">{sub.paymentMethod ?? "—"}</strong>
                      </span>
                      <span>
                        Monto: <strong className="text-foreground">${sub.amountUSD} USD</strong>
                      </span>
                      <span>
                        Fecha: {new Date(sub.createdAt).toLocaleDateString("es-CO")}
                      </span>
                    </div>
                    {sub.expiresAt && (
                      <p className="text-xs text-muted-foreground">
                        Vence: {new Date(sub.expiresAt).toLocaleDateString("es-CO")}
                      </p>
                    )}
                    {sub.adminNotes && (
                      <p className="text-xs text-muted-foreground italic">{sub.adminNotes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {sub.receiptUrl && (
                      <a
                        href={sub.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary underline"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        Comprobante
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {sub.status === "PENDING_APPROVAL" && (
                      <>
                        <Button size="sm" variant="outline" className="gap-1 text-green-600 border-green-300" onClick={() => openApprove(sub)}>
                          <CheckCircle className="h-3.5 w-3.5" /> Aprobar
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 text-red-600 border-red-300" onClick={() => { setRejectForm({ reason: "" }); setRejectTarget(sub); }}>
                          <XCircle className="h-3.5 w-3.5" /> Rechazar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal aprobar */}
      <Dialog open={!!approveTarget} onOpenChange={() => setApproveTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Aprobar suscripción</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Fecha inicio</Label>
              <Input type="date" value={approveForm.startDate} onChange={(e) => setApproveForm({ ...approveForm, startDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Fecha vencimiento</Label>
              <Input type="date" value={approveForm.expiresAt} onChange={(e) => setApproveForm({ ...approveForm, expiresAt: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Notas admin (opcional)</Label>
              <Textarea rows={2} value={approveForm.adminNotes} onChange={(e) => setApproveForm({ ...approveForm, adminNotes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Cancelar</Button>
            <Button onClick={handleApprove} disabled={actionLoading} className="bg-green-600 hover:bg-green-700 text-white">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal rechazar */}
      <Dialog open={!!rejectTarget} onOpenChange={() => setRejectTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rechazar suscripción</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Motivo del rechazo</Label>
              <Textarea rows={3} value={rejectForm.reason} onChange={(e) => setRejectForm({ reason: e.target.value })} placeholder="El comprobante no coincide con el monto..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancelar</Button>
            <Button onClick={handleReject} disabled={actionLoading || !rejectForm.reason} variant="destructive">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Rechazar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
