"use client"

import { TooltipProvider } from "@/components/ui/tooltip"
import { MetricCard } from "@/components/custom/MetricCard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, Cell,
} from "recharts"
import { Users, UserCheck, Building2, DollarSign, Trophy } from "lucide-react"
import type { VerzayAnalyticsData } from "@/actions/analytics-actions"

const PLAN_LABELS: Record<string, string> = {
  lite: "Lite",
  basico: "Básico",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
  enterprise: "Enterprise",
  personalizado: "Personalizado",
}

const PLAN_COLORS: Record<string, string> = {
  lite: "#94a3b8",
  basico: "#60a5fa",
  intermedio: "#34d399",
  avanzado: "#f59e0b",
  enterprise: "#a78bfa",
  personalizado: "#f87171",
}

const formatUSD = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(amount)

const formatMonthLabel = (key: string) => {
  const [year, month] = key.split("-").map(Number)
  return new Date(year, month - 1).toLocaleDateString("es-ES", {
    month: "short",
    year: "2-digit",
  })
}

export function VerzayAnalytics({ data }: { data: VerzayAnalyticsData }) {
  const {
    totalUsers,
    activeUsers,
    totalResellers,
    planDistribution,
    mostSoldPlan,
    monthlyRevenue,
    resellerPerformance,
    totalRevenueUSD,
  } = data

  const revenueChartData = monthlyRevenue.map((m) => ({
    mes: formatMonthLabel(m.month),
    ingresos: m.revenue,
  }))

  const planChartData = planDistribution.map((p) => ({
    name: PLAN_LABELS[p.plan] ?? p.plan,
    usuarios: p.count,
    color: PLAN_COLORS[p.plan] ?? "#6b7280",
  }))

  const sortedResellers = [...resellerPerformance].sort(
    (a, b) => b.totalClients - a.totalClients
  )

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-full min-w-0 w-full flex-col gap-3 overflow-auto p-1">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
          <div className="min-w-0 sm:flex-1">
            <MetricCard
              icon={<Users className="h-4 w-4" />}
              label="Total Usuarios"
              value={totalUsers}
              helper="Clientes registrados en la plataforma"
              color="#3B82F6"
            />
          </div>
          <div className="min-w-0 sm:flex-1">
            <MetricCard
              icon={<UserCheck className="h-4 w-4" />}
              label="Activos"
              value={activeUsers}
              helper="Usuarios con servicio activo"
              color="#22C55E"
            />
          </div>
          <div className="min-w-0 sm:flex-1">
            <MetricCard
              icon={<Building2 className="h-4 w-4" />}
              label="Resellers"
              value={totalResellers}
              helper="Revendedores registrados"
              color="#8B5CF6"
            />
          </div>
          <div className="min-w-0 sm:flex-1">
            <MetricCard
              icon={<DollarSign className="h-4 w-4" />}
              label="Ingresos (12m)"
              value={formatUSD(totalRevenueUSD)}
              helper="Ingresos de suscripciones aprobadas en los últimos 12 meses"
              color="#F59E0B"
            />
          </div>
        </div>

        {/* Monthly Revenue Chart */}
        <Card className="border-border">
          <CardHeader className="px-4 pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Ingresos mensuales — últimos 12 meses
              </CardTitle>
              <span className="text-xs text-muted-foreground">USD</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {revenueChartData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin suscripciones aprobadas en los últimos 12 meses
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={revenueChartData}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `$${v}`}
                    width={55}
                  />
                  <ReTooltip
                    formatter={(v: number) => [formatUSD(v), "Ingresos"]}
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  />
                  <Bar dataKey="ingresos" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Bottom row */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Plan Distribution */}
          <Card className="border-border">
            <CardHeader className="px-4 pb-2 pt-4">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-semibold">Usuarios por plan</CardTitle>
                {mostSoldPlan && (
                  <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                    <Trophy className="h-3 w-3 text-amber-500" />
                    {PLAN_LABELS[mostSoldPlan] ?? mostSoldPlan}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {planChartData.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sin datos de planes
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={planChartData}
                    margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <ReTooltip
                      formatter={(v: number) => [v, "Usuarios"]}
                      contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    />
                    <Bar dataKey="usuarios" radius={[4, 4, 0, 0]}>
                      {planChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Reseller Performance */}
          <Card className="border-border">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">
                Rendimiento por reseller
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {sortedResellers.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sin resellers registrados
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 border-b border-border pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="col-span-2">Reseller</span>
                    <span className="text-center">Clientes</span>
                    <span className="text-right">Activos</span>
                  </div>
                  <div className="max-h-[160px] space-y-1 overflow-auto">
                    {sortedResellers.map((r) => (
                      <div
                        key={r.id}
                        className="grid grid-cols-4 border-b border-border/50 py-1.5 text-sm last:border-0"
                      >
                        <span className="col-span-2 truncate font-medium">
                          {r.company ?? r.name ?? "—"}
                        </span>
                        <span className="text-center text-muted-foreground">
                          {r.totalClients}
                        </span>
                        <span className="flex justify-end">
                          <Badge
                            variant="secondary"
                            className="text-[10px]"
                            style={{
                              backgroundColor: "#22C55E22",
                              color: "#22C55E",
                            }}
                          >
                            {r.activeClients}
                          </Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  )
}
