"use server"

import { db } from "@/lib/db"
import { currentUser } from "@/lib/auth"
import { isAdminLike } from "@/lib/rbac"
import { BillingStatus, Plan, ServiceAccessStatus } from "@prisma/client"

// ─── TYPES ─────────────────────────────────────────────────────────────────

export type PlanDistItem = { plan: Plan; count: number }
export type MonthlyCountItem = { month: string; count: number }
export type MonthlyRevenueItem = { month: string; revenue: number }

export interface ExpiringSoonItem {
  id: string
  name: string | null
  company: string | null
  email: string
  serviceEndsAt: string
  daysLeft: number
}

export interface PlatformCreditsData {
  totalAssigned: number
  totalUsed: number
}

export interface LowCreditUserItem {
  id: string
  name: string | null
  company: string | null
  email: string
  total: number
  used: number
  available: number
  percentage: number
  hasOwnApiKey: boolean
  level: "empty" | "critical" | "low"
}

export interface ResellerAnalyticsData {
  totalClients: number
  activeClients: number
  suspendedClients: number
  unpaidClients: number
  activationRate: number
  planDistribution: PlanDistItem[]
  totalCreditsAssigned: number
  totalCreditsUsed: number
  estimatedMonthlyRevenue: number
  currencyCode: string
  newClientsByMonth: MonthlyCountItem[]
  clientsExpiringSoon: ExpiringSoonItem[]
  lowCreditUsers: LowCreditUserItem[]
}

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
  suspendedUsers: number
  unpaidUsers: number
  activationRate: number
  totalResellers: number
  planDistribution: PlanDistItem[]
  mostSoldPlan: Plan | null
  monthlyRevenue: MonthlyRevenueItem[]
  newUsersByMonth: MonthlyCountItem[]
  resellerPerformance: ResellerPerformanceItem[]
  totalRevenueUSD: number
  platformCredits: PlatformCreditsData
  usersExpiringSoon: ExpiringSoonItem[]
  lowCreditUsers: LowCreditUserItem[]
}

// ─── Helper: fill every month in the last N months with 0 if missing ────────

