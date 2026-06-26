"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { User } from "@prisma/client"
import { Loader2, Plus, Trash2, Users, UserCheck, UserMinus, UsersRound } from "lucide-react"
import { getClientsByReseller, assignClientToReseller, removeClientFromReseller } from "@/actions/reseller-action"
import {
  getResellersWithPools,
  assignLicenses,
  deleteLicensePool,
  type ResellerWithPools,
} from "@/actions/reseller-license-actions"
import { getAllSubscriptionPlans, type SubscriptionPlanItem } from "@/actions/subscription-plan-actions"
import { PLAN_LABELS } from "@/types/plans"
import { MetricCard } from "@/components/custom/MetricCard"

interface Props {
  searchParams: { [key: string]: string | undefined }
  user: User[]
  resellers: User[]
  defaultResellerId: string
}

type Client = User

export const MainReseller = ({ user, resellers, defaultResellerId }: Props) => {
  const router = useRouter()

  const [selectedReseller, setSelectedReseller] = useState<string>(defaultResellerId)
  const [assignedClients, setAssignedClients] = useState<Client[]>([])
  const [unassignedClients, setUnassignedClients] = useState<Client[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [searchUnassigned, setSearchUnassigned] = useState("")
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const [resellersData, setResellersData] = useState<ResellerWithPools[]>([])
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([])
  const [loadingLicenses, setLoadingLicenses] = useState(false)
  const [licenseDialog, setLicenseDialog] = useState(false)
  const [selectedResellerForLicense, setSelectedResellerForLicense] = useState<ResellerWithPools | null>(null)
  const [licenseForm, setLicenseForm] = useState({ subscriptionPlanId: "", totalLicenses: 0 })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (selectedReseller) getClients(selectedReseller)
  }, [selectedReseller, refreshTrigger])

  const getClients = async (resellerId: string) => {
    const data = await getClientsByReseller(resellerId)
    setAssignedClients(data.assignedClients.filter((c): c is User => c !== null))
    setUnassignedClients(data.unassignedClients.filter((c): c is User => c !== null))
  }

  const fetchLicenses = useCallback(async () => {
    setLoadingLicenses(true)
    try {
      const [resRes, planRes] = await Promise.all([
        getResellersWithPools(),
        getAllSubscriptionPlans(),
      ])
      if (resRes.success) setResellersData(resRes.data)
      // Mostrar TODOS los planes IA (incluidos los desactivados) para asignar licencias.
      if (planRes.success) setPlans(planRes.data.filter(p => !p.isResellerPlan && p.assistanceType === "IA"))
    } finally {
      setLoadingLicenses(false)
    }
  }, [])

  useEffect(() => { void fetchLicenses() }, [fetchLicenses])

  const assignClient = async (client: Client) => {
    try {
      await assignClientToReseller(client.id, selectedReseller)
      toast.success("Cliente asignado")
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

  const filteredAssigned = assignedClients.filter(c =>
    (c.name ?? "").toLowerCase().includes(searchTerm.toLowerCase())
  )
  const filteredUnassigned = unassignedClients.filter(c =>
    (c.name ?? "").toLowerCase().includes(searchUnassigned.toLowerCase())
  )

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

  const handleDeletePool = async (poolId: string) => {
    if (!confirm("¿Eliminar este pool de licencias?")) return
    const res = await deleteLicensePool(poolId)
    if (res.success) { toast.success(res.message); void fetchLicenses() }
    else toast.error(res.message)
  }

  const selectedResellerData = resellersData.find(r => r.id === selectedReseller)
  const selectedResellerPools = selectedResellerData?.pools ?? []

  return (
    <TooltipProvider delayDuration={120}>
    <div className="flex flex-col h-full min-h-0 overflow-hidden gap-4">

      {/* MetricCards */}
      <div className="shrink-0 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard
          icon={<UsersRound className="h-3.5 w-3.5" />}
          label="Total afiliados"
          value={resellers.length}
          helper="Total de resellers registrados en la plataforma"
          color="#3B82F6"
        />
        <MetricCard
          icon={<UserCheck className="h-3.5 w-3.5" />}
          label="Clientes asignados"
          value={assignedClients.length}
          helper="Clientes asignados al reseller seleccionado"
          color="#22C55E"
        />
        <MetricCard
          icon={<UserMinus className="h-3.5 w-3.5" />}
          label="Sin asignar"
          value={unassignedClients.length}
          helper="Clientes sin reseller asignado"
          color="#F59E0B"
        />
        <MetricCard
          icon={<Users className="h-3.5 w-3.5" />}
          label="Total clientes"
          value={user.length}
          helper="Total de clientes en la plataforma"
          color="#8B5CF6"
        />
      </div>

      {/* Fila: selector + licencias (resumen) */}
      <div className="shrink-0 grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Izquierda: selector */}
        <div className="flex flex-col gap-2">
          <Label className="text-base font-semibold">Selecciona un revendedor</Label>
          <Select
            value={selectedReseller}
            onValueChange={(v) => { setSelectedReseller(v); getClients(v) }}
          >
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

        {/* Derecha: licencias — solo resumen + botón */}
        <div className="flex flex-col gap-2">
          <Label className="text-base font-semibold">Licencias asignadas</Label>
          <div className="flex items-center justify-between">
            {loadingLicenses ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : selectedResellerPools.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sin licencias asignadas.</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {selectedResellerPools.length} {selectedResellerPools.length === 1 ? "pool" : "pools"} ·{" "}
                <span className="text-emerald-600 font-medium">
                  {selectedResellerPools.reduce((s, p) => s + p.availableLicenses, 0)} disp.
                </span>
              </p>
            )}
            {selectedResellerData && (
              <Button
                size="sm"
                className="h-9 text-xs gap-1"
                onClick={() => openLicenseDialog(selectedResellerData)}
                disabled={loadingLicenses}
              >
                <Plus className="h-3 w-3" />
                Asignar licencias
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Clientes asignados / sin asignar */}
      <div className="flex flex-1 min-h-0 flex-col lg:flex-row gap-4">

        {/* Columna izquierda: clientes asignados (pools dentro del scroll) */}
        <div className="flex flex-1 min-h-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Clientes asignados</Label>
            <span className="text-xs text-muted-foreground">{assignedClients.length}</span>
          </div>
          <Input placeholder="Buscar cliente..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          <ScrollArea className="flex-1 min-h-0 border border-border rounded-lg p-2">

            {/* Pools detallados al inicio del scroll */}
            {selectedResellerPools.length > 0 && (
              <div className="mb-2 flex flex-col gap-1.5">
                {selectedResellerPools.map((pool) => {
                  const pct = pool.totalLicenses > 0 ? (pool.usedLicenses / pool.totalLicenses) * 100 : 0
                  const isFull = pool.availableLicenses <= 0
                  return (
                    <div
                      key={pool.id}
                      className={`flex items-center gap-3 rounded-md border px-3 py-2 ${isFull ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/20"}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium truncate">{PLAN_LABELS[pool.plan]} · {pool.assistanceType}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{pool.usedLicenses}/{pool.totalLicenses}</span>
                        </div>
                        <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isFull ? "bg-destructive" : pct > 75 ? "bg-orange-400" : "bg-primary"}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-[10px] px-1.5 py-0 h-4 font-medium ${isFull ? "border-destructive/40 text-destructive" : "border-emerald-500/40 text-emerald-600"}`}
                      >
                        {isFull ? "Sin cupo" : `${pool.availableLicenses} disp.`}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => handleDeletePool(pool.id)}
                        className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors"
                        title="Eliminar pool"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )
                })}
                <div className="my-1 border-t border-border" />
              </div>
            )}

            {filteredAssigned.map(client => (
              <div key={client.id} className="flex justify-between items-center p-2 hover:bg-muted rounded">
                <span className="text-sm">{client.name ?? client.email}</span>
                <Button size="sm" variant="destructive" onClick={() => removeClient(client)}>Quitar</Button>
              </div>
            ))}
            {filteredAssigned.length === 0 && (
              <p className="text-sm text-muted-foreground text-center mt-4">Sin clientes asignados</p>
            )}
          </ScrollArea>
        </div>

        {/* Columna derecha: Clientes sin asignar */}
        <div className="flex flex-1 min-h-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Clientes sin asignar</Label>
            <span className="text-xs text-muted-foreground">{unassignedClients.length}</span>
          </div>
          <Input placeholder="Buscar cliente..." value={searchUnassigned} onChange={e => setSearchUnassigned(e.target.value)} />
          <ScrollArea className="flex-1 min-h-0 border border-border rounded-lg p-2">
            {filteredUnassigned.map(client => (
              <div key={client.id} className="flex justify-between items-center p-2 hover:bg-muted rounded">
                <span className="text-sm">{client.name ?? client.email}</span>
                <Button size="sm" onClick={() => assignClient(client)}>Asignar</Button>
              </div>
            ))}
            {filteredUnassigned.length === 0 && (
              <p className="text-sm text-muted-foreground text-center mt-4">Sin clientes pendientes</p>
            )}
          </ScrollArea>
        </div>
      </div>

    </div>

    {/* Dialog: asignar licencias */}
    <Dialog open={licenseDialog} onOpenChange={setLicenseDialog}>
      <DialogContent className="flex max-h-[585px] max-w-sm flex-col">
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
    </TooltipProvider>
  )
}
