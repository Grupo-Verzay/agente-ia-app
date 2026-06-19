"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { User } from "@prisma/client"
import { Loader2, Package, Users, Plus, Trash2, Search, LayoutGrid, Ticket } from "lucide-react"
import { getClientsByReseller, assignClientToReseller, removeClientFromReseller } from "@/actions/reseller-action"
import {
  getResellersWithPools,
  assignLicenses,
  updateDemoLimit,
  deleteLicensePool,
  type ResellerWithPools,
} from "@/actions/reseller-license-actions"
import { getAllSubscriptionPlans, type SubscriptionPlanItem } from "@/actions/subscription-plan-actions"
import { PLAN_LABELS } from "@/types/plans"

interface Props {
  searchParams: { [key: string]: string | undefined }
  user: User[]
  resellers: User[]
  defaultResellerId: string
}

type Client = User
type TabType = "clientes" | "licencias"

const getInitials = (name: string | null, email: string) => {
  if (!name) return email.slice(0, 2).toUpperCase()
  const parts = name.trim().split(" ")
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500",
  "bg-orange-500", "bg-pink-500", "bg-teal-500", "bg-rose-500", "bg-indigo-500",
]
const getAvatarColor = (str: string) => {
  let h = 0
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length
  return AVATAR_COLORS[h]
}

