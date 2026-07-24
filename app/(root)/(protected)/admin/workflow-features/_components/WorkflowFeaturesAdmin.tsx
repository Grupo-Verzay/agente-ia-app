'use client';

import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plan } from "@prisma/client";
import { Loader2, Lock, Save } from "lucide-react";

import { PLANS, PLAN_LABELS } from "@/types/plans";
import {
  WORKFLOW_FEATURES,
  WORKFLOW_FEATURE_GROUPS,
  type FeatureAccessMap,
} from "@/lib/workflow-features";
import { saveWorkflowFeatureAccess } from "@/actions/workflow-feature-access-actions";
import { Button } from "@/components/ui/button";

type RulesState = Record<string, Plan[]>;

/**
 * Admin: define qué planes pueden usar cada pieza del creador de flujos.
 * Por defecto (sin fila guardada) una función está disponible para todos los
 * planes, así que aquí arranca con todos marcados hasta que el admin ajuste.
 */
export function WorkflowFeaturesAdmin({ initial }: { initial: FeatureAccessMap }) {
  const [rules, setRules] = useState<RulesState>(() => {
    const state: RulesState = {};
    for (const f of WORKFLOW_FEATURES) {
      // Sin configurar => disponible para todos (todos marcados).
      state[f.key] = initial[f.key] ?? [...PLANS];
    }
    return state;
  });
  const [saving, setSaving] = useState(false);

  const has = (key: string, plan: Plan) => rules[key]?.includes(plan);

  const toggle = (key: string, plan: Plan) => {
    setRules((prev) => {
      const cur = prev[key] ?? [];
      const next = cur.includes(plan) ? cur.filter((p) => p !== plan) : [...cur, plan];
      return { ...prev, [key]: next };
    });
  };

  // Marca/desmarca un plan (columna) para TODAS las funciones a la vez.
  const toggleColumn = (plan: Plan, on: boolean) => {
    setRules((prev) => {
      const next: RulesState = {};
      for (const f of WORKFLOW_FEATURES) {
        const cur = prev[f.key] ?? [];
        next[f.key] = on
          ? Array.from(new Set([...cur, plan]))
          : cur.filter((p) => p !== plan);
      }
      return next;
    });
  };

  const grouped = useMemo(
    () =>
      WORKFLOW_FEATURE_GROUPS.map((group) => ({
        group,
        items: WORKFLOW_FEATURES.filter((f) => f.group === group),
      })),
    [],
  );

  const onSave = async () => {
    setSaving(true);
    const input = WORKFLOW_FEATURES.map((f) => ({ featureKey: f.key, allowedPlans: rules[f.key] ?? [] }));
    const res = await saveWorkflowFeatureAccess(input);
    setSaving(false);
    if (res.ok) toast.success("Guardado. Las reglas ya aplican en el creador de flujos.");
    else toast.error(res.error || "No se pudo guardar.");
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Funciones del creador de flujos por plan</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Marca qué planes pueden usar cada pieza. Si dejas una función sin ningún plan,
            queda bloqueada para todos (con 🔒 en el creador). Los administradores siempre
            ven todo.
          </p>
        </div>
        <Button onClick={onSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar cambios
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2.5 text-left font-semibold">Función</th>
              {PLANS.map((plan) => (
                <th key={plan} className="px-2 py-2.5 text-center font-semibold">
                  <div className="flex flex-col items-center gap-1">
                    <span>{PLAN_LABELS[plan]}</span>
                    <div className="flex gap-1 text-[10px] font-medium text-muted-foreground">
                      <button type="button" className="hover:text-primary" onClick={() => toggleColumn(plan, true)}>todos</button>
                      <span>/</span>
                      <button type="button" className="hover:text-primary" onClick={() => toggleColumn(plan, false)}>ninguno</button>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(({ group, items }) => (
              <Fragment key={group}>
                <tr className="bg-muted/20">
                  <td colSpan={PLANS.length + 1} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {group}
                  </td>
                </tr>
                {items.map((f) => {
                  const blockedForAll = (rules[f.key]?.length ?? 0) === 0;
                  return (
                    <tr key={f.key} className="border-b border-border last:border-0">
                      <td className="sticky left-0 z-10 bg-background px-3 py-2">
                        <span className="flex items-center gap-2">
                          {blockedForAll && <Lock className="h-3.5 w-3.5 text-red-500" />}
                          {f.label}
                        </span>
                      </td>
                      {PLANS.map((plan) => (
                        <td key={plan} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-primary"
                            checked={!!has(f.key, plan)}
                            onChange={() => toggle(f.key, plan)}
                            aria-label={`${f.label} — ${PLAN_LABELS[plan]}`}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={onSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}
