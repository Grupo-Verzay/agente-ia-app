"use client";

import { useCallback, useEffect, useState } from "react";
import { Plan } from "@prisma/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Loader2, Star, ArrowLeft, Users, Store } from "lucide-react";
import {
  getAllSubscriptionPlans,
  upsertSubscriptionPlan,
  toggleSubscriptionPlanActive,
  type SubscriptionPlanItem,
} from "@/actions/subscription-plan-actions";
import { PLAN_LABELS, PLANS } from "@/types/plans";
import dynamic from "next/dynamic";
const PlanDetailTab = dynamic(() => import("./PlanDetailTab").then(m => m.PlanDetailTab), { ssr: false });

const ASSISTANCE_TYPES = ["IA", "HUMANO"] as const;
type BillingPeriod = "monthly" | "quarterly" | "yearly";

const defaultPrices: Record<Plan, Record<string, number>> = {
  lite:          { IA: 19, HUMANO: 29 },
  basico:        { IA: 39, HUMANO: 49 },
  intermedio:    { IA: 59, HUMANO: 99 },
  avanzado:      { IA: 79, HUMANO: 149 },
  enterprise:    { IA: 99, HUMANO: 199 },
  personalizado: { IA: 0,  HUMANO: 0 },
};

const defaultCredits: Record<Plan, Record<string, number>> = {
  lite:          { IA: 1000,  HUMANO: 3000 },
  basico:        { IA: 3000,  HUMANO: 5000 },
  intermedio:    { IA: 5000,  HUMANO: 12000 },
  avanzado:      { IA: 8000,  HUMANO: 20000 },
  enterprise:    { IA: 10000, HUMANO: 30000 },
  personalizado: { IA: 0,     HUMANO: 0 },
};

type EditForm = {
  plan: Plan;
  assistanceType: string;
  isResellerPlan: boolean;
  priceUSD: number;
  priceQuarterly: number;
  priceYearly: number;
  credits: number;
  features: string;
  description: string;
  isPopular: boolean;
  isActive: boolean;
  color: string;
  order: number;
  checkoutUrlMonthly: string;
  checkoutUrlQuarterly: string;
  checkoutUrlYearly: string;
};

