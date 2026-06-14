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
import { Pencil, Loader2, Star } from "lucide-react";
import {
  getAllSubscriptionPlans,
  upsertSubscriptionPlan,
  toggleSubscriptionPlanActive,
  type SubscriptionPlanItem,
} from "@/actions/subscription-plan-actions";
import { PLAN_LABELS, PLANS } from "@/types/plans";

const ASSISTANCE_TYPES = ["IA", "HUMANO"] as const;

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
  priceUSD: number;
  credits: number;
  features: string;
  description: string;
  isPopular: boolean;
  isActive: boolean;
  color: string;
  order: number;
};

export function PlanesMain() {
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);

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

  const getPlan = (plan: Plan, type: string) =>
    plans.find((p) => p.plan === plan && p.assistanceType === type);

  const openEdit = (plan: Plan, type: string) => {
    const existing = getPlan(plan, type);
    setForm({
      plan,
      assistanceType: type,
      priceUSD: existing?.priceUSD ?? defaultPrices[plan][type],
      credits: existing?.credits ?? defaultCredits[plan][type],
      features: existing?.features.join("\n") ?? "",
      description: existing?.description ?? "",
      isPopular: existing?.isPopular ?? false,
      isActive: existing?.isActive ?? true,
      color: existing?.color ?? "",
      order: existing?.order ?? PLANS.indexOf(plan),
    });
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
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Gestión de Planes</h2>
          <p className="text-xs text-muted-foreground">
            Configura precios, créditos y características de cada plan.
          </p>
        </div>
        {plans.length === 0 && !loading && (
          <Button size="sm" onClick={handleSeedAll} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Inicializar planes"}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Editar Plan — {form ? `${PLAN_LABELS[form.plan]} (${form.assistanceType})` : ""}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Precio (USD/mes)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.priceUSD}
                    onChange={(e) => setForm({ ...form, priceUSD: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Créditos</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.credits}
                    onChange={(e) => setForm({ ...form, credits: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Descripción breve</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Ideal para pequeños negocios..."
                />
              </div>
              <div className="space-y-1">
                <Label>Características (una por línea)</Label>
                <Textarea
                  rows={5}
                  value={form.features}
                  onChange={(e) => setForm({ ...form, features: e.target.value })}
                  placeholder={"Asistente IA 24/7\nSoporte básico\n1 instancia WhatsApp"}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Color (hex o nombre)</Label>
                  <Input
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    placeholder="#F59E0B"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Orden</Label>
                  <Input
                    type="number"
                    value={form.order}
                    onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.isPopular}
                    onCheckedChange={(v) => setForm({ ...form, isPopular: v })}
                  />
                  Popular
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                  />
                  Activo
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
