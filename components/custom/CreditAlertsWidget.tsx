"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Zap } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { rechargeIaCredit } from "@/actions/actions-ia-credits"
import type { LowCreditUserItem } from "@/actions/analytics-actions"

const LEVEL_CONFIG = {
  empty:    { label: "Sin créditos",   bg: "#EF444415", border: "#EF4444", color: "#EF4444", badge: "#EF444422" },
  critical: { label: "Crítico < 5%",   bg: "#F97316" + "15", border: "#F97316", color: "#F97316", badge: "#F9731622" },
  low:      { label: "Bajo < 25%",     bg: "#F59E0B15", border: "#F59E0B", color: "#F59E0B", badge: "#F59E0B22" },
}

function RechargePopover({ user, onSuccess }: { user: LowCreditUserItem; onSuccess: () => void }) {
  const [open, setOpen] = useState(false)
  const [newTotal, setNewTotal] = useState(String(user.total > 0 ? user.total : 3000))
  const [isUnlimited, setIsUnlimited] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    const total = isUnlimited ? -1 : parseInt(newTotal, 10)
    if (!isUnlimited && (isNaN(total) || total < 0)) return
    startTransition(async () => {
      await rechargeIaCredit(user.id, total)
      setOpen(false)
      onSuccess()
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-xs">
          Recargar
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="end">
        <p className="mb-1 text-xs font-semibold">
          {user.company ?? user.name ?? user.email}
        </p>
        <p className="mb-3 text-xs text-muted-foreground">
          Actual: {user.available.toLocaleString()} / {user.total.toLocaleString()} ({user.percentage}%)
        </p>
        <p className="mb-1.5 text-xs font-medium">Nuevo total de créditos</p>
        <div className="mb-3 flex h-7 items-center rounded-md border border-input bg-background px-2 focus-within:ring-1 focus-within:ring-ring">
          {isUnlimited ? (
            <span className="flex-1 text-xs font-semibold text-emerald-600">Ilimitado</span>
          ) : (
            <input
              type="number"
              min={0}
              value={newTotal}
              onChange={(e) => setNewTotal(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-xs outline-none"
            />
          )}
          <Switch
            checked={isUnlimited}
            onCheckedChange={setIsUnlimited}
            className="shrink-0 scale-75"
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button size="sm" className="h-7 flex-1 text-xs" onClick={handleSave} disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function UserRow({ user, canRecharge, onRecharge }: { user: LowCreditUserItem; canRecharge: boolean; onRecharge: () => void }) {
  const cfg = LEVEL_CONFIG[user.level]
  return (
    <div className="flex items-center gap-2 border-b border-border/40 py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {user.company && user.company !== "Empresa Demo" ? user.company : (user.name ?? "—")}
        </p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>

      <span className="shrink-0 text-right text-xs text-muted-foreground">
        <span className="font-medium" style={{ color: cfg.color }}>{user.available.toLocaleString()}</span>
        <span className="text-[10px]"> / {user.total.toLocaleString()}</span>
      </span>

      <Badge
        variant="secondary"
        className="shrink-0 text-[10px]"
        style={{ backgroundColor: cfg.badge, color: cfg.color }}
      >
        {user.percentage}%
      </Badge>

      {canRecharge && (
        <RechargePopover user={user} onSuccess={onRecharge} />
      )}
    </div>
  )
}

export function CreditAlertsWidget({
  users,
  canRecharge = false,
}: {
  users: LowCreditUserItem[]
  canRecharge?: boolean
}) {
  const router = useRouter()
  const refresh = () => router.refresh()

  const empty    = users.filter((u) => u.level === "empty")
  const critical = users.filter((u) => u.level === "critical")
  const low      = users.filter((u) => u.level === "low")

  const total = users.length

  return (
    <Card className="border-border">
      <CardHeader className="px-4 pb-2 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Zap className="h-4 w-4 text-amber-500" />
            Alertas de créditos IA
          </CardTitle>
          {total > 0 && (
            <span className="text-xs text-muted-foreground">
              {total} cliente{total !== 1 ? "s" : ""} con créditos bajos
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {total === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Todos los clientes tienen créditos suficientes ✓
          </p>
        ) : (
          <div className="space-y-3">
            {([["empty", empty], ["critical", critical], ["low", low]] as const).map(([level, group]) => {
              if (group.length === 0) return null
              const cfg = LEVEL_CONFIG[level]
              return (
                <div key={level}>
                  <div
                    className="mb-1.5 flex items-center gap-1.5 rounded-md border px-2 py-1"
                    style={{ background: cfg.bg, borderColor: cfg.border }}
                  >
                    <span className="text-xs font-semibold" style={{ color: cfg.color }}>
                      {cfg.label}
                    </span>
                    <Badge
                      variant="secondary"
                      className="h-4 text-[10px]"
                      style={{ backgroundColor: cfg.badge, color: cfg.color }}
                    >
                      {group.length}
                    </Badge>
                  </div>
                  <div className="max-h-[180px] overflow-auto">
                    {group.map((u) => (
                      <UserRow key={u.id} user={u} canRecharge={canRecharge} onRecharge={refresh} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
