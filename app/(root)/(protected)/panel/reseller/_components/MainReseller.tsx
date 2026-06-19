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
import { Loader2, Package, Users, Plus } from "lucide-react"
import { getClientsByReseller, assignClientToReseller, removeClientFromReseller } from "@/actions/reseller-action"
import {
  getResellersWithPools,
  assignLicenses,
  updateDemoLimit,
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
          <div className="space-y-4">
            {loadingLicenses ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : resellersData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No hay resellers registrados aún.</div>
            ) : (
              resellersData.map((r) => (
                <Card key={r.id} className="border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">{r.name ?? r.email}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">{r.company} · {r.email}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openDemoLimitDialog(r)}>
                          Demos: {r.demosUsed}/{r.demoLimit}
                        </Button>
                        <Button size="sm" className="h-7 text-xs gap-1" onClick={() => openLicenseDialog(r)}>
                          <Plus className="h-3 w-3" />
                          Asignar licencias
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {r.pools.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Sin licencias asignadas.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {r.pools.map((pool) => (
                          <div key={pool.id} className="rounded-lg border border-border p-3 space-y-1">
                            <p className="text-xs font-semibold">{PLAN_LABELS[pool.plan]} {pool.assistanceType}</p>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full"
                                  style={{ width: `${Math.min(100, (pool.usedLicenses / pool.totalLicenses) * 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {pool.usedLicenses}/{pool.totalLicenses}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <Badge variant={pool.availableLicenses > 0 ? "outline" : "secondary"} className="text-[10px]">
                                {pool.availableLicenses > 0 ? `${pool.availableLicenses} disp.` : "Sin cupo"}
                              </Badge>
                              {pool.priceWholesale != null && (
                                <span className="text-[10px] text-muted-foreground">${pool.priceWholesale}/mes c/u</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
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
