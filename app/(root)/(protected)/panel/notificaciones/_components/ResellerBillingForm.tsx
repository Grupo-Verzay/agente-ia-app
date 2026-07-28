'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ExpandableTextarea } from '@/components/shared/ExpandableTextarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { getAvailableInstances, sendTrialTestMessage } from '@/actions/trial-followup-actions'
import {
  saveResellerBillingConfig,
  type ResellerBillingConfigData,
} from '@/actions/billing/reseller-billing-actions'
import { cleanInstanceDisplayName } from '@/lib/instance-display-name'
import { CreditCard, MessageCircle, RefreshCw, Send, Pencil, ListChecks, Check, ChevronsUpDown } from 'lucide-react'

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

const SAMPLE = {
  nombre: 'María',
  empresa: 'Acme',
  fecha: '15/07/2026',
  dias: '3',
  precio: '$120.000 COP',
  plan: '*Plan* Agente IA',
  link: 'https://pago.tudominio.com',
}
const fillVars = (text: string) =>
  text
    .replace(/\{nombre\}/gi, SAMPLE.nombre)
    .replace(/\{empresa\}/gi, SAMPLE.empresa)
    .replace(/\{fecha\}/gi, SAMPLE.fecha)
    .replace(/\{dias\}/gi, SAMPLE.dias)
    .replace(/\{precio\}/gi, SAMPLE.precio)
    .replace(/\{plan\}/gi, SAMPLE.plan)
    .replace(/\{link\}/gi, SAMPLE.link)

export function ResellerBillingForm({ initial }: Props) {
  const [form, setForm] = useState<ResellerBillingConfigData>(initial)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<MsgKey | null>(null)

  const [instances, setInstances] = useState<{ name: string; status: string }[]>([])
  const [loadingInstances, setLoadingInstances] = useState(false)
  const [manualInstance, setManualInstance] = useState(false)
  const [instancePickerOpen, setInstancePickerOpen] = useState(false)

  const connectedInstancesCount = instances.filter((i) => i.status === 'open').length
  const selectedInstanceStatus = instances.find((i) => i.name === form.instanceName)?.status

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

  const handleCancel = () => {
    setForm(initial)
    toast.message('Cambios descartados')
  }

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
                Vienen con los <b>mismos mensajes que usa Verzay</b>. Edítalos si quieres personalizarlos.
                Placeholders: <code className="bg-muted px-1 rounded text-[11px]">{'{empresa} {fecha} {dias} {precio} {plan} {link}'}</code>.
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
                {/* Buscador: con muchas instancias, una lista desplegable obliga a
                    recorrerla entera. Aquí se escribe y se filtra, y el encabezado
                    dice cuántas hay y cuántas están conectadas. */}
                <Popover open={instancePickerOpen} onOpenChange={setInstancePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={instancePickerOpen}
                      className="flex-1 justify-between font-normal"
                    >
                      <span className="flex items-center gap-2 truncate">
                        {form.instanceName ? (
                          <>
                            <span className={`h-2 w-2 shrink-0 rounded-full ${selectedInstanceStatus === 'open' ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                            {cleanInstanceDisplayName(form.instanceName)}
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            {loadingInstances ? 'Cargando...' : 'Selecciona tu instancia'}
                          </span>
                        )}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                      <CommandInput placeholder="Buscar instancia..." />
                      <CommandList>
                        <CommandEmpty>Ninguna instancia con ese nombre.</CommandEmpty>
                        <CommandGroup
                          heading={`${instances.length} instancia${instances.length === 1 ? '' : 's'} · ${connectedInstancesCount} conectada${connectedInstancesCount === 1 ? '' : 's'}`}
                        >
                          {instances.map((i) => (
                            <CommandItem
                              key={i.name}
                              value={cleanInstanceDisplayName(i.name)}
                              onSelect={() => {
                                setForm(f => ({ ...f, instanceName: i.name }))
                                setInstancePickerOpen(false)
                              }}
                            >
                              <span className={`mr-2 h-2 w-2 shrink-0 rounded-full ${i.status === 'open' ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                              <span className="truncate">{cleanInstanceDisplayName(i.name)}</span>
                              {form.instanceName === i.name && <Check className="ml-auto h-4 w-4 shrink-0" />}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
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
              <ExpandableTextarea
                rows={3}
                value={value}
                placeholder="Mensaje estándar de Verzay. Edítalo si quieres personalizarlo."
                title={label}
                description={hint}
                onChange={(v) => setForm(f => ({ ...f, [key]: v }))}
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {value.length} caracteres
                </span>
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => handleTest(key)} disabled={testing !== null}>
                  <Send className="h-3 w-3" />
                  {testing === key ? 'Enviando…' : 'Probar a mi número'}
                </Button>
              </div>
              {value.trim() && (
                <div className="rounded-md bg-muted/50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vista previa</p>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap">{fillVars(value)}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={handleCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cobros'}
        </Button>
      </div>
    </div>
  )
}