function fillMonths(map: Map<string, number>, numMonths = 12): { month: string; value: number }[] {
  const now = new Date()
  return Array.from({ length: numMonths }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (numMonths - 1 - i), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    return { month: key, value: map.get(key) ?? 0 }
  })
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

  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  const sevenDaysFromNow = new Date()
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

  const assignments = await db.reseller.findMany({
    where: { resellerid: user.id },
    include: {
      user_reseller_userIdToUser: {
        include: {
          billing: true,
          iaCredits: true,
        },
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
  const unpaidClients = clients.filter(
    (c) => c!.billing?.billingStatus === BillingStatus.UNPAID
  ).length
  const activationRate = totalClients > 0 ? Math.round((activeClients / totalClients) * 100) : 0

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

  // New clients per month (last 12 months)
  const countByMonth = new Map<string, number>()
  for (const c of clients) {
    if (!c || c.createdAt < twelveMonthsAgo) continue
    const key = `${c.createdAt.getFullYear()}-${String(c.createdAt.getMonth() + 1).padStart(2, "0")}`
    countByMonth.set(key, (countByMonth.get(key) ?? 0) + 1)
  }
  const newClientsByMonth: MonthlyCountItem[] = fillMonths(countByMonth).map(
    ({ month, value }) => ({ month, count: value })
  )

  // Clients expiring soon (next 30 days, active only)
  const clientsExpiringSoon: ExpiringSoonItem[] = clients
    .filter((c) => {
      const end = c?.billing?.serviceEndsAt
      return (
        end != null &&
        end >= new Date() &&
        end <= sevenDaysFromNow &&
        c?.billing?.accessStatus === ServiceAccessStatus.ACTIVE
      )
    })
    .map((c) => {
      const end = c!.billing!.serviceEndsAt!
      return {
        id: c!.id,
        name: c!.name,
        company: c!.company,
        email: c!.email,
        serviceEndsAt: end.toISOString(),
        daysLeft: Math.ceil((end.getTime() - Date.now()) / 86400000),
      }
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 10)

  const lowCreditUsers: LowCreditUserItem[] = clients
    .filter((c): c is NonNullable<typeof c> => c != null)
    .map((c) => {
      const total = c.iaCredits?.total ?? 0
      const usedRaw = Math.floor((c.iaCredits?.used ?? 0) / 3085)
      const available = Math.max(0, total - usedRaw)
      const pct = total > 0 ? (available / total) * 100 : 0
      const hasOwnApiKey = total < 0
      const level: LowCreditUserItem["level"] = available === 0 ? "empty" : pct < 5 ? "critical" : "low"
      return {
        id: c.id,
        name: c.name,
        company: c.company,
        email: c.email,
        total,
        used: usedRaw,
        available,
        percentage: Math.round(pct),
        hasOwnApiKey,
        level,
      }
    })
    .filter((r) => !r.hasOwnApiKey && r.percentage < 25)
    .sort((a, b) => a.percentage - b.percentage)

  return {
    success: true,
    data: {
      totalClients,
      activeClients,
      suspendedClients,
      unpaidClients,
      activationRate,
      planDistribution,
      totalCreditsAssigned,
      totalCreditsUsed,
      estimatedMonthlyRevenue,
      currencyCode,
      newClientsByMonth,
      clientsExpiringSoon,
      lowCreditUsers,
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

  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  const sevenDaysFromNow = new Date()
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

  const [totalUsers, activeUsers, suspendedUsers, unpaidUsers, totalResellers, usersByPlan] =
    await Promise.all([
      db.user.count({ where: { role: "user" } }),
      db.user.count({ where: { role: "user", billing: { accessStatus: ServiceAccessStatus.ACTIVE } } }),
      db.user.count({ where: { role: "user", billing: { accessStatus: ServiceAccessStatus.SUSPENDED } } }),
      db.user.count({ where: { role: "user", billing: { billingStatus: BillingStatus.UNPAID } } }),
      db.user.count({ where: { role: "reseller" } }),
      db.user.groupBy({ by: ["plan"], where: { role: "user" }, _count: { _all: true } }),
    ])

  const activationRate = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0

  const planDistribution: PlanDistItem[] = usersByPlan
    .map((r) => ({ plan: r.plan, count: r._count._all }))
    .sort((a, b) => b.count - a.count)
  const mostSoldPlan = planDistribution[0]?.plan ?? null

  // Monthly subscription revenue (last 12 months, filled)
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
  const monthlyRevenue: MonthlyRevenueItem[] = fillMonths(revenueByMonth).map(
    ({ month, value }) => ({ month, revenue: value })
  )
  const totalRevenueUSD = subs.reduce((s, sub) => s + parseFloat(sub.amountUSD.toString()), 0)

  // New users per month (last 12 months, filled)
  const newUsers = await db.user.findMany({
    where: { role: "user", createdAt: { gte: twelveMonthsAgo } },
    select: { createdAt: true },
  })
  const countByMonth = new Map<string, number>()
  for (const u of newUsers) {
    const key = `${u.createdAt.getFullYear()}-${String(u.createdAt.getMonth() + 1).padStart(2, "0")}`
    countByMonth.set(key, (countByMonth.get(key) ?? 0) + 1)
  }
  const newUsersByMonth: MonthlyCountItem[] = fillMonths(countByMonth).map(
    ({ month, value }) => ({ month, count: value })
  )

  // Platform-wide IA credits
  const creditsAgg = await db.iaCredit.aggregate({
    _sum: { total: true, used: true },
  })
  const platformCredits: PlatformCreditsData = {
    totalAssigned: creditsAgg._sum.total ?? 0,
    totalUsed: Math.floor((creditsAgg._sum.used ?? 0) / 3085),
  }

  // Users expiring soon — two-step to avoid relation name uncertainty
  const expiringBillings = await db.userBilling.findMany({
    where: {
      serviceEndsAt: { gte: new Date(), lte: sevenDaysFromNow },
      accessStatus: ServiceAccessStatus.ACTIVE,
    },
    orderBy: { serviceEndsAt: "asc" },
    take: 10,
  })
  const expiringIds = expiringBillings.map((b) => b.userId).filter(Boolean) as string[]
  const expiringUsers = await db.user.findMany({
    where: { id: { in: expiringIds } },
    select: { id: true, name: true, company: true, email: true },
  })
  const userMap = new Map(expiringUsers.map((u) => [u.id, u]))
  const usersExpiringSoon: ExpiringSoonItem[] = expiringBillings.map((b) => {
    const u = userMap.get(b.userId!)
    const end = b.serviceEndsAt!
    return {
      id: b.userId!,
      name: u?.name ?? null,
      company: u?.company ?? null,
      email: u?.email ?? "",
      serviceEndsAt: end.toISOString(),
      daysLeft: Math.ceil((end.getTime() - Date.now()) / 86400000),
    }
  })

  // Low credit users (< 25% available, excluding users marked as unlimited)
  const allIaCredits = await db.iaCredit.findMany({
    include: {
      user: {
        select: {
          id: true, name: true, company: true, email: true, role: true,
        },
      },
    },
  })
  const lowCreditUsers: LowCreditUserItem[] = allIaCredits
    .map((r) => {
      const usedRaw = Math.floor(r.used / 3085)
      const available = Math.max(0, r.total - usedRaw)
      const pct = r.total > 0 ? (available / r.total) * 100 : 0
      const hasOwnApiKey = r.total < 0
      const level: LowCreditUserItem["level"] = available === 0 ? "empty" : pct < 5 ? "critical" : "low"
      return {
        id: r.userId,
        name: r.user.name,
        company: r.user.company,
        email: r.user.email,
        total: r.total,
        used: usedRaw,
        available,
        percentage: Math.round(pct),
        hasOwnApiKey,
        level,
      }
    })
    .filter((r) => !r.hasOwnApiKey && r.percentage < 25)
    .sort((a, b) => a.percentage - b.percentage)

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
          c?.billing?.accessStatus === ServiceAccessStatus.ACTIVE &&
          c?.billing?.price != null
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
      suspendedUsers,
      unpaidUsers,
      activationRate,
      totalResellers,
      planDistribution,
      mostSoldPlan,
      monthlyRevenue,
      newUsersByMonth,
      resellerPerformance,
      totalRevenueUSD,
      platformCredits,
      usersExpiringSoon,
      lowCreditUsers,
    },
  }
}
