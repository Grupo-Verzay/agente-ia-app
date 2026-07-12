'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ExpandableTextarea } from '@/components/shared/ExpandableTextarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  saveTrialFollowUpConfig,
  sendTrialTestMessage,
  getAvailableInstances,
  type TrialFollowUpConfigData,
} from '@/actions/trial-followup-actions'
import { cleanInstanceDisplayName } from '@/lib/instance-display-name'
import { MessageCircle, Zap, RefreshCw, Send, Pencil, ListChecks } from 'lucide-react'

interface Props {
  initial: {
    enabled: boolean
    enabled1: boolean
    enabled3: boolean
    enabled6: boolean
    instanceName: string
    message1: string
    message3: string
    message6: string
  }
}

const SAMPLE_NAME = 'María'
const CENTRAL = '__central__'

const DEFAULT_MESSAGES: Record<DayKey, string> = {
  message1: '¡Hola {nombre}! 👋 Ya tienes acceso a tu prueba gratis. ¿Tienes alguna pregunta para empezar?',
  message3: '¡Hola {nombre}! ¿Cómo va tu experiencia? Si necesitas ayuda para configurar algo, estamos aquí. 🚀',
  message6: '¡Hola {nombre}! Tu prueba gratis termina mañana. ¿Quieres continuar con todos estos beneficios? Escríbenos para elegir tu plan. 💬',
}

type DayKey = 'message1' | 'message3' | 'message6'
type EnabledKey = 'enabled1' | 'enabled3' | 'enabled6'

const DAYS: { key: DayKey; enabledKey: EnabledKey; day: string; hint: string }[] = [
  { key: 'message1', enabledKey: 'enabled1', day: 'Día 1', hint: 'Primer contacto — bienvenida y disposición a ayudar' },
  { key: 'message3', enabledKey: 'enabled3', day: 'Día 3', hint: 'Seguimiento — ver cómo va la experiencia y ofrecer apoyo' },
  { key: 'message6', enabledKey: 'enabled6', day: 'Día 6', hint: 'Cierre — recordar que la prueba termina y motivar a contratar' },
]

const fillName = (text: string) => text.replace(/\{nombre\}/gi, SAMPLE_NAME)

export function TrialFollowUpForm({ initial }: Props) {
  const [form, setForm] = useState<TrialFollowUpConfigData>({
    enabled: initial.enabled,
    enabled1: initial.enabled1,
    enabled3: initial.enabled3,
    enabled6: initial.enabled6,
    instanceName: initial.instanceName ?? '',
    message1: initial.message1 ?? '',
    message3: initial.message3 ?? '',
    message6: initial.message6 ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<DayKey | null>(null)

  // Instancias Evolution disponibles (#9)
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
      // Si el action falla (red/compilación), caemos a entrada manual sin romper el form.
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
    setSaving(true)
    const res = await saveTrialFollowUpConfig(form)
    setSaving(false)
    if (res.success) toast.success(res.message)
    else toast.error(res.message)
  }

  const handleCancel = () => {
    setForm({
      enabled: initial.enabled,
      enabled1: initial.enabled1,
      enabled3: initial.enabled3,
      enabled6: initial.enabled6,
      instanceName: initial.instanceName ?? '',
      message1: initial.message1 ?? '',
      message3: initial.message3 ?? '',
      message6: initial.message6 ?? '',
    })
    toast.message('Cambios descartados')
  }

  const handleTest = async (key: DayKey) => {
    const message = form[key]?.trim() || DEFAULT_MESSAGES[key]
    setTesting(key)
    const res = await sendTrialTestMessage(message, form.instanceName)
    setTesting(null)
    if (res.success) toast.success(res.message)
    else toast.error(res.message)
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto py-4">
      {/* Header card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Seguimientos automáticos por WhatsApp
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                Envía mensajes automáticos a los prospectos que se registran en la prueba gratis (Día 1, 3 y 6).
                Usa <code className="bg-muted px-1 rounded text-[11px]">{'{nombre}'}</code> para insertar el nombre del prospecto.
              </CardDescription>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm(f => ({ ...f, enabled: v }))}
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Linea de WhatsApp para enviar</Label>
              <button
                type="button"
                onClick={() => (manualInstance ? loadInstances() : setManualInstance(true))}
                className="flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                {manualInstance ? (
                  <><ListChecks className="h-3 w-3" /> Ver instancias</>
                ) : (
                  <><Pencil className="h-3 w-3" /> Escribir manualmente</>
                )}
              </button>
            </div>

            {manualInstance ? (
              <Input
                placeholder="Ej: VERZAY_NOTIFICACIONES_wh - vacio = usa Notificaciones"
                value={form.instanceName}
                onChange={(e) => setForm(f => ({ ...f, instanceName: e.target.value }))}
              />
            ) : (
              <div className="flex items-center gap-2">
                <Select
                  value={form.instanceName === '' ? CENTRAL : form.instanceName}
                  onValueChange={(v) => setForm(f => ({ ...f, instanceName: v === CENTRAL ? '' : v }))}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={loadingInstances ? 'Cargando instancias...' : 'Selecciona una instancia'}>
                      {form.instanceName ? cleanInstanceDisplayName(form.instanceName) : 'Instancia central de la plataforma'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CENTRAL}>Instancia central de la plataforma</SelectItem>
                    {instances.map((i) => (
                      <SelectItem key={i.name} value={i.name} textValue={cleanInstanceDisplayName(i.name)}>
                        <span className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${i.status === 'open' ? 'bg-green-500' : 'bg-muted-foreground/40'}`}
                          />
                          {cleanInstanceDisplayName(i.name)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={loadInstances}
                  disabled={loadingInstances}
                  title="Recargar instancias"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingInstances ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Si dejas este campo vacio, los mensajes saldran desde Verzay Notificaciones.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Mensajes por día */}
      {DAYS.map(({ key, enabledKey, day, hint }) => {
        const value = form[key]
        const effective = value?.trim() || DEFAULT_MESSAGES[key]
        const dayOn = form.enabled && form[enabledKey]
        return (
          <Card key={key} className={dayOn ? '' : 'opacity-60'}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-green-500" />
                    {day}
                  </CardTitle>
                  <CardDescription className="text-xs">{hint}</CardDescription>
                </div>
                <Switch
                  checked={form[enabledKey]}
                  disabled={!form.enabled}
                  onCheckedChange={(v) => setForm(f => ({ ...f, [enabledKey]: v }))}
                />
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <ExpandableTextarea
                rows={3}
                placeholder="Deja vacío para usar el mensaje por defecto de la plataforma"
                value={value}
                title={day}
                description={hint}
                onChange={(v) => setForm(f => ({ ...f, [key]: v }))}
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{value.length} caracteres</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => handleTest(key)}
                  disabled={testing !== null}
                >
                  <Send className="h-3 w-3" />
                  {testing === key ? 'Enviando…' : 'Probar a mi número'}
                </Button>
              </div>
              {/* Vista previa */}
              <div className="rounded-md bg-muted/50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vista previa</p>
                <p className="mt-0.5 text-sm whitespace-pre-wrap">{fillName(effective)}</p>
              </div>
            </CardContent>
          </Card>
        )
      })}

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={handleCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </Button>
      </div>
    </div>
  )
}
