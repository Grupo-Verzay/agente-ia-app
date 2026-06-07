"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Users, DollarSign, Clock, Plus, ChevronDown, ChevronRight, Check, X } from "lucide-react";
import { MetricCard } from "@/components/custom/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  createAffiliateProfileAction,
  updateCommissionStatusAction,
  getAffiliateDetailAction,
} from "@/actions/affiliate-actions";

type Affiliate = {
  id: string; code: string; commissionRate: number; notes: string | null;
  user: { name: string | null; email: string; company: string };
  totalReferrals: number; pendingAmount: number; totalEarned: number;
};
type EligibleUser = { id: string; name: string | null; email: string; company: string };

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente", approved: "Aprobada", paid: "Pagada", rejected: "Rechazada",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B", approved: "#3B82F6", paid: "#10B981", rejected: "#EF4444",
};

function fmt(n: number, currency = "USD") {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

export function AffiliateManager({
  affiliates: initialAffiliates,
  eligibleUsers,
}: {
  affiliates: Affiliate[];
  eligibleUsers: EligibleUser[];
}) {
  const [affiliates, setAffiliates] = useState(initialAffiliates);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getAffiliateDetailAction>>["data"] | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createUserId, setCreateUserId] = useState("");
  const [createRate, setCreateRate] = useState("20");
  const [creating, setCreating] = useState(false);

  const totalPending = affiliates.reduce((s, a) => s + a.pendingAmount, 0);
  const totalEarned = affiliates.reduce((s, a) => s + a.totalEarned, 0);
  const totalReferrals = affiliates.reduce((s, a) => s + a.totalReferrals, 0);

  const handleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(id);
    setDetail(null);
    setLoadingDetail(true);
    const res = await getAffiliateDetailAction(id);
    setLoadingDetail(false);
    if (res.success) setDetail(res.data);
  };

  const handleCreate = async () => {
    if (!createUserId) { toast.error("Selecciona un usuario."); return; }
    setCreating(true);
    const res = await createAffiliateProfileAction({
      userId: createUserId,
      commissionRate: parseFloat(createRate) / 100,
    });
    setCreating(false);
    if (!res.success) { toast.error(res.message); return; }
    toast.success(`Perfil creado. Código: ${res.data.code}`);
    setShowCreate(false);
    window.location.reload();
  };

  const handleStatusChange = async (commissionId: string, status: "approved" | "paid" | "rejected") => {
    const res = await updateCommissionStatusAction({ commissionId, status });
    if (!res.success) { toast.error(res.message); return; }
    toast.success("Estado actualizado.");
    if (expandedId) await handleExpand(expandedId);
  };

  const usersWithoutProfile = eligibleUsers.filter(
    (u) => !affiliates.some((a) => a.user.email === u.email)
  );

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-3 sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold sm:text-xl">Gestión de Afiliados</h1>
            <p className="text-xs text-muted-foreground">{affiliates.length} afiliado(s) registrado(s)</p>
          </div>
          {usersWithoutProfile.length > 0 && (
            <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
              <Plus className="mr-1 h-4 w-4" /> Nuevo perfil
            </Button>
          )}
        </div>

        {/* Métricas globales */}
        <div className="grid grid-cols-3 gap-2">
          <MetricCard icon={<Users className="h-3.5 w-3.5" />} label="Total referidos" value={totalReferrals} color="#3B82F6" />
          <MetricCard icon={<Clock className="h-3.5 w-3.5" />} label="Por pagar" value={fmt(totalPending)} color="#F59E0B" />
          <MetricCard icon={<DollarSign className="h-3.5 w-3.5" />} label="Total pagado" value={fmt(totalEarned)} color="#10B981" />
        </div>

        {/* Formulario crear perfil */}
        {showCreate && (
          <Card className="border-dashed">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Crear perfil de afiliado</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div>
                <Label className="text-xs">Usuario (role=affiliate)</Label>
                <select
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  value={createUserId}
                  onChange={(e) => setCreateUserId(e.target.value)}
                >
                  <option value="">Selecciona un usuario...</option>
                  {usersWithoutProfile.map((u) => (
                    <option key={u.id} value={u.id}>{u.name ?? u.company} — {u.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Tasa de comisión (%)</Label>
                <Input type="number" min="1" max="100" value={createRate} onChange={(e) => setCreateRate(e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreate} disabled={creating}>{creating ? "Creando..." : "Crear"}</Button>
                <Button size="sm" variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lista de afiliados */}
        <div className="flex flex-col gap-2">
          {affiliates.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No hay afiliados registrados.</p>
          )}
          {affiliates.map((a) => (
            <Card key={a.id} className="overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/30 transition-colors"
                onClick={() => handleExpand(a.id)}
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{a.user.name ?? a.user.company}</p>
                  <p className="text-xs text-muted-foreground truncate">Código: <span className="font-mono font-semibold">{a.code}</span> · {(a.commissionRate * 100).toFixed(0)}% comisión</p>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-2">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-muted-foreground">{a.totalReferrals} referido(s)</p>
                    <p className="text-xs font-medium text-amber-600">{fmt(a.pendingAmount)} pendiente</p>
                  </div>
                  {expandedId === a.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
              </button>

              {expandedId === a.id && (
                <div className="border-t px-4 pb-4 pt-3">
                  {loadingDetail && <p className="py-4 text-center text-xs text-muted-foreground">Cargando...</p>}
                  {detail && (
                    <div className="flex flex-col gap-4">
                      {/* Comisiones */}
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Comisiones</p>
                        {detail.commissions.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sin comisiones aún.</p>
                        ) : (
                          <div className="divide-y rounded-md border text-xs overflow-hidden">
                            {detail.commissions.map((c) => (
                              <div key={c.id} className="flex items-center justify-between px-3 py-2 gap-2">
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{c.referredUserName ?? "—"}</p>
                                  <p className="text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("es-CO")}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-semibold">{fmt(c.amount, c.currencyCode)}</span>
                                  <Badge style={{ backgroundColor: `${STATUS_COLORS[c.status]}22`, color: STATUS_COLORS[c.status], borderColor: `${STATUS_COLORS[c.status]}44` }} variant="outline" className="text-[10px]">
                                    {STATUS_LABELS[c.status] ?? c.status}
                                  </Badge>
                                  {c.status === "pending" && (
                                    <div className="flex gap-1">
                                      <button type="button" onClick={() => handleStatusChange(c.id, "approved")} className="rounded p-0.5 hover:bg-blue-50 text-blue-600" title="Aprobar"><Check className="h-3.5 w-3.5" /></button>
                                      <button type="button" onClick={() => handleStatusChange(c.id, "rejected")} className="rounded p-0.5 hover:bg-red-50 text-red-500" title="Rechazar"><X className="h-3.5 w-3.5" /></button>
                                    </div>
                                  )}
                                  {c.status === "approved" && (
                                    <button type="button" onClick={() => handleStatusChange(c.id, "paid")} className="rounded px-1.5 py-0.5 text-[10px] bg-green-100 text-green-700 hover:bg-green-200" title="Marcar como pagada">Pagar</button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Referidos */}
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Referidos ({detail.referrals.length})</p>
                        {detail.referrals.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sin referidos aún.</p>
                        ) : (
                          <div className="divide-y rounded-md border text-xs overflow-hidden">
                            {detail.referrals.map((r) => (
                              <div key={r.id} className="flex items-center justify-between px-3 py-2">
                                <div>
                                  <p className="font-medium">{r.referredUser.name ?? r.referredUser.company}</p>
                                  <p className="text-muted-foreground">{r.referredUser.email}</p>
                                </div>
                                <p className="text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("es-CO")}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
