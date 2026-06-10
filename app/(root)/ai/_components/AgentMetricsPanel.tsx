"use client";

import { useEffect, useState, useTransition } from "react";
import { BarChart2, Bot, Loader2, RefreshCw, UserRound, Users, Zap } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { getAgentMetrics, type AgentMetrics } from "@/actions/agent-metrics-actions";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LEAD_META: Record<string, { label: string; color: string; bar: string }> = {
  FRIO:       { label: "Frío",       color: "text-blue-600",   bar: "bg-blue-400" },
  TIBIO:      { label: "Tibio",      color: "text-amber-600",  bar: "bg-amber-400" },
  CALIENTE:   { label: "Caliente",   color: "text-red-600",    bar: "bg-red-500" },
  FINALIZADO: { label: "Finalizado", color: "text-emerald-600",bar: "bg-emerald-500" },
  DESCARTADO: { label: "Descartado", color: "text-slate-500",  bar: "bg-slate-400" },
};
const LEAD_ORDER = ["CALIENTE", "TIBIO", "FRIO", "FINALIZADO", "DESCARTADO"];

const PIE_COLORS = ["#10b981", "#f59e0b", "#94a3b8"];

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: typeof Bot; label: string; value: number; sub?: string; color: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 flex items-start gap-3">
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", color)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
        <p className="text-xl font-bold leading-tight">{value.toLocaleString("es")}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

export function AgentMetricsPanel({ open, onOpenChange }: Props) {
  const [data, setData] = useState<AgentMetrics | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      const res = await getAgentMetrics();
      if (res.success) setData(res.data);
    });
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const agentPct = data && data.total > 0 ? Math.round((data.agentOn / data.total) * 100) : 0;
  const resolvedPct = data && data.total > 0 ? Math.round((data.resolved / data.total) * 100) : 0;

  const pieData = data ? [
    { name: "Agente IA activo", value: data.agentOn },
    { name: "Agente apagado", value: data.agentOff },
  ].filter((d) => d.value > 0) : [];

  const maxFunnel = data ? Math.max(...data.leadFunnel.map((f) => f.count), 1) : 1;
  const funnelSorted = data ? LEAD_ORDER.map((s) => {
    const found = data.leadFunnel.find((f) => f.status === s);
    return { status: s, count: found?.count ?? 0 };
  }).concat(
    data.leadFunnel.filter((f) => !f.status).map((f) => ({ status: "_none", count: f.count }))
  ) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base">
              <BarChart2 className="h-4 w-4" />
              Métricas del Agente IA
            </SheetTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} disabled={isPending}>
              <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Basado en conversaciones activas</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isPending && !data ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : data ? (
            <div className="p-4 space-y-5">

              {/* Cards */}
              <div className="grid grid-cols-2 gap-2">
                <StatCard icon={Users}     label="Total conversaciones" value={data.total}      color="bg-primary/10 text-primary" />
                <StatCard icon={Bot}       label="Manejadas por IA"     value={data.agentOn}    sub={`${agentPct}% del total`} color="bg-emerald-500/10 text-emerald-600" />
                <StatCard icon={UserRound} label="Asignadas a asesor"   value={data.withAdvisor} color="bg-amber-500/10 text-amber-600" />
                <StatCard icon={Zap}       label="Leads finalizados"    value={data.resolved}   sub={`${resolvedPct}% del total`} color="bg-violet-500/10 text-violet-600" />
              </div>

              {/* IA vs Humano */}
              {pieData.length > 0 && (
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs font-semibold text-foreground mb-2">Agente IA vs Asesor humano</p>
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width={90} height={90}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={22} outerRadius={40} paddingAngle={2}>
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => v.toLocaleString("es")} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 text-xs">
                      {pieData.map((d, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i] }} />
                          <span className="text-muted-foreground">{d.name}</span>
                          <span className="font-semibold ml-auto pl-2">{d.value.toLocaleString("es")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Embudo de leads */}
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs font-semibold text-foreground mb-3">Embudo de leads</p>
                <div className="space-y-2">
                  {funnelSorted.map(({ status, count }) => {
                    const meta = LEAD_META[status] ?? { label: "Sin clasificar", color: "text-muted-foreground", bar: "bg-muted-foreground/40" };
                    const pct = Math.round((count / maxFunnel) * 100);
                    return (
                      <div key={status} className="flex items-center gap-2 text-xs">
                        <span className={cn("w-20 shrink-0 font-medium", meta.color)}>{meta.label}</span>
                        <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", meta.bar)} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-right font-semibold text-foreground/80">{count}</span>
                      </div>
                    );
                  })}
                  {funnelSorted.every((f) => f.count === 0) && (
                    <p className="text-xs text-muted-foreground text-center py-2">Sin datos de clasificación aún</p>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No se pudieron cargar las métricas.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
