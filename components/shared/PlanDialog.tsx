'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ClientInterface } from '@/lib/types'
import { PLAN_LABELS, PLAN_LEVEL_LABELS } from '@/types/plans'
import { getPlanChangeOptions, changeClientPlan } from '@/actions/reseller-license-actions'

/**
 * Cambio de plan de un cliente de reseller.
 *
 * Lista los planes que el reseller tiene en licencias y deja mover al cliente
 * a otro. El nivel de la cuenta y el pool de cobro se cambian juntos, que es
 * justo lo que antes quedaba desalineado.
 */

type Option = {
  subscriptionPlanId: string
  plan: string
  assistanceType: string
  credits: number
  availableLicenses: number
  isCurrent: boolean
}

interface Props {
  user: ClientInterface
  openPlanDialog: boolean
  setOpenPlanDialog: (open: boolean) => void
  onChanged?: () => void
}

export const PlanDialog = ({ user, openPlanDialog, setOpenPlanDialog, onChanged }: Props) => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [options, setOptions] = useState<Option[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    setSelected(null)
    const res = await getPlanChangeOptions(user.id)
    if (res.success && res.data) {
      setOptions(res.data.options as Option[])
      setIsDemo(res.data.isDemo)
    } else {
      setError(res.message || 'No se pudieron cargar los planes.')
      setOptions([])
    }
    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    if (openPlanDialog) void load()
  }, [openPlanDialog, load])

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    const res = await changeClientPlan(user.id, selected)
    if (res.success) {
      toast.success(res.message)
      setOpenPlanDialog(false)
      onChanged?.()
    } else {
      toast.error(res.message)
    }
    setSaving(false)
  }

  return (
    <Dialog open={openPlanDialog} onOpenChange={setOpenPlanDialog}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cambiar plan de {user?.name || 'este cliente'}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando planes...
          </div>
        ) : error ? (
          <p className="py-6 text-sm text-muted-foreground">{error}</p>
        ) : isDemo ? (
          <p className="py-6 text-sm text-muted-foreground">
            Es una cuenta de prueba. Conviértela primero en cliente de pago para asignarle un plan.
          </p>
        ) : options.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            El reseller no tiene licencias configuradas. Asígnale licencias primero.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Elige el plan al que se pasa. La licencia del plan actual queda libre.
            </p>
            {options.map((opt) => {
              const sinCupo = opt.availableLicenses <= 0 && !opt.isCurrent
              const activo = selected === opt.subscriptionPlanId
              return (
                <button
                  key={opt.subscriptionPlanId}
                  type="button"
                  disabled={opt.isCurrent || sinCupo}
                  onClick={() => setSelected(opt.subscriptionPlanId)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors',
                    activo ? 'border-primary bg-primary/5' : 'border-border',
                    (opt.isCurrent || sinCupo) ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted/50',
                  )}
                >
                  <div>
                    <p className="text-sm font-medium">
                      {PLAN_LEVEL_LABELS[opt.plan as keyof typeof PLAN_LEVEL_LABELS] ?? opt.plan}
                      {' · '}
                      {PLAN_LABELS[opt.plan as keyof typeof PLAN_LABELS] ?? opt.plan}
                      {opt.assistanceType === 'HUMANO' ? ' · Humana' : ' · IA'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {opt.credits.toLocaleString()} créditos ·{' '}
                      {opt.isCurrent
                        ? 'plan actual'
                        : sinCupo
                          ? 'sin licencias libres'
                          : `${opt.availableLicenses} licencia(s) libre(s)`}
                    </p>
                  </div>
                  {activo && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              )
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpenPlanDialog(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!selected || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cambiar plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
