"use client"

import { TooltipProvider } from "@/components/ui/tooltip"
import { MetricCard } from "@/components/custom/MetricCard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, Cell,
} from "recharts"
import {
  Users, UserCheck, Building2, DollarSign,
  Trophy, AlertTriangle, Clock, Zap,
} from "lucide-react"
import type { VerzayAnalyticsData } from "@/actions/analytics-actions"
import { CreditAlertsWidget } from "@/components/custom/CreditAlertsWidget"

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

const formatUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n)

const formatCOP = (n: number) => {
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(n)
  } catch {
    return `COP ${n.toLocaleString()}`
  }
}

const fmtMonth = (key: string) => {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1).toLocaleDateString("es-ES", { month: "short", year: "2-digit" })
}

export function VerzayAnalytics({ data }: { data: VerzayAnalyticsData }) {
  const {
    totalUsers, activeUsers, suspendedUsers, unpaidUsers, activationRate,
    totalResellers, planDistribution, mostSoldPlan,
    monthlyRevenue, newUsersByMonth, resellerPerformance,
    totalRevenueUSD, platformCredits, usersExpiringSoon, lowCreditUsers,
  } = data

  const revenueChartData = monthlyRevenue.map((m) => ({ mes: fmtMonth(m.month), ingresos: m.revenue }))
  const newUsersChartData = newUsersByMonth.map((m) => ({ mes: fmtMonth(m.month), nuevos: m.count }))
  const planChartData = planDistribution.map((p) => ({
    name: PLAN_LABELS[p.plan] ?? p.plan,
    usuarios: p.count,
    color: PLAN_COLORS[p.plan] ?? "#6b7280",
  }))
  const sortedResellers = [...resellerPerformance].sort((a, b) => b.totalClients - a.totalClients)

  const creditsProgress =
    platformCredits.totalAssigned > 0
      ? Math.min(100, (platformCredits.totalUsed / platformCredits.totalAssigned) * 100)
      : 0
  const progressColor =
    creditsProgress > 80 ? "#EF4444" : creditsProgress > 60 ? "#F59E0B" : "#22C55E"

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-full min-w-0 w-full flex-col gap-3 overflow-auto p-1">

        {/* ── 4 Metric Cards ── */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
          <div className="min-w-0 sm:flex-1">
            <MetricCard icon={<Users className="h-4 w-4" />} label="Total Usuarios" value={totalUsers}
              helper="Clientes registrados en la plataforma" color="#3B82F6" />
          </div>
          <div className="min-w-0 sm:flex-1">
            <MetricCard icon={<UserCheck className="h-4 w-4" />} label="Activos" value={activeUsers}
              helper={`${activationRate}% de tasa de activación`} color="#22C55E" />
          </div>
          <div className="min-w-0 sm:flex-1">
            <MetricCard icon={<Building2 className="h-4 w-4" />} label="Resellers" value={totalResellers}
              helper="Revendedores registrados en la plataforma" color="#8B5CF6" />
          </div>
          <div className="min-w-0 sm:flex-1">
            <MetricCard icon={<DollarSign className="h-4 w-4" />} label="Ingresos (12m)" value={formatUSD(totalRevenueUSD)}
              helper="Ingresos de suscripciones aprobadas en los últimos 12 meses" color="#F59E0B" />
          </div>
        </div>

        {/* ── Alertas ── */}
        {(unpaidUsers > 0 || usersExpiringSoon.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {unpaidUsers > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  <strong>{unpaidUsers}</strong> usuario{unpaidUsers !== 1 ? "s" : ""} con pago pendiente
                </span>
              </div>
            )}
            {usersExpiringSoon.length > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400">
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  <strong>{usersExpiringSoon.length}</strong> usuario{usersExpiringSoon.length !== 1 ? "s" : ""} próximo{usersExpiringSoon.length !== 1 ? "s" : ""} a vencer (7 días)
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Fila 1: Nuevos usuarios + Ingresos mensuales ── */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card className="border-border">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Nuevos usuarios — últimos 12 meses</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={newUsersChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <ReTooltip formatter={(v: number) => [v, "Nuevos"]} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Line type="monotone" dataKey="nuevos" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3, fill: "#3B82F6" }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="px-4 pb-2 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Ingresos mensuales — últimos 12 meses</CardTitle>
                <span className="text-xs text-muted-foreground">USD</span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={revenueChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} width={48} />
                  <ReTooltip formatter={(v: number) => [formatUSD(v), "Ingresos"]} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Bar dataKey="ingresos" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* ── Fila 2: Usuarios por plan + Rendimiento resellers ── */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                <p className="py-8 text-center text-sm text-muted-foreground">Sin datos de planes</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={planChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <ReTooltip formatter={(v: number) => [v, "Usuarios"]} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                    <Bar dataKey="usuarios" radius={[4, 4, 0, 0]}>
                      {planChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Rendimiento por reseller</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {sortedResellers.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin resellers registrados</p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 border-b border-border pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="col-span-4">Reseller</span>
                    <span className="col-span-2 text-center">Total</span>
                    <span className="col-span-2 text-center">Activos</span>
                    <span className="col-span-4 text-right">Ing. Est./mes</span>
                  </div>
                  <div className="max-h-[160px] space-y-0.5 overflow-auto">
                    {sortedResellers.map((r) => (
                      <div key={r.id} className="grid grid-cols-12 border-b border-border/40 py-1.5 text-sm last:border-0">
                        <span className="col-span-4 truncate font-medium">{r.company ?? r.name ?? "—"}</span>
                        <span className="col-span-2 text-center text-muted-foreground">{r.totalClients}</span>
                        <span className="col-span-2 flex justify-center">
                          <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: "#22C55E22", color: "#22C55E" }}>
                            {r.activeClients}
                          </Badge>
                        </span>
                        <span className="col-span-4 text-right text-xs font-medium">
                          {r.estimatedRevenue > 0 ? formatCOP(r.estimatedRevenue) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Fila 3: Créditos IA + Próximos a vencer ── */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card className="border-border">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Zap className="h-4 w-4 text-amber-500" />
                Créditos IA — plataforma total
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pb-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Asignados</span>
                <span className="font-semibold">{platformCredits.totalAssigned.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Consumidos</span>
                <span className="font-semibold text-amber-600">{platformCredits.totalUsed.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Disponibles</span>
                <span className="font-semibold text-green-600">
                  {Math.max(0, platformCredits.totalAssigned - platformCredits.totalUsed).toLocaleString()}
                </span>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Uso global</span>
                  <span>{creditsProgress.toFixed(1)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${creditsProgress}%`, backgroundColor: progressColor }} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 text-amber-500" />
                Próximos a vencer — 7 días
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {usersExpiringSoon.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Ningún usuario próximo a vencer ✓
                </p>
              ) : (
                <div className="max-h-[180px] space-y-0.5 overflow-auto">
                  {usersExpiringSoon.map((u) => (
                    <div key={u.id} className="flex items-center justify-between border-b border-border/40 py-2 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{u.company !== "Empresa Demo" ? u.company : (u.name ?? "—")}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      <Badge
                        variant="secondary"
                        className="ml-2 shrink-0 text-[10px]"
                        style={{
                          backgroundColor: u.daysLeft <= 7 ? "#EF444422" : "#F59E0B22",
                          color: u.daysLeft <= 7 ? "#EF4444" : "#F59E0B",
                        }}
                      >
                        {u.daysLeft}d
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Fila 4: Alertas de créditos ── */}
        <CreditAlertsWidget users={lowCreditUsers} canRecharge />

      </div>
    </TooltipProvider>
  )
}
