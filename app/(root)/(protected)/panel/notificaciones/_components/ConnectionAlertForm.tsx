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
import { getAvailableInstances } from '@/actions/trial-followup-actions'
import { saveConnectionAlertConfig } from '@/actions/admin/connection-alert-actions'
import {
  DEFAULT_ALERT_MESSAGE,
  DEFAULT_ALERT_SLOTS,
  validarHorarios,
  type ConnectionAlertConfigData,
} from '@/lib/connection-alert-defaults'
import { cleanInstanceDisplayName } from '@/lib/instance-display-name'
import { Check, ChevronsUpDown, PlugZap, RefreshCw, RotateCcw } from 'lucide-react'

interface Props {
  initial: ConnectionAlertConfigData
}

export function ConnectionAlertForm({ initial }: Props) {
  const [form, setForm] = useState<ConnectionAlertConfigData>(initial)
  const [saving, setSaving] = useState(false)

  const [instances, setInstances] = useState<{ name: string; status: string }[]>([])
  const [loadingInstances, setLoadingInstances] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const connectedCount = instances.filter((i) => i.status === 'open').length
  const selectedStatus = instances.find((i) => i.name === form.instanceName)?.status

  // El error de horarios se calcula mientras se escribe: enterarse al guardar de
  // que una hora está mal es tarde, y esta pantalla configura justo el aviso que
  // no puede fallar en silencio.
  const horarios = validarHorarios(form.slots ?? '')
  const errorHorarios = horarios.ok ? null : horarios.error

  const loadInstances = async () => {
    setLoadingInstances(true)
    try {
      const res = await getAvailableInstances()
      if (res.success) setInstances(res.data)
    } catch {
      // Sin lista, el campo sigue sirviendo: vacío = la línea de siempre.
    } finally {
      setLoadingInstances(false)
    }
  }

  useEffect(() => {
    void loadInstances()
  }, [])

  const handleSave = async () => {
    if (errorHorarios) {
      toast.error(errorHorarios)
      return
    }
    setSaving(true)
    const res = await saveConnectionAlertConfig(form)
    setSaving(false)
    if (res.success) toast.success(res.message)
    else toast.error(res.message)
  }

  const restaurarTexto = () => {
    setForm((f) => ({ ...f, message: DEFAULT_ALERT_MESSAGE }))
    toast.message('Texto restaurado. Recuerda guardar.')
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <PlugZap className="h-4 w-4 text-primary" />
              Aviso de WhatsApp desvinculado
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Se envía al número de notificación del cliente cuya línea se cayó. Es el aviso que más
              importa que llegue, así que si lo apagas nadie se entera de una caída.
            </CardDescription>
          </div>
          <Switch
            checked={form.enabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
          />
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Horarios de revisión</Label>
            <Input
              value={form.slots}
              onChange={(e) => setForm((f) => ({ ...f, slots: e.target.value }))}
              placeholder={DEFAULT_ALERT_SLOTS}
            />
            {errorHorarios ? (
              <p className="text-[11px] text-destructive">{errorHorarios}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                En hora de Colombia, separados por comas. Cuanto más juntos, menos margen hay para
                no repetir el mismo aviso.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Línea que lo envía</Label>
            <div className="flex items-center gap-2">
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={pickerOpen}
                    className="flex-1 justify-between font-normal"
                  >
                    <span className="flex items-center gap-2 truncate">
                      {form.instanceName ? (
                        <>
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${selectedStatus === 'open' ? 'bg-green-500' : 'bg-muted-foreground/40'}`}
                          />
                          {cleanInstanceDisplayName(form.instanceName)}
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          {loadingInstances ? 'Cargando...' : 'La de cada dueño (automática)'}
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
                        heading={`${instances.length} instancia${instances.length === 1 ? '' : 's'} · ${connectedCount} conectada${connectedCount === 1 ? '' : 's'}`}
                      >
                        {/* Sin línea fija, cada aviso sale por la de su dueño: el
                            reseller avisa a sus clientes y Verzay a los suyos. */}
                        <CommandItem
                          value="automatica la de cada dueño"
                          onSelect={() => {
                            setForm((f) => ({ ...f, instanceName: '' }))
                            setPickerOpen(false)
                          }}
                        >
                          <span className="mr-2 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
                          <span className="truncate">La de cada dueño (automática)</span>
                          {!form.instanceName && <Check className="ml-auto h-4 w-4 shrink-0" />}
                        </CommandItem>
                        {instances.map((i) => (
                          <CommandItem
                            key={i.name}
                            value={cleanInstanceDisplayName(i.name)}
                            onSelect={() => {
                              setForm((f) => ({ ...f, instanceName: i.name }))
                              setPickerOpen(false)
                            }}
                          >
                            <span
                              className={`mr-2 h-2 w-2 shrink-0 rounded-full ${i.status === 'open' ? 'bg-green-500' : 'bg-muted-foreground/40'}`}
                            />
                            <span className="truncate">{cleanInstanceDisplayName(i.name)}</span>
                            {form.instanceName === i.name && <Check className="ml-auto h-4 w-4 shrink-0" />}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={loadInstances}
                disabled={loadingInstances}
                title="Recargar"
              >
                <RefreshCw className={`h-4 w-4 ${loadingInstances ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Si la que elijas no está disponible, el aviso sale igual por la línea de cada dueño.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Texto del aviso</Label>
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={restaurarTexto}>
              <RotateCcw className="h-3 w-3" />
              Restaurar el de siempre
            </Button>
          </div>
          <ExpandableTextarea
            rows={5}
            value={form.message}
            title="Texto del aviso"
            description="Se envía tal cual, sin placeholders."
            onChange={(v) => setForm((f) => ({ ...f, message: v }))}
          />
          <p className="text-[11px] text-muted-foreground">
            {form.message.length} caracteres. Este aviso no admite placeholders: se envía tal cual.
          </p>
        </div>

        <div className="flex items-center justify-end">
          <Button onClick={handleSave} disabled={saving || Boolean(errorHorarios)}>
            {saving ? 'Guardando...' : 'Guardar aviso'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
