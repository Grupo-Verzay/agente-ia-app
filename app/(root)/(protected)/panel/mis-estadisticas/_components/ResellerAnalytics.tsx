"use client"

import { TooltipProvider } from "@/components/ui/tooltip"
import { MetricCard } from "@/components/custom/MetricCard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, Cell,
} from "recharts"
import { Users, UserCheck, UserX, TrendingUp, Zap } from "lucide-react"
import type { ResellerAnalyticsData } from "@/actions/analytics-actions"

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

const formatCurrency = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString()}`
  }
}

export function ResellerAnalytics({ data }: { data: ResellerAnalyticsData }) {
  const {
    totalClients,
    activeClients,
    suspendedClients,
    planDistribution,
    totalCreditsAssigned,
    totalCreditsUsed,
    estimatedMonthlyRevenue,
    currencyCode,
  } = data

  const chartData = planDistribution.map((p) => ({
    name: PLAN_LABELS[p.plan] ?? p.plan,
    clientes: p.count,
    color: PLAN_COLORS[p.plan] ?? "#6b7280",
  }))

  const creditsAvailable = Math.max(0, totalCreditsAssigned - totalCreditsUsed)
  const creditsProgress =
    totalCreditsAssigned > 0
      ? Math.min(100, (totalCreditsUsed / totalCreditsAssigned) * 100)
      : 0
  const progressColor =
    creditsProgress > 80 ? "#EF4444" : creditsProgress > 60 ? "#F59E0B" : "#22C55E"

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-full min-w-0 w-full flex-col gap-3 overflow-auto p-1">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
          <div className="min-w-0 sm:flex-1">
            <MetricCard
              icon={<Users className="h-4 w-4" />}
              label="Total Clientes"
              value={totalClients}
              helper="Clientes asignados a tu cuenta"
              color="#3B82F6"
            />
          </div>
          <div className="min-w-0 sm:flex-1">
            <MetricCard
              icon={<UserCheck className="h-4 w-4" />}
              label="Activos"
              value={activeClients}
              helper="Clientes con servicio activo"
              color="#22C55E"
            />
          </div>
          <div className="min-w-0 sm:flex-1">
            <MetricCard
              icon={<UserX className="h-4 w-4" />}
              label="Suspendidos"
              value={suspendedClients}
              helper="Clientes con servicio suspendido"
              color="#EF4444"
            />
          </div>
          <div className="min-w-0 sm:flex-1">
            <MetricCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Ingresos Est./mes"
              value={formatCurrency(estimatedMonthlyRevenue, currencyCode)}
              helper="Suma del precio de facturación de clientes activos"
              color="#8B5CF6"
            />
          </div>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Plan Distribution */}
          <Card className="border-border">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Distribución por plan</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {chartData.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sin clientes asignados aún
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <ReTooltip
                      formatter={(v: number) => [v, "Clientes"]}
                      contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    />
                    <Bar dataKey="clientes" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Credits */}
          <Card className="border-border">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Zap className="h-4 w-4 text-amber-500" />
                Créditos IA (total clientes)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pb-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Asignados</span>
                <span className="font-semibold">{totalCreditsAssigned.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Consumidos</span>
                <span className="font-semibold text-amber-600">
                  {totalCreditsUsed.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Disponibles</span>
                <span className="font-semibold text-green-600">
                  {creditsAvailable.toLocaleString()}
                </span>
              </div>

              {/* Progress bar */}
              <div>
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Uso total</span>
                  <span>{creditsProgress.toFixed(1)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${creditsProgress}%`, backgroundColor: progressColor }}
                  />
                </div>
              </div>

              {/* Plan badges */}
              {planDistribution.length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs text-muted-foreground">Planes activos</p>
                  <div className="flex flex-wrap gap-1.5">
                    {planDistribution.map((p) => (
                      <Badge
                        key={p.plan}
                        variant="secondary"
                        style={{
                          backgroundColor: `${PLAN_COLORS[p.plan] ?? "#6b7280"}22`,
                          color: PLAN_COLORS[p.plan] ?? "#6b7280",
                        }}
                      >
                        {PLAN_LABELS[p.plan] ?? p.plan}: {p.count}
                      </Badge>
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
