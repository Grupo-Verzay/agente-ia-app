"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plan } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2, Users, FlaskConical, Plus, Clock, Package } from "lucide-react";
import {
  getMyResellerDashboard,
  getMyResellerClients,
  getMyResellerDemos,
  createDemoAccount,
  createClientAccount,
} from "@/actions/reseller-license-actions";
import { PLAN_LABELS } from "@/types/plans";

type TabType = "clientes" | "demos";

type DemoItem = {
  id: string;
  name: string | null;
  email: string;
  company: string;
  demoExpiresAt: Date | null;
  demoCredits: number;
  createdAt: Date;
  iaCredits: { total: number; used: number } | null;
};

type ClientItem = {
  id: string;
  name: string | null;
  email: string;
  company: string;
  plan: Plan;
  status: boolean;
  createdAt: Date;
  billing: { billingStatus: string; dueDate: Date | null } | null;
};

type Pool = {
  id: string;
  subscriptionPlanId: string;
  plan: Plan;
  assistanceType: string;
  credits: number;
  totalLicenses: number;
  usedLicenses: number;
  availableLicenses: number;
};

type Dashboard = {
  demoLimit: number;
  demosUsed: number;
  demosAvailable: number;
  pools: Pool[];
};

export function MisClientesMain() {
  const [tab, setTab] = useState<TabType>("clientes");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [demos, setDemos] = useState<DemoItem[]>([]);
  const [loading, setLoading] = useState(true);

  // dialogs
  const [demoDialog, setDemoDialog] = useState(false);
  const [clientDialog, setClientDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  const [demoForm, setDemoForm] = useState({ name: "", email: "", company: "", password: "" });
  const [clientForm, setClientForm] = useState({ name: "", email: "", company: "", password: "", subscriptionPlanId: "", plan: "" as Plan | "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, clientsRes, demosRes] = await Promise.all([
        getMyResellerDashboard(),
        getMyResellerClients(),
        getMyResellerDemos(),
      ]);
      if (dashRes.success && dashRes.data) setDashboard(dashRes.data);
      if (clientsRes.success) setClients(clientsRes.data as ClientItem[]);
      if (demosRes.success) setDemos(demosRes.data as DemoItem[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreateDemo = async () => {
    if (!demoForm.name || !demoForm.email || !demoForm.password) {
      toast.error("Nombre, email y contraseña son requeridos");
      return;
    }
    setSaving(true);
    const res = await createDemoAccount(demoForm);
    setSaving(false);
    if (res.success) {
      toast.success(res.message);
      setDemoDialog(false);
      setDemoForm({ name: "", email: "", company: "", password: "" });
      void load();
    } else {
      toast.error(res.message);
    }
  };

  const handleCreateClient = async () => {
    if (!clientForm.name || !clientForm.email || !clientForm.password || !clientForm.subscriptionPlanId) {
      toast.error("Todos los campos son requeridos");
      return;
    }
    setSaving(true);
    const res = await createClientAccount({
      name: clientForm.name,
      email: clientForm.email,
      company: clientForm.company,
      password: clientForm.password,
      subscriptionPlanId: clientForm.subscriptionPlanId,
      plan: clientForm.plan as Plan,
    });
    setSaving(false);
    if (res.success) {
      toast.success(res.message);
      setClientDialog(false);
      setClientForm({ name: "", email: "", company: "", password: "", subscriptionPlanId: "", plan: "" });
      void load();
    } else {
      toast.error(res.message);
    }
  };

  const daysLeft = (expires: Date | null) => {
    if (!expires) return null;
    const diff = Math.ceil((new Date(expires).getTime() - Date.now()) / 86400000);
    return diff;
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-muted/60 border-b border-border/40 px-4 pt-4 pb-3 shrink-0 flex items-center justify-between gap-4">
        <div className="flex gap-1 rounded-lg border border-border overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => setTab("clientes")}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium transition-colors ${tab === "clientes" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Users className="h-3.5 w-3.5" />
            Mis clientes
          </button>
          <button
            type="button"
            onClick={() => setTab("demos")}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium transition-colors ${tab === "demos" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Demos
            {dashboard && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-1">
                {dashboard.demosUsed}/{dashboard.demoLimit}
              </Badge>
            )}
          </button>
        </div>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => tab === "demos" ? setDemoDialog(true) : setClientDialog(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          {tab === "demos" ? "Nueva demo" : "Nuevo cliente"}
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Stats de licencias */}
            {dashboard && dashboard.pools.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {dashboard.pools.map(pool => (
                  <div key={pool.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-foreground">{PLAN_LABELS[pool.plan]}</p>
                      <Badge variant={pool.availableLicenses > 0 ? "outline" : "secondary"} className="text-[10px]">
                        {pool.availableLicenses > 0 ? `${pool.availableLicenses} disp.` : "Sin cupo"}
                      </Badge>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.min(100, (pool.usedLicenses / pool.totalLicenses) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {pool.usedLicenses}/{pool.totalLicenses} usadas · {pool.credits.toLocaleString()} créditos c/u
                    </p>
                  </div>
                ))}
              </div>
            )}

            {dashboard && dashboard.pools.length === 0 && tab === "clientes" && (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">Sin licencias asignadas</p>
                <p className="text-xs mt-1">Contacta al administrador para que te asigne licencias y puedas crear cuentas de clientes.</p>
              </div>
            )}

            {/* ── CLIENTES ── */}
            {tab === "clientes" && (
              <div className="space-y-2">
                {clients.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
                    <p className="text-sm font-medium">Sin clientes activos</p>
                    <p className="text-xs mt-1">Crea la primera cuenta para un cliente.</p>
                  </div>
                ) : (
                  clients.map(c => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.name ?? c.email}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.email} · {c.company}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px]">{PLAN_LABELS[c.plan]}</Badge>
                        <Badge variant={c.status ? "default" : "secondary"} className="text-[10px]">
                          {c.status ? "Activo" : "Inactivo"}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── DEMOS ── */}
            {tab === "demos" && (
              <div className="space-y-2">
                {demos.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
                    <FlaskConical className="h-8 w-8 mx-auto mb-3 opacity-40" />
                    <p className="text-sm font-medium">Sin demos creadas</p>
                    <p className="text-xs mt-1">Puedes crear hasta {dashboard?.demoLimit ?? 3} demos de 7 días cada una.</p>
                  </div>
                ) : (
                  demos.map(d => {
                    const days = daysLeft(d.demoExpiresAt);
                    const expired = days !== null && days <= 0;
                    const creditsLeft = d.iaCredits ? d.iaCredits.total - d.iaCredits.used : d.demoCredits;
                    return (
                      <div key={d.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{d.name ?? d.email}</p>
                          <p className="text-xs text-muted-foreground truncate">{d.email} · {d.company}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">{creditsLeft.toLocaleString()} créd.</span>
                          {days !== null && (
                            <Badge
                              variant={expired ? "secondary" : days <= 2 ? "destructive" : "outline"}
                              className="text-[10px] gap-1"
                            >
                              <Clock className="h-2.5 w-2.5" />
                              {expired ? "Vencida" : `${days}d`}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Dialog: nueva demo */}
      <Dialog open={demoDialog} onOpenChange={setDemoDialog}>
        <DialogContent className="flex h-[585px] max-w-sm flex-col">
          <DialogHeader>
            <DialogTitle>Nueva cuenta demo</DialogTitle>
            <p className="text-xs text-muted-foreground">7 días · 1,000 créditos · Plan Lite</p>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto py-2">
            <div className="space-y-1">
              <Label>Nombre del prospecto</Label>
              <Input value={demoForm.name} onChange={e => setDemoForm({ ...demoForm, name: e.target.value })} placeholder="Juan Pérez" />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={demoForm.email} onChange={e => setDemoForm({ ...demoForm, email: e.target.value })} placeholder="juan@empresa.com" />
            </div>
            <div className="space-y-1">
              <Label>Empresa</Label>
              <Input value={demoForm.company} onChange={e => setDemoForm({ ...demoForm, company: e.target.value })} placeholder="Empresa Demo" />
            </div>
            <div className="space-y-1">
              <Label>Contraseña temporal</Label>
              <Input type="text" value={demoForm.password} onChange={e => setDemoForm({ ...demoForm, password: e.target.value })} placeholder="Ej: Demo2024!" />
              <p className="text-[11px] text-muted-foreground">Comparte esta contraseña con el prospecto para que pueda acceder.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDemoDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateDemo} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear demo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: nuevo cliente */}
      <Dialog open={clientDialog} onOpenChange={setClientDialog}>
        <DialogContent className="flex h-[585px] max-w-sm flex-col">
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
            <p className="text-xs text-muted-foreground">Consume una licencia de tu pool disponible.</p>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto py-2">
            <div className="space-y-1">
              <Label>Plan</Label>
              <Select
                value={clientForm.subscriptionPlanId}
                onValueChange={v => {
                  const pool = dashboard?.pools.find(p => p.subscriptionPlanId === v);
                  setClientForm({ ...clientForm, subscriptionPlanId: v, plan: pool?.plan ?? "" });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un plan..." />
                </SelectTrigger>
                <SelectContent>
                  {dashboard?.pools.filter(p => p.availableLicenses > 0).map(pool => (
                    <SelectItem key={pool.subscriptionPlanId} value={pool.subscriptionPlanId}>
                      {PLAN_LABELS[pool.plan]} · {pool.availableLicenses} disp. · {pool.credits.toLocaleString()} créditos
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {dashboard?.pools.every(p => p.availableLicenses === 0) && (
                <p className="text-[11px] text-destructive">Sin licencias disponibles. Contacta al administrador.</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Nombre del cliente</Label>
              <Input value={clientForm.name} onChange={e => setClientForm({ ...clientForm, name: e.target.value })} placeholder="María González" />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={clientForm.email} onChange={e => setClientForm({ ...clientForm, email: e.target.value })} placeholder="maria@empresa.com" />
            </div>
            <div className="space-y-1">
              <Label>Empresa</Label>
              <Input value={clientForm.company} onChange={e => setClientForm({ ...clientForm, company: e.target.value })} placeholder="Nombre de la empresa" />
            </div>
            <div className="space-y-1">
              <Label>Contraseña</Label>
              <Input type="text" value={clientForm.password} onChange={e => setClientForm({ ...clientForm, password: e.target.value })} placeholder="Contraseña inicial" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClientDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateClient} disabled={saving || !clientForm.subscriptionPlanId}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
