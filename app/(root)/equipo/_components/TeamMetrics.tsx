"use client";

import { Download, MessageSquare, Sparkles, UserCheck, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/custom/MetricCard";
import type { TeamMetrics } from "@/actions/team-actions";

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const LEAD_CONFIG: Record<string, { label: string; bar: string; text: string }> = {
  FRIO:       { label: "Frío",       bar: "bg-blue-400",    text: "text-blue-500" },
  TIBIO:      { label: "Tibio",      bar: "bg-amber-400",   text: "text-amber-500" },
  CALIENTE:   { label: "Caliente",   bar: "bg-orange-500",  text: "text-orange-500" },
  FINALIZADO: { label: "Finalizado", bar: "bg-emerald-500", text: "text-emerald-600" },
  DESCARTADO: { label: "Descartado", bar: "bg-zinc-400",    text: "text-zinc-500" },
};

const PALETTE = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500',
];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function getInitials(name: string | null, email: string) {
  const src = name?.trim() || email;
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

type Props = { metrics: TeamMetrics };

export function TeamKpiCards({ metrics }: Props) {
  const { global } = metrics;
  const totalClassified = Object.values(global.leadStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="hidden sm:flex sm:flex-wrap sm:gap-3">
      <div className="min-w-0 sm:flex-1">
        <MetricCard icon={<MessageSquare className="h-4 w-4" />} label="Conversaciones activas" value={global.totalActive} helper="Total de conversaciones activas en el equipo" color="#3B82F6" />
      </div>
      <div className="min-w-0 sm:flex-1">
        <MetricCard icon={<Sparkles className="h-4 w-4" />} label="Nuevas esta semana" value={global.newThisWeek} helper="Conversaciones iniciadas en los últimos 7 días" color="#8B5CF6" />
      </div>
      <div className="min-w-0 sm:flex-1">
        <MetricCard icon={<UserCheck className="h-4 w-4" />} label="Escaladas a asesor" value={`${global.escalationRate}%`} helper="Porcentaje del total escaladas a un asesor" color="#F59E0B" />
      </div>
      <div className="min-w-0 sm:flex-1">
        <MetricCard icon={<TrendingUp className="h-4 w-4" />} label="Tasa de conversión" value={`${global.conversionRate}%`} helper={`De ${totalClassified} leads clasificados`} color="#10B981" />
      </div>
    </div>
  );
}

export function TeamMetrics({ metrics }: Props) {
  const { advisors } = metrics;

  return (
    <div className="space-y-5">

      {/* Per-advisor performance */}
      {advisors.length > 0 && (
        <div className="rounded-xl border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
            <p className="text-sm font-medium">Rendimiento por asesor</p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => {
                const date = new Date().toISOString().split("T")[0];
                const headers = ["Asesor", "Email", "Asignadas", "Activas", "Cerradas", "Calientes", "Convertidas"];
                const rows = advisors.map((a) => [
                  a.name ?? "", a.email,
                  String(a.totalAssigned), String(a.activeCount),
                  String(a.closedCount), String(a.hotCount), String(a.convertedCount),
                ]);
                downloadCsv(`metricas_equipo_${date}.csv`, headers, rows);
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Asesor</th>
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground">Asignadas</th>
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground">Activas</th>
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground">Cerradas</th>
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground">Calientes</th>
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground">Convertidas</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {advisors.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white shrink-0", colorFor(a.id))}>
                          {getInitials(a.name, a.email)}
                        </span>
                        <span className="font-medium text-sm">{a.name ?? a.email}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-sm">{a.totalAssigned}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn("inline-flex items-center justify-center h-5 min-w-[1.25rem] rounded-full px-1 text-xs font-semibold",
                        a.activeCount > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "text-muted-foreground")}>
                        {a.activeCount}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-sm text-muted-foreground">{a.closedCount}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn("inline-flex items-center justify-center h-5 min-w-[1.25rem] rounded-full px-1 text-xs font-semibold",
                        a.hotCount > 0 ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" : "text-muted-foreground")}>
                        {a.hotCount}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn("inline-flex items-center justify-center h-5 min-w-[1.25rem] rounded-full px-1 text-xs font-semibold",
                        a.convertedCount > 0 ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "text-muted-foreground")}>
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
