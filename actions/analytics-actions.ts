"use server"

import { db } from "@/lib/db"
import { currentUser } from "@/lib/auth"
import { isAdminLike } from "@/lib/rbac"
import { Plan, ServiceAccessStatus } from "@prisma/client"

// ─── TYPES ─────────────────────────────────────────────────────────────────

export type PlanDistItem = { plan: Plan; count: number }

export interface ResellerAnalyticsData {
  totalClients: number
  activeClients: number
  suspendedClients: number
  planDistribution: PlanDistItem[]
  totalCreditsAssigned: number
  totalCreditsUsed: number
  estimatedMonthlyRevenue: number
  currencyCode: string
}

export type MonthlyRevenueItem = { month: string; revenue: number }

export type ResellerPerformanceItem = {
  id: string
  name: string | null
  company: string | null
  totalClients: number
  activeClients: number
  estimatedRevenue: number
}

export interface VerzayAnalyticsData {
  totalUsers: number
  activeUsers: number
  totalResellers: number
  planDistribution: PlanDistItem[]
  mostSoldPlan: Plan | null
  monthlyRevenue: MonthlyRevenueItem[]
  resellerPerformance: ResellerPerformanceItem[]
  totalRevenueUSD: number
}

// ─── Reseller: sus propias métricas ─────────────────────────────────────────

export async function getResellerAnalytics(): Promise<{
  success: boolean
  data?: ResellerAnalyticsData
  message?: string
}> {
  const user = await currentUser()
  if (!user || user.role !== "reseller") {
    return { success: false, message: "No autorizado" }
  }

  const assignments = await db.reseller.findMany({
    where: { resellerid: user.id },
    include: {
      user_reseller_userIdToUser: {
        include: { billing: true, iaCredits: true },
      },
    },
  })

  const clients = assignments
    .map((a) => a.user_reseller_userIdToUser)
    .filter(Boolean)

  const totalClients = clients.length
  const activeClients = clients.filter(
    (c) => c!.billing?.accessStatus === ServiceAccessStatus.ACTIVE
  ).length
  const suspendedClients = clients.filter(
    (c) => c!.billing?.accessStatus === ServiceAccessStatus.SUSPENDED
  ).length

  const planMap = new Map<Plan, number>()
  for (const c of clients) {
    if (!c) continue
    planMap.set(c.plan, (planMap.get(c.plan) ?? 0) + 1)
  }
  const planDistribution: PlanDistItem[] = Array.from(planMap.entries())
    .map(([plan, count]) => ({ plan, count }))
    .sort((a, b) => b.count - a.count)

  const totalCreditsAssigned = clients.reduce((s, c) => s + (c?.iaCredits?.total ?? 0), 0)
  const totalCreditsUsed = clients.reduce(
    (s, c) => s + Math.floor((c?.iaCredits?.used ?? 0) / 3085),
    0
  )

  const activeWithPrice = clients.filter(
    (c) => c?.billing?.accessStatus === ServiceAccessStatus.ACTIVE && c?.billing?.price != null
  )
  const estimatedMonthlyRevenue = activeWithPrice.reduce(
    (s, c) => s + parseFloat(c!.billing!.price!.toString()),
    0
  )
  const currencyCode = activeWithPrice[0]?.billing?.currencyCode ?? "COP"

  return {
    success: true,
    data: {
      totalClients,
      activeClients,
      suspendedClients,
      planDistribution,
      totalCreditsAssigned,
      totalCreditsUsed,
      estimatedMonthlyRevenue,
      currencyCode,
    },
  }
}

// ─── Verzay: métricas de plataforma ─────────────────────────────────────────

export async function getVerzayPlatformAnalytics(): Promise<{
  success: boolean
  data?: VerzayAnalyticsData
  message?: string
}> {
  const user = await currentUser()
  if (!user || !isAdminLike(user.role)) {
    return { success: false, message: "No autorizado" }
  }

  const [totalUsers, activeUsers, totalResellers, usersByPlan] = await Promise.all([
    db.user.count({ where: { role: "user" } }),
    db.user.count({
      where: { role: "user", billing: { accessStatus: ServiceAccessStatus.ACTIVE } },
    }),
    db.user.count({ where: { role: "reseller" } }),
    db.user.groupBy({
      by: ["plan"],
      where: { role: "user" },
      _count: { _all: true },
    }),
  ])

  const planDistribution: PlanDistItem[] = usersByPlan
    .map((r) => ({ plan: r.plan, count: r._count._all }))
    .sort((a, b) => b.count - a.count)
  const mostSoldPlan = planDistribution[0]?.plan ?? null

  // Revenue from subscriptions — last 12 months
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  const subs = await db.userSubscription.findMany({
    where: { status: "ACTIVE", approvedAt: { gte: twelveMonthsAgo } },
    select: { amountUSD: true, approvedAt: true },
  })

  const revenueByMonth = new Map<string, number>()
  for (const s of subs) {
    if (!s.approvedAt) continue
    const key = `${s.approvedAt.getFullYear()}-${String(s.approvedAt.getMonth() + 1).padStart(2, "0")}`
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + parseFloat(s.amountUSD.toString()))
  }

  const monthlyRevenue: MonthlyRevenueItem[] = Array.from(revenueByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue }))

  const totalRevenueUSD = monthlyRevenue.reduce((s, m) => s + m.revenue, 0)

  // Reseller performance
  const [resellers, allAssignments] = await Promise.all([
    db.user.findMany({
      where: { role: "reseller" },
      select: { id: true, name: true, company: true },
    }),
    db.reseller.findMany({
      include: {
        user_reseller_userIdToUser: { include: { billing: true } },
      },
    }),
  ])

  const clientsByReseller = new Map<
    string,
    (typeof allAssignments)[0]["user_reseller_userIdToUser"][]
  >()
  for (const a of allAssignments) {
    if (!a.resellerid) continue
    if (!clientsByReseller.has(a.resellerid)) clientsByReseller.set(a.resellerid, [])
    clientsByReseller.get(a.resellerid)!.push(a.user_reseller_userIdToUser)
  }

  const resellerPerformance: ResellerPerformanceItem[] = resellers.map((r) => {
    const clients = (clientsByReseller.get(r.id) ?? []).filter(Boolean)
    const activeCount = clients.filter(
      (c) => c?.billing?.accessStatus === ServiceAccessStatus.ACTIVE
    ).length
    const revenue = clients
      .filter(
        (c) =>
          c?.billing?.accessStatus === ServiceAccessStatus.ACTIVE && c?.billing?.price != null
      )
      .reduce((s, c) => s + parseFloat(c!.billing!.price!.toString()), 0)

    return {
      id: r.id,
      name: r.name,
      company: r.company,
      totalClients: clients.length,
      activeClients: activeCount,
      estimatedRevenue: revenue,
    }
  })

  return {
    success: true,
    data: {
      totalUsers,
      activeUsers,
      totalResellers,
      planDistribution,
      mostSoldPlan,
      monthlyRevenue,
      resellerPerformance,
      totalRevenueUSD,
    },
  }
}
