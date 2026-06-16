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
  Users, UserCheck, UserX, TrendingUp,
  AlertTriangle, Clock, Zap, Percent,
} from "lucide-react"
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
      style: "currency", currency,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString()}`
  }
}

const fmtMonth = (key: string) => {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1).toLocaleDateString("es-ES", { month: "short", year: "2-digit" })
}

export function ResellerAnalytics({ data }: { data: ResellerAnalyticsData }) {
  const {
    totalClients, activeClients, suspendedClients, unpaidClients, activationRate,
    planDistribution, totalCreditsAssigned, totalCreditsUsed,
    estimatedMonthlyRevenue, currencyCode,
    newClientsByMonth, clientsExpiringSoon,
  } = data

  const planChartData = planDistribution.map((p) => ({
    name: PLAN_LABELS[p.plan] ?? p.plan,
    clientes: p.count,
    color: PLAN_COLORS[p.plan] ?? "#6b7280",
  }))

  const newClientsChartData = newClientsByMonth.map((m) => ({
    mes: fmtMonth(m.month),
    nuevos: m.count,
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

        {/* ── 5 Metric Cards ── */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          <MetricCard icon={<Users className="h-4 w-4" />} label="Total Clientes" value={totalClients}
            helper="Clientes asignados a tu cuenta" color="#3B82F6" />
          <MetricCard icon={<UserCheck className="h-4 w-4" />} label="Activos" value={activeClients}
            helper="Clientes con servicio activo" color="#22C55E" />
          <MetricCard icon={<Percent className="h-4 w-4" />} label="Tasa Activación" value={`${activationRate}%`}
            helper="Porcentaje de clientes activos sobre el total" color="#06B6D4" />
          <MetricCard icon={<UserX className="h-4 w-4" />} label="Suspendidos" value={suspendedClients}
            helper="Clientes con servicio suspendido" color="#EF4444" />
          <MetricCard icon={<TrendingUp className="h-4 w-4" />} label="Ingresos Est./mes" value={formatCurrency(estimatedMonthlyRevenue, currencyCode)}
            helper="Suma del precio de facturación de clientes activos" color="#8B5CF6" />
        </div>

        {/* ── Alertas ── */}
        {(unpaidClients > 0 || clientsExpiringSoon.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {unpaidClients > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  <strong>{unpaidClients}</strong> cliente{unpaidClients !== 1 ? "s" : ""} con pago pendiente
                </span>
              </div>
            )}
            {clientsExpiringSoon.length > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400">
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  <strong>{clientsExpiringSoon.length}</strong> cliente{clientsExpiringSoon.length !== 1 ? "s" : ""} próximo{clientsExpiringSoon.length !== 1 ? "s" : ""} a vencer (30 días)
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Fila 1: Nuevos clientes/mes + Distribución por plan ── */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card className="border-border">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Nuevos clientes — últimos 12 meses</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={newClientsChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
              <CardTitle className="text-sm font-semibold">Distribución por plan</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {planChartData.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin clientes asignados aún</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={planChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <ReTooltip formatter={(v: number) => [v, "Clientes"]} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                    <Bar dataKey="clientes" radius={[4, 4, 0, 0]}>
                      {planChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Fila 2: Créditos IA + Próximos a vencer ── */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card className="border-border">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Zap className="h-4 w-4 text-amber-500" />
                Créditos IA — total clientes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pb-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Asignados</span>
                <span className="font-semibold">{totalCreditsAssigned.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Consumidos</span>
                <span className="font-semibold text-amber-600">{totalCreditsUsed.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Disponibles</span>
                <span className="font-semibold text-green-600">{creditsAvailable.toLocaleString()}</span>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Uso total</span>
                  <span>{creditsProgress.toFixed(1)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${creditsProgress}%`, backgroundColor: progressColor }} />
                </div>
              </div>

              {planDistribution.length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs text-muted-foreground">Planes activos</p>
                  <div className="flex flex-wrap gap-1.5">
                    {planDistribution.map((p) => (
                      <Badge key={p.plan} variant="secondary"
                        style={{ backgroundColor: `${PLAN_COLORS[p.plan] ?? "#6b7280"}22`, color: PLAN_COLORS[p.plan] ?? "#6b7280" }}>
                        {PLAN_LABELS[p.plan] ?? p.plan}: {p.count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 text-amber-500" />
                Próximos a vencer — 30 días
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {clientsExpiringSoon.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Ningún cliente próximo a vencer ✓
                </p>
              ) : (
                <div className="max-h-[220px] space-y-0.5 overflow-auto">
                  {clientsExpiringSoon.map((c) => (
                    <div key={c.id} className="flex items-center justify-between border-b border-border/40 py-2 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.company !== "Empresa Demo" ? c.company : (c.name ?? "—")}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                      </div>
                      <Badge
                        variant="secondary"
                        className="ml-2 shrink-0 text-[10px]"
                        style={{
                          backgroundColor: c.daysLeft <= 7 ? "#EF444422" : "#F59E0B22",
                          color: c.daysLeft <= 7 ? "#EF4444" : "#F59E0B",
                        }}
                      >
                        {c.daysLeft}d
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </TooltipProvider>
  )
}
