"use client";

import type { TeamMetrics } from "@/actions/team-actions";

const LEAD_COLORS: Record<string, string> = {
  FRIO:       "bg-blue-400",
  TIBIO:      "bg-amber-400",
  CALIENTE:   "bg-orange-500",
  FINALIZADO: "bg-emerald-500",
  DESCARTADO: "bg-zinc-400",
};

const LEAD_LABELS: Record<string, string> = {
  FRIO: "Frío", TIBIO: "Tibio", CALIENTE: "Caliente",
  FINALIZADO: "Finalizado", DESCARTADO: "Descartado",
};

type Props = { metrics: TeamMetrics };

export function TeamMetrics({ metrics }: Props) {
  const { global, advisors } = metrics;
  const totalClassified = Object.values(global.leadStatus).reduce((a, b) => a + b, 0);
  const maxLeadCount = Math.max(...Object.values(global.leadStatus), 1);

  const kpis = [
    { label: "Activas", value: global.totalActive, sub: "conversaciones" },
    { label: "Nuevas", value: global.newThisWeek, sub: "últimos 7 días" },
    { label: "Escaladas a asesor", value: `${global.escalationRate}%`, sub: "del total" },
    { label: "Tasa de conversión", value: `${global.conversionRate}%`, sub: `de ${totalClassified} clasificadas` },
  ];

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border bg-card p-4 space-y-1">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-2xl font-bold tabular-nums">{k.value}</p>
            <p className="text-[11px] text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Lead funnel */}
      {totalClassified > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Embudo de leads</p>
          <div className="space-y-2">
            {(["FRIO", "TIBIO", "CALIENTE", "FINALIZADO", "DESCARTADO"] as const).map((key) => {
              const count = global.leadStatus[key];
              const pct = Math.round((count / maxLeadCount) * 100);
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground text-right">
                    {LEAD_LABELS[key]}
                  </span>
                  <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded transition-all ${LEAD_COLORS[key]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-xs tabular-nums text-right font-medium">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-advisor performance */}
      {advisors.length > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Rendimiento por asesor</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left pb-2 text-xs font-medium text-muted-foreground">Asesor</th>
                  <th className="text-center pb-2 text-xs font-medium text-muted-foreground">Asignadas</th>
                  <th className="text-center pb-2 text-xs font-medium text-muted-foreground">Activas</th>
                  <th className="text-center pb-2 text-xs font-medium text-muted-foreground">Cerradas</th>
                  <th className="text-center pb-2 text-xs font-medium text-muted-foreground">🔥 Calientes</th>
                  <th className="text-center pb-2 text-xs font-medium text-muted-foreground">✅ Convertidas</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {advisors.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 font-medium">{a.name ?? a.email}</td>
                    <td className="py-2 text-center tabular-nums">{a.totalAssigned}</td>
                    <td className="py-2 text-center">
                      <span className={`inline-flex items-center justify-center h-5 min-w-[1.25rem] rounded-full px-1 text-xs font-semibold ${a.activeCount > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'text-muted-foreground'}`}>
                        {a.activeCount}
                      </span>
                    </td>
                    <td className="py-2 text-center tabular-nums text-muted-foreground">{a.closedCount}</td>
                    <td className="py-2 text-center">
                      <span className={`inline-flex items-center justify-center h-5 min-w-[1.25rem] rounded-full px-1 text-xs font-semibold ${a.hotCount > 0 ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' : 'text-muted-foreground'}`}>
                        {a.hotCount}
                      </span>
                    </td>
                    <td className="py-2 text-center">
                      <span className={`inline-flex items-center justify-center h-5 min-w-[1.25rem] rounded-full px-1 text-xs font-semibold ${a.convertedCount > 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'text-muted-foreground'}`}>
                        {a.convertedCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