export function PlanesMain() {
  const [audience, setAudience] = useState<"client" | "reseller" | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");

  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [dialogTab, setDialogTab] = useState<"config" | "detail">("config");
  const [dialogPlanId, setDialogPlanId] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllSubscriptionPlans();
      if (res.success) setPlans(res.data);
    } catch (e) {
      console.error("Error cargando planes:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchPlans(); }, [fetchPlans]);

  const isReseller = audience === "reseller";

  const getPlan = (plan: Plan, type: string) =>
    plans.find((p) => p.plan === plan && p.assistanceType === type && p.isResellerPlan === isReseller);

  const openEdit = (plan: Plan, type: string) => {
    const existing = getPlan(plan, type);
    setForm({
      plan,
      assistanceType: type,
      isResellerPlan: isReseller,
      priceUSD: existing?.priceUSD ?? defaultPrices[plan][type],
      priceQuarterly: existing?.priceQuarterly ?? 0,
      priceYearly: existing?.priceYearly ?? 0,
      credits: existing?.credits ?? defaultCredits[plan][type],
      features: existing?.features.join("\n") ?? "",
      description: existing?.description ?? "",
      isPopular: existing?.isPopular ?? false,
      isActive: existing?.isActive ?? true,
      color: existing?.color ?? "",
      order: existing?.order ?? PLANS.indexOf(plan),
      checkoutUrlMonthly: existing?.checkoutUrlMonthly ?? "",
      checkoutUrlQuarterly: existing?.checkoutUrlQuarterly ?? "",
      checkoutUrlYearly: existing?.checkoutUrlYearly ?? "",
    });
    setDialogPlanId(existing?.id ?? null);
    setDialogTab("config");
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    const res = await upsertSubscriptionPlan({
      ...form,
      features: form.features.split("\n").map((f) => f.trim()).filter(Boolean),
      description: form.description || undefined,
      color: form.color || undefined,
      priceQuarterly: form.priceQuarterly || null,
      priceYearly: form.priceYearly || null,
      checkoutUrlMonthly: form.checkoutUrlMonthly || undefined,
      checkoutUrlQuarterly: form.checkoutUrlQuarterly || undefined,
      checkoutUrlYearly: form.checkoutUrlYearly || undefined,
    });
    if (res.success) {
      toast.success(res.message);
      setEditOpen(false);
      void fetchPlans();
    } else {
      toast.error(res.message);
    }
    setSaving(false);
  };

  const handleToggle = async (id: string, current: boolean) => {
    const res = await toggleSubscriptionPlanActive(id, !current);
    if (res.success) void fetchPlans();
    else toast.error("Error al cambiar estado");
  };

  const handleSeedAll = async () => {
    setSaving(true);
    for (const plan of PLANS) {
      for (const type of ASSISTANCE_TYPES) {
        const existing = getPlan(plan, type);
        await upsertSubscriptionPlan({
          plan,
          assistanceType: type,
          priceUSD: existing?.priceUSD ?? defaultPrices[plan][type],
          credits: existing?.credits ?? defaultCredits[plan][type],
          features: existing?.features ?? [],
          description: existing?.description ?? undefined,
          isPopular: existing?.isPopular ?? false,
          isActive: existing?.isActive ?? true,
          color: existing?.color ?? undefined,
          order: existing?.order ?? PLANS.indexOf(plan),
        });
      }
    }
    toast.success("Planes inicializados");
    void fetchPlans();
    setSaving(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">

      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-muted/60 border-b border-border/40 px-4 pt-4 pb-3 shrink-0 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {audience !== null && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAudience(null)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
              title="Volver"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h2 className="text-lg font-semibold">Planes</h2>
            {audience === null && (
              <p className="text-sm text-muted-foreground">
                Configura los precios, créditos y características de los planes maestros.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {audience === "client" && plans.filter((p) => !p.isResellerPlan).length === 0 && !loading && (
            <Button size="sm" onClick={handleSeedAll} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Inicializar planes"}
            </Button>
          )}
          <Button
            variant={audience === "client" ? "default" : "outline"}
            size="sm"
            onClick={() => setAudience("client")}
            className="gap-2 text-xs h-8"
          >
            <Users className="h-3.5 w-3.5" />
            Clientes directos
          </Button>
          <Button
            variant={audience === "reseller" ? "default" : "outline"}
            size="sm"
            onClick={() => setAudience("reseller")}
            className="gap-2 text-xs h-8"
          >
            <Store className="h-3.5 w-3.5" />
            Resellers
          </Button>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {audience === null ? (
          <div className="flex flex-col justify-center min-h-[60vh]">
            <div className="w-full space-y-5 p-6">
              <div className="text-center space-y-1 mb-2">
                <h3 className="text-lg font-semibold">¿Qué planes deseas configurar?</h3>
                <p className="text-sm text-muted-foreground">Elige el tipo de planes a gestionar</p>
              </div>

              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5">
                  <Card
                    className="cursor-pointer group hover:border-primary/50 hover:shadow-lg transition-all duration-200 border-l-4 border-l-primary/40"
                    onClick={() => setAudience("client")}
                  >
                    <CardContent className="p-8 flex flex-col gap-5 h-full">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                          <Users className="h-7 w-7 text-primary" />
                        </div>
                        <h4 className="font-semibold text-lg leading-snug">Clientes directos</h4>
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Planes para usuarios finales que contratan el servicio directamente.
                        </p>
                        <ul className="space-y-2 pt-2">
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-primary font-bold mt-0.5 shrink-0">✓</span>
                            Asistencia IA y Humano en distintos rangos de precio
                          </li>
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-primary font-bold mt-0.5 shrink-0">✓</span>
                            Precios mensuales, trimestrales y anuales por plan
                          </li>
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-primary font-bold mt-0.5 shrink-0">✓</span>
                            Links de pago configurables por periodo
                          </li>
                        </ul>
                      </div>
                      <div className="flex items-center justify-between gap-4 pt-6 border-t border-border/50">
                        <p className="text-xs text-muted-foreground truncate">
                          {plans.filter((p) => !p.isResellerPlan && p.isActive).length} planes activos configurados
                        </p>
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary shrink-0 group-hover:gap-3 transition-all whitespace-nowrap">
                          <ArrowLeft className="h-4 w-4 rotate-180" />
                          Ver planes
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card
                    className="cursor-pointer group hover:border-violet-500/50 hover:shadow-lg transition-all duration-200 border-l-4 border-l-violet-500/40"
                    onClick={() => setAudience("reseller")}
                  >
                    <CardContent className="p-8 flex flex-col gap-5 h-full">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 group-hover:bg-violet-500/20 transition-colors">
                          <Store className="h-7 w-7 text-violet-600 dark:text-violet-400" />
                        </div>
                        <h4 className="font-semibold text-lg leading-snug">Resellers</h4>
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Packs para revendedores que distribuyen el servicio a sus propios clientes.
                        </p>
                        <ul className="space-y-2 pt-2">
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-violet-500 font-bold mt-0.5 shrink-0">✓</span>
                            Packs de 5, 10 y 25 usuarios por volumen
                          </li>
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-violet-500 font-bold mt-0.5 shrink-0">✓</span>
                            Precios especiales para distribuidores
                          </li>
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-violet-500 font-bold mt-0.5 shrink-0">✓</span>
                            Links de pago por pack configurables
                          </li>
                        </ul>
                      </div>
                      <div className="flex items-center justify-between gap-4 pt-6 border-t border-border/50">
                        <p className="text-xs text-muted-foreground truncate">
                          {plans.filter((p) => p.isResellerPlan && p.isActive).length} planes activos configurados
                        </p>
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 shrink-0 group-hover:gap-3 transition-all whitespace-nowrap">
                          <ArrowLeft className="h-4 w-4 rotate-180" />
                          Ver planes
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
              </div>
            ) : isReseller && plans.filter((p) => p.isResellerPlan).length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
                <p className="text-sm font-medium">No hay planes de Reseller configurados</p>
                <p className="text-xs max-w-xs">Haz clic en el ícono de editar en cualquier plan para configurar precios, créditos y links de pago para resellers.</p>
                <Button size="sm" variant="outline" onClick={() => openEdit(PLANS[0], "IA")}>
                  Configurar primer plan Reseller
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {ASSISTANCE_TYPES.map((type) => (
                  <div key={type}>
                    <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Asistencia {type}
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {PLANS.map((plan) => {
                        const p = getPlan(plan, type);
                        return (
                          <Card key={plan} className="relative border-border">
                            {p?.isPopular && (
                              <span className="absolute -top-2 left-3 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                                <Star className="h-2.5 w-2.5" /> Popular
                              </span>
                            )}
                            <CardHeader className="pb-2 pt-4">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-sm">{PLAN_LABELS[plan]}</CardTitle>
                                <div className="flex items-center gap-2">
                                  {p && (
                                    <Switch
                                      checked={p.isActive}
                                      onCheckedChange={() => void handleToggle(p.id, p.isActive)}
                                    />
                                  )}
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => openEdit(plan, type)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="pt-0 pb-3">
                              {p ? (
                                <div className="space-y-1">
                                  <div className="flex items-baseline gap-1">
                                    <span className="text-xl font-bold">${p.priceUSD}</span>
                                    <span className="text-xs text-muted-foreground">USD/mes</span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {p.credits.toLocaleString()} créditos
                                  </div>
                                  {!p.isActive && (
                                    <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground italic">Sin configurar</p>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="flex h-[585px] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle>
              {form ? `${PLAN_LABELS[form.plan]} · ${form.assistanceType} · ${form.isResellerPlan ? "Resellers" : "Clientes"}` : "Editar Plan"}
            </DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex shrink-0 rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setDialogTab("config")}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${dialogTab === "config" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              Configuración
            </button>
            <button
              type="button"
              onClick={() => setDialogTab("detail")}
              disabled={!dialogPlanId}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${dialogTab === "detail" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              title={!dialogPlanId ? "Guarda primero el plan para editar el detalle" : undefined}
            >
              Página de detalle
            </button>
          </div>

          {form && dialogTab === "config" && (
            <div className="flex-1 space-y-4 overflow-y-auto py-2 pr-1">

              <div className="flex rounded-lg border border-border overflow-hidden">
                {(form.isResellerPlan
                  ? [["monthly", "Pack 5"], ["quarterly", "Pack 10"], ["yearly", "Pack 25"]]
                  : [["monthly", "Mensual"], ["quarterly", "Trimestral"], ["yearly", "Anual"]]
                ).map(([p, label]) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p as BillingPeriod)}
                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{form.isResellerPlan ? "Precio (USD/pack)" : "Precio (USD/mes)"}</Label>
                  {period === "monthly" && (
                    <Input type="number" min={0} step={0.01} value={form.priceUSD}
                      onChange={(e) => setForm({ ...form, priceUSD: parseFloat(e.target.value) || 0 })} />
                  )}
                  {period === "quarterly" && (
                    <Input type="number" min={0} step={0.01} value={form.priceQuarterly}
                      onChange={(e) => setForm({ ...form, priceQuarterly: parseFloat(e.target.value) || 0 })} />
                  )}
                  {period === "yearly" && (
                    <Input type="number" min={0} step={0.01} value={form.priceYearly}
                      onChange={(e) => setForm({ ...form, priceYearly: parseFloat(e.target.value) || 0 })} />
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Créditos</Label>
                  <Input type="number" min={0} value={form.credits}
                    onChange={(e) => setForm({ ...form, credits: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Descripción breve</Label>
                <Input value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Ideal para pequeños negocios..." />
              </div>
              <div className="space-y-1">
                <Label>Características (una por línea)</Label>
                <Textarea rows={4} value={form.features}
                  onChange={(e) => setForm({ ...form, features: e.target.value })}
                  placeholder={"Asistente IA 24/7\nSoporte básico\n1 instancia WhatsApp"} />
              </div>

              <div className="space-y-1">
                <Label>
                  {form.isResellerPlan
                    ? `Link de pago · ${period === "monthly" ? "Pack 5" : period === "quarterly" ? "Pack 10" : "Pack 25"}`
                    : `Link de pago · ${period === "monthly" ? "Mensual" : period === "quarterly" ? "Trimestral" : "Anual"}`}
                </Label>
                {period === "monthly" && (
                  <Input value={form.checkoutUrlMonthly}
                    onChange={(e) => setForm({ ...form, checkoutUrlMonthly: e.target.value })}
                    placeholder="https://checkout.stripe.com/..." />
                )}
                {period === "quarterly" && (
                  <Input value={form.checkoutUrlQuarterly}
                    onChange={(e) => setForm({ ...form, checkoutUrlQuarterly: e.target.value })}
                    placeholder="https://checkout.stripe.com/..." />
                )}
                {period === "yearly" && (
                  <Input value={form.checkoutUrlYearly}
                    onChange={(e) => setForm({ ...form, checkoutUrlYearly: e.target.value })}
                    placeholder="https://checkout.stripe.com/..." />
                )}
                <p className="text-[11px] text-muted-foreground">Cada periodo tiene su propio link. Sin link configurado, el botón lleva al registro interno.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Color (hex o nombre)</Label>
                  <Input value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    placeholder="#F59E0B" />
                </div>
                <div className="space-y-1">
                  <Label>Orden</Label>
                  <Input type="number" value={form.order}
                    onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.isPopular} onCheckedChange={(v) => setForm({ ...form, isPopular: v })} />
                  Popular
                </label>
                <label className="flex items-center gap-2 text-sm">
                  Activo
                  <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                </label>
              </div>
            </div>
          )}

          {dialogTab === "detail" && dialogPlanId && (
            <div className="flex-1 overflow-y-auto py-2 pr-1">
              <PlanDetailTab subscriptionPlanId={dialogPlanId} />
            </div>
          )}

          {dialogTab === "config" && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Guardar
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
