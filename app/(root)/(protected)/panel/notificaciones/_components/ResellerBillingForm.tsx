'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getAvailableInstances, sendTrialTestMessage } from '@/actions/trial-followup-actions'
import {
  saveResellerBillingConfig,
  type ResellerBillingConfigData,
} from '@/actions/billing/reseller-billing-actions'
import { CreditCard, MessageCircle, RefreshCw, Send, Pencil, ListChecks } from 'lucide-react'

interface Props {
  initial: ResellerBillingConfigData
}

type MsgKey = 'msgReminder' | 'msgDueToday' | 'msgOverdue' | 'msgSuspended' | 'msgDeleted'

const MSGS: { key: MsgKey; label: string; hint: string }[] = [
  { key: 'msgReminder', label: 'Recordatorio (3 días antes)', hint: 'Avisa que el servicio está por vencer' },
  { key: 'msgDueToday', label: 'Vence hoy', hint: 'Recordatorio el día del vencimiento' },
  { key: 'msgOverdue', label: 'Vencido', hint: 'Recordatorio mientras está vencido (en gracia)' },
  { key: 'msgSuspended', label: 'Suspendido', hint: 'Al cortar el acceso por falta de pago' },
  { key: 'msgDeleted', label: 'Cuenta eliminada', hint: 'Al dar de baja la cuenta (30 días)' },
]

const SAMPLE = { nombre: 'María', empresa: 'Acme', fecha: '15/07/2026', dias: '3' }
const fillVars = (text: string) =>
  text
    .replace(/\{nombre\}/gi, SAMPLE.nombre)
    .replace(/\{empresa\}/gi, SAMPLE.empresa)
    .replace(/\{fecha\}/gi, SAMPLE.fecha)
    .replace(/\{dias\}/gi, SAMPLE.dias)

export function ResellerBillingForm({ initial }: Props) {
  const [form, setForm] = useState<ResellerBillingConfigData>(initial)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<MsgKey | null>(null)

  const [instances, setInstances] = useState<{ name: string; status: string }[]>([])
  const [loadingInstances, setLoadingInstances] = useState(false)
  const [manualInstance, setManualInstance] = useState(false)

  const loadInstances = async () => {
    setLoadingInstances(true)
    try {
      const res = await getAvailableInstances()
      if (res.success) {
        setInstances(res.data)
        if (res.data.length === 0) setManualInstance(true)
      } else {
        setManualInstance(true)
        if (res.message) toast.message(res.message)
      }
    } catch {
      setManualInstance(true)
    } finally {
      setLoadingInstances(false)
    }
  }

  useEffect(() => {
    loadInstances()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async () => {
    if (form.enabled && !form.instanceName?.trim()) {
      toast.error('Selecciona la instancia desde la que se enviarán los cobros')
      return
    }
    setSaving(true)
    const res = await saveResellerBillingConfig(form)
    setSaving(false)
    if (res.success) toast.success(res.message)
    else toast.error(res.message)
  }

  const handleTest = async (key: MsgKey) => {
    const message = form[key]?.trim()
    if (!message) { toast.error('Escribe el mensaje primero'); return }
    setTesting(key)
    const res = await sendTrialTestMessage(message, form.instanceName ?? '')
    setTesting(null)
    if (res.success) toast.success(res.message)
    else toast.error(res.message)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header / instancia / gracia */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                Cobros automáticos a tus clientes
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                Recordatorios, suspensión y baja por falta de pago para TUS clientes, según la fecha de cobro que defines en Finanzas.
                Usa <code className="bg-muted px-1 rounded text-[11px]">{'{nombre} {empresa} {fecha} {dias}'}</code>.
              </CardDescription>
            </div>
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm(f => ({ ...f, enabled: v }))} />
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Instancia para enviar</Label>
              <button
                type="button"
                onClick={() => (manualInstance ? loadInstances() : setManualInstance(true))}
                className="flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                {manualInstance ? (<><ListChecks className="h-3 w-3" /> Ver instancias</>) : (<><Pencil className="h-3 w-3" /> Escribir manualmente</>)}
              </button>
            </div>
            {manualInstance ? (
              <Input
                placeholder="Nombre de tu instancia (ej: MI_NEGOCIO)"
                value={form.instanceName ?? ''}
                onChange={(e) => setForm(f => ({ ...f, instanceName: e.target.value }))}
              />
            ) : (
              <div className="flex items-center gap-2">
                <Select
                  value={form.instanceName ?? ''}
                  onValueChange={(v) => setForm(f => ({ ...f, instanceName: v }))}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={loadingInstances ? 'Cargando…' : 'Selecciona tu instancia'} />
                  </SelectTrigger>
                  <SelectContent>
                    {instances.map((i) => (
                      <SelectItem key={i.name} value={i.name}>
                        <span className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${i.status === 'open' ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                          {i.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" onClick={loadInstances} disabled={loadingInstances} title="Recargar">
                  <RefreshCw className={`h-4 w-4 ${loadingInstances ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5 max-w-[220px]">
            <Label className="text-xs font-semibold">Días de gracia antes de suspender</Label>
            <Input
              type="number"
              min={0}
              value={form.graceDays}
              onChange={(e) => setForm(f => ({ ...f, graceDays: Number(e.target.value) }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Mensajes */}
      {MSGS.map(({ key, label, hint }) => {
        const value = form[key] ?? ''
        return (
          <Card key={key} className={form.enabled ? '' : 'opacity-60'}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-green-500" />
                {label}
              </CardTitle>
              <CardDescription className="text-xs">{hint}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <Textarea
                rows={3}
                value={value}
                onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="resize-none text-sm"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{value.length} caracteres</span>
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => handleTest(key)} disabled={testing !== null}>
                  <Send className="h-3 w-3" />
                  {testing === key ? 'Enviando…' : 'Probar a mi número'}
                </Button>
              </div>
              <div className="rounded-md bg-muted/50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vista previa</p>
                <p className="mt-0.5 text-sm whitespace-pre-wrap">{fillVars(value)}</p>
              </div>
            </CardContent>
          </Card>
        )
      })}

      <div className="flex items-center justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cobros'}
        </Button>
      </div>
    </div>
  )
}