export const MainReseller = ({ searchParams, user, resellers, defaultResellerId }: Props) => {
  const router = useRouter()
  const [tab, setTab] = useState<TabType>("clientes")

  // ── Tab clientes ──
  const [selectedReseller, setSelectedReseller] = useState<string>(defaultResellerId)
  const [assignedClients, setAssignedClients] = useState<Client[]>([])
  const [unassignedClients, setUnassignedClients] = useState<Client[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [searchUnassigned, setSearchUnassigned] = useState("")
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // ── Tab licencias ──
  const [resellersData, setResellersData] = useState<ResellerWithPools[]>([])
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([])
  const [loadingLicenses, setLoadingLicenses] = useState(false)
  const [searchLicenses, setSearchLicenses] = useState("")
  const [licenseDialog, setLicenseDialog] = useState(false)
  const [selectedResellerForLicense, setSelectedResellerForLicense] = useState<ResellerWithPools | null>(null)
  const [licenseForm, setLicenseForm] = useState({ subscriptionPlanId: "", totalLicenses: 0 })
  const [demoLimitDialog, setDemoLimitDialog] = useState(false)
  const [demoLimitForm, setDemoLimitForm] = useState({ resellerUserId: "", demoLimit: 3 })
  const [saving, setSaving] = useState(false)

  // ── Cargar clientes ──
  useEffect(() => {
    if (selectedReseller) getClients(selectedReseller)
  }, [selectedReseller, refreshTrigger])

  const getClients = async (resellerId: string) => {
    const data = await getClientsByReseller(resellerId)
    setAssignedClients(data.assignedClients.filter((c): c is User => c !== null))
    setUnassignedClients(data.unassignedClients.filter((c): c is User => c !== null))
  }

  // ── Cargar licencias ──
  const fetchLicenses = useCallback(async () => {
    setLoadingLicenses(true)
    try {
      const [resRes, planRes] = await Promise.all([
        getResellersWithPools(),
        getAllSubscriptionPlans(),
      ])
      if (resRes.success) setResellersData(resRes.data)
      if (planRes.success) setPlans(planRes.data.filter(p => !p.isResellerPlan && p.assistanceType === "IA" && p.isActive))
    } finally {
      setLoadingLicenses(false)
    }
  }, [])

  useEffect(() => {
    if (tab === "licencias") void fetchLicenses()
  }, [tab, fetchLicenses])

  // ── Clientes handlers ──
  const assignClient = async (client: Client) => {
    try {
      await assignClientToReseller(client.id, selectedReseller)
      toast.success(`Cliente asignado`)
      setRefreshTrigger(prev => prev + 1)
      router.refresh()
    } catch { toast.error("Error al asignar el cliente.") }
  }

  const removeClient = async (client: Client) => {
    try {
      await removeClientFromReseller(client.id, selectedReseller)
      toast.success("Cliente eliminado del revendedor.")
      setRefreshTrigger(prev => prev + 1)
      router.refresh()
    } catch { toast.error("Error al eliminar el cliente.") }
  }

  const filteredAssignedClients = assignedClients.filter(c =>
    (c.name ?? "").toLowerCase().includes(searchTerm.toLowerCase())
  )
  const filteredUnassignedClients = unassignedClients.filter(c =>
    (c.name ?? "").toLowerCase().includes(searchUnassigned.toLowerCase())
  )

  // ── Licencias handlers ──
  const openLicenseDialog = (r: ResellerWithPools) => {
    setSelectedResellerForLicense(r)
    setLicenseForm({ subscriptionPlanId: plans[0]?.id ?? "", totalLicenses: 0 })
    setLicenseDialog(true)
  }

  const handleAssignLicenses = async () => {
    if (!licenseForm.subscriptionPlanId || licenseForm.totalLicenses < 1) {
      toast.error("Selecciona un plan y una cantidad válida")
      return
    }
    setSaving(true)
    const res = await assignLicenses(
      selectedResellerForLicense!.id,
      licenseForm.subscriptionPlanId,
      licenseForm.totalLicenses
    )
    setSaving(false)
    if (res.success) {
      toast.success(res.message)
      setLicenseDialog(false)
      void fetchLicenses()
    } else {
      toast.error(res.message)
    }
  }

  const openDemoLimitDialog = (r: ResellerWithPools) => {
    setDemoLimitForm({ resellerUserId: r.id, demoLimit: r.demoLimit })
    setDemoLimitDialog(true)
  }

  const handleUpdateDemoLimit = async () => {
    setSaving(true)
    const res = await updateDemoLimit(demoLimitForm.resellerUserId, demoLimitForm.demoLimit)
    setSaving(false)
    if (res.success) {
      toast.success(res.message)
      setDemoLimitDialog(false)
      void fetchLicenses()
    } else {
      toast.error(res.message)
    }
  }

  const handleDeletePool = async (poolId: string) => {
    if (!confirm("¿Eliminar este pool de licencias?")) return
    const res = await deleteLicensePool(poolId)
    if (res.success) {
      toast.success(res.message)
      void fetchLicenses()
    } else {
      toast.error(res.message)
    }
  }

  // ── Stats de licencias ──
  const totalResellers = resellersData.length
  const totalUsed = resellersData.reduce((a, r) => a + r.pools.reduce((b, p) => b + p.usedLicenses, 0), 0)
  const totalAvailable = resellersData.reduce((a, r) => a + r.pools.reduce((b, p) => b + p.availableLicenses, 0), 0)

  const filteredResellers = resellersData.filter(r =>
    (r.name ?? "").toLowerCase().includes(searchLicenses.toLowerCase()) ||
    r.email.toLowerCase().includes(searchLicenses.toLowerCase()) ||
    (r.company ?? "").toLowerCase().includes(searchLicenses.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Tabs */}
      <div className="sticky top-0 z-10 bg-muted/60 border-b border-border/40 px-4 pt-4 pb-3 shrink-0">
        <div className="flex gap-1 rounded-lg border border-border overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => setTab("clientes")}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium transition-colors ${tab === "clientes" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Users className="h-3.5 w-3.5" />
            Clientes directos
          </button>
          <button
            type="button"
            onClick={() => setTab("licencias")}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium transition-colors ${tab === "licencias" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Package className="h-3.5 w-3.5" />
            Licencias y demos
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">

        {/* ── TAB CLIENTES ── */}
        {tab === "clientes" && (
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Gestión de clientes por revendedor</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-2">
                <Label>Selecciona un revendedor</Label>
                <Select onValueChange={(v) => { setSelectedReseller(v); getClients(v) }} defaultValue={selectedReseller}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona..." />
                  </SelectTrigger>
                  <SelectContent>
                    {resellers.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name ?? r.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="flex flex-col flex-1 gap-2">
                  <Label className="text-base font-semibold">Clientes asignados</Label>
                  <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                  <ScrollArea className="h-60 border-border rounded-lg p-2">
                    {filteredAssignedClients.map(client => (
                      <div key={client.id} className="flex justify-between items-center p-2 hover:bg-muted rounded">
                        <span className="text-sm">{client.name ?? client.email}</span>
                        <Button size="sm" variant="destructive" onClick={() => removeClient(client)}>Quitar</Button>
                      </div>
                    ))}
                    {filteredAssignedClients.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center mt-4">Sin clientes asignados</p>
                    )}
                  </ScrollArea>
                </div>

                <div className="flex flex-col flex-1 gap-2">
                  <Label className="text-base font-semibold">Clientes sin asignar</Label>
                  <Input placeholder="Buscar..." value={searchUnassigned} onChange={e => setSearchUnassigned(e.target.value)} />
                  <ScrollArea className="h-60 border-border rounded-lg p-2">
                    {filteredUnassignedClients.map(client => (
                      <div key={client.id} className="flex justify-between items-center p-2 hover:bg-muted rounded">
                        <span className="text-sm">{client.name ?? client.email}</span>
                        <Button size="sm" onClick={() => assignClient(client)}>Asignar</Button>
                      </div>
                    ))}
                    {filteredUnassignedClients.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center mt-4">Sin clientes pendientes</p>
                    )}
                  </ScrollArea>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── TAB LICENCIAS ── */}
        {tab === "licencias" && (
          <div className="space-y-4 p-1">

            {/* Stats resumen */}
            {!loadingLicenses && resellersData.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
                  <div className="rounded-lg bg-blue-500/10 p-2">
                    <Users className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground leading-none mb-0.5">Resellers</p>
                    <p className="text-lg font-bold leading-none">{totalResellers}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
                  <div className="rounded-lg bg-violet-500/10 p-2">
                    <LayoutGrid className="h-4 w-4 text-violet-500" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground leading-none mb-0.5">Licencias usadas</p>
                    <p className="text-lg font-bold leading-none">{totalUsed}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2">
                    <Ticket className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground leading-none mb-0.5">Disponibles</p>
                    <p className="text-lg font-bold leading-none">{totalAvailable}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Buscador */}
            {!loadingLicenses && resellersData.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar reseller..."
                  value={searchLicenses}
                  onChange={e => setSearchLicenses(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            )}

            {loadingLicenses ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredResellers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {searchLicenses ? "Sin resultados para la búsqueda." : "No hay resellers registrados aún."}
              </div>
            ) : (
              filteredResellers.map((r) => {
                const initials = getInitials(r.name, r.email)
                const avatarColor = getAvatarColor(r.email)
                const demoFull = r.demosUsed >= r.demoLimit
                const demoNearFull = r.demosUsed >= r.demoLimit - 1
                const totalPoolLicenses = r.pools.reduce((a, p) => a + p.totalLicenses, 0)
                const usedPoolLicenses = r.pools.reduce((a, p) => a + p.usedLicenses, 0)

                return (
                  <div key={r.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`shrink-0 h-9 w-9 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-bold`}>
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-tight truncate">{r.name ?? r.email}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{r.company} · {r.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openDemoLimitDialog(r)}
                          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted
                            ${demoFull ? "border-destructive/40 text-destructive" : demoNearFull ? "border-orange-400/40 text-orange-500" : "border-border text-muted-foreground"}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${demoFull ? "bg-destructive" : demoNearFull ? "bg-orange-400" : "bg-emerald-400"}`} />
                          Demos {r.demosUsed}/{r.demoLimit}
                        </button>
                        <Button size="sm" className="h-7 text-xs gap-1" onClick={() => openLicenseDialog(r)}>
                          <Plus className="h-3 w-3" />
                          Asignar licencias
                        </Button>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="px-4 py-3">
                      {r.pools.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-1">Sin licencias asignadas.</p>
                      ) : (
                        <>
                          {/* Mini resumen de licencias */}
                          <div className="flex items-center gap-3 mb-3">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: totalPoolLicenses > 0 ? `${Math.min(100, (usedPoolLicenses / totalPoolLicenses) * 100)}%` : "0%" }}
                              />
                            </div>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {usedPoolLicenses}/{totalPoolLicenses} licencias usadas
                            </span>
                          </div>

                          {/* Pool cards */}
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {r.pools.map((pool) => {
                              const pct = pool.totalLicenses > 0 ? (pool.usedLicenses / pool.totalLicenses) * 100 : 0
                              const isFull = pool.availableLicenses <= 0
                              return (
                                <div
                                  key={pool.id}
                                  className={`rounded-lg border p-3 space-y-2 ${isFull ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/30"}`}
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <div>
                                      <p className="text-xs font-semibold leading-tight">{PLAN_LABELS[pool.plan]}</p>
                                      <p className="text-[10px] text-muted-foreground">{pool.assistanceType}</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleDeletePool(pool.id)}
                                      className="text-muted-foreground/50 hover:text-destructive transition-colors mt-0.5"
                                      title="Eliminar pool"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                      <span>{pool.usedLicenses} usadas</span>
                                      <span>{pool.totalLicenses} total</span>
                                    </div>
                                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${isFull ? "bg-destructive" : pct > 75 ? "bg-orange-400" : "bg-primary"}`}
                                        style={{ width: `${Math.min(100, pct)}%` }}
                                      />
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] px-1.5 py-0 h-4 font-medium ${isFull ? "border-destructive/40 text-destructive" : "border-emerald-500/40 text-emerald-600"}`}
                                    >
                                      {isFull ? "Sin cupo" : `${pool.availableLicenses} disp.`}
                                    </Badge>
                                    {pool.priceWholesale != null && (
                                      <span className="text-[10px] text-muted-foreground">${pool.priceWholesale}/mes</span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Dialog: asignar licencias */}
      <Dialog open={licenseDialog} onOpenChange={setLicenseDialog}>
        <DialogContent className="flex h-[585px] max-w-sm flex-col">
          <DialogHeader>
            <DialogTitle>Asignar licencias</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Reseller: <strong>{selectedResellerForLicense?.name ?? selectedResellerForLicense?.email}</strong>
            </p>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto py-2">
            <div className="space-y-1">
              <Label>Plan</Label>
              <Select value={licenseForm.subscriptionPlanId} onValueChange={v => setLicenseForm({ ...licenseForm, subscriptionPlanId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un plan..." />
                </SelectTrigger>
                <SelectContent>
                  {plans.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {PLAN_LABELS[p.plan]} IA · {p.credits.toLocaleString()} créditos
                      {p.priceWholesale != null ? ` · $${p.priceWholesale}/mes` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Total de licencias a asignar</Label>
              <Input
                type="number" min={1} value={licenseForm.totalLicenses}
                onChange={e => setLicenseForm({ ...licenseForm, totalLicenses: parseInt(e.target.value) || 0 })}
                placeholder="Ej: 10"
              />
              <p className="text-[11px] text-muted-foreground">
                Este es el total de licencias que puede vender. Si ya tiene un pool de este plan, se actualiza el total.
              </p>
            </div>
            {licenseForm.subscriptionPlanId && licenseForm.totalLicenses > 0 && (() => {
              const p = plans.find(x => x.id === licenseForm.subscriptionPlanId)
              if (!p?.priceWholesale) return null
              return (
                <div className="rounded-lg bg-muted p-3 text-xs space-y-1">
                  <p className="font-medium">Resumen de facturación mensual</p>
                  <p className="text-muted-foreground">
                    {licenseForm.totalLicenses} licencias × ${p.priceWholesale} = <strong className="text-foreground">${(licenseForm.totalLicenses * p.priceWholesale).toFixed(2)}/mes</strong>
                  </p>
                </div>
              )
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLicenseDialog(false)}>Cancelar</Button>
            <Button onClick={handleAssignLicenses} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: demo limit */}
      <Dialog open={demoLimitDialog} onOpenChange={setDemoLimitDialog}>
        <DialogContent className="flex h-[585px] max-w-sm flex-col">
          <DialogHeader>
            <DialogTitle>Límite de demos</DialogTitle>
            <p className="text-xs text-muted-foreground">Cantidad máxima de demos que puede crear este reseller.</p>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto py-2">
            <div className="space-y-1">
              <Label>Demos máximas permitidas</Label>
              <Input
                type="number" min={0} value={demoLimitForm.demoLimit}
                onChange={e => setDemoLimitForm({ ...demoLimitForm, demoLimit: parseInt(e.target.value) || 0 })}
              />
              <p className="text-[11px] text-muted-foreground">
                Por defecto son 3. Cada demo dura 7 días y tiene 1,000 créditos.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDemoLimitDialog(false)}>Cancelar</Button>
            <Button onClick={handleUpdateDemoLimit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
