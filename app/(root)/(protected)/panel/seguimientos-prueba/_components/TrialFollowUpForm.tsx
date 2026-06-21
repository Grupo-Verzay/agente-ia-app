'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { saveTrialFollowUpConfig, type TrialFollowUpConfigData } from '@/actions/trial-followup-actions'
import { MessageCircle, Zap } from 'lucide-react'

interface Props {
  initial: {
    enabled: boolean
    instanceName: string
    message1: string
    message3: string
    message6: string
  }
}

const DAY_LABELS: Record<string, { day: string; hint: string }> = {
  message1: { day: 'Día 1', hint: 'Primer contacto — bienvenida y disposición a ayudar' },
  message3: { day: 'Día 3', hint: 'Seguimiento — ver cómo va la experiencia y ofrecer apoyo' },
  message6: { day: 'Día 6', hint: 'Cierre — recordar que la prueba termina y motivar a contratar' },
}

export function TrialFollowUpForm({ initial }: Props) {
  const [form, setForm] = useState<TrialFollowUpConfigData>({
    enabled: initial.enabled,
    instanceName: initial.instanceName ?? '',
    message1: initial.message1 ?? '',
    message3: initial.message3 ?? '',
    message6: initial.message6 ?? '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const res = await saveTrialFollowUpConfig(form)
    setSaving(false)
    if (res.success) toast.success(res.message)
    else toast.error(res.message)
  }

  return (
    <div className="flex flex-col gap-4 p-4">
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
            <Label className="text-xs font-semibold">Instancia Evolution (opcional)</Label>
            <Input
              placeholder="Ej: VERZAY_PRINCIPAL — vacío = usa la instancia central de la plataforma"
              value={form.instanceName}
              onChange={(e) => setForm(f => ({ ...f, instanceName: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">
              Si dejas este campo vacío, los mensajes saldrán desde el número central configurado en la plataforma.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Mensajes por día */}
      {(['message1', 'message3', 'message6'] as const).map((key) => (
        <Card key={key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-green-500" />
              {DAY_LABELS[key].day}
            </CardTitle>
            <CardDescription className="text-xs">{DAY_LABELS[key].hint}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Textarea
              rows={3}
              placeholder="Deja vacío para usar el mensaje por defecto de la plataforma"
              value={form[key]}
              onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
              className="resize-none text-sm"
            />
          </CardContent>
        </Card>
      ))}

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? 'Guardando...' : 'Guardar configuración'}
      </Button>
    </div>
  )
}
