"use client";

import {
  ResponsiveContainer,
  BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { TeamMetrics } from "@/actions/team-actions";

const LEAD_COLORS: Record<string, string> = {
  FRIO: "#3B82F6",
  TIBIO: "#F59E0B",
  CALIENTE: "#F97316",
  FINALIZADO: "#22C55E",
  DESCARTADO: "#6B7280",
};

const LEAD_LABELS: Record<string, string> = {
  FRIO: "Frío", TIBIO: "Tibio", CALIENTE: "Caliente",
  FINALIZADO: "Finalizado", DESCARTADO: "Descartado",
};

type Props = { metrics: TeamMetrics; maxChats: number };

export function TeamCharts({ metrics, maxChats }: Props) {
  const { global, advisors } = metrics;

  const shortName = (name: string | null, email: string) => {
    const src = name?.trim() || email;
    return src.split(" ")[0];
  };

  // Datos: carga por asesor
  const cargaData = advisors.map((a) => ({
    name: shortName(a.name, a.email),
    Activas: a.activeCount,
    Asignadas: a.totalAssigned,
  }));

  // Datos: rendimiento por asesor
  const rendData = advisors.map((a) => ({
    name: shortName(a.name, a.email),
    Cerradas: a.closedCount,
    Calientes: a.hotCount,
    Convertidas: a.convertedCount,
  }));

  // Datos: distribución de leads
  const leadData = (["FRIO", "TIBIO", "CALIENTE", "FINALIZADO", "DESCARTADO"] as const)
    .map((key) => ({ name: LEAD_LABELS[key], value: global.leadStatus[key], color: LEAD_COLORS[key] }))
    .filter((d) => d.value > 0);

  const totalLeads = leadData.reduce((a, b) => a + b.value, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0">

      {/* Carga del equipo */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Carga del equipo</CardTitle>
          <CardDescription className="text-xs">Conversaciones activas vs. total asignadas</CardDescription>
        </CardHeader>
        <CardContent>
          {cargaData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={cargaData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={60} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                  cursor={{ fill: "hsl(var(--muted))" }}
                />
                <Bar dataKey="Asignadas" fill="#CBD5E1" radius={[0, 4, 4, 0]} maxBarSize={12} />
                <Bar dataKey="Activas" fill="#22C55E" radius={[0, 4, 4, 0]} maxBarSize={12} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Rendimiento por asesor */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Rendimiento</CardTitle>
          <CardDescription className="text-xs">Cerradas, calientes y convertidas por asesor</CardDescription>
        </CardHeader>
        <CardContent>
          {rendData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={rendData} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                  cursor={{ fill: "hsl(var(--muted))" }}
                />
                <Bar dataKey="Cerradas" fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="Calientes" fill="#F97316" radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="Convertidas" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Distribución de leads */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Estado de leads</CardTitle>
          <CardDescription className="text-xs">{totalLeads} leads clasificados</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center">
          {totalLeads === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <PieChart margin={{ top: 5, right: 8, bottom: 0, left: 8 }}>
                <Pie
                  data={leadData}
                  cx="50%"
                  cy="43%"
                  innerRadius={42}
                  outerRadius={63}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {leadData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                  formatter={(value: number) => [`${value} (${Math.round((value / totalLeads) * 100)}%)`, ""]}
                />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
