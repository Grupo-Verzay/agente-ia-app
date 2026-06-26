'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  savePlatformBillingMessages,
  type PlatformBillingMessages,
} from '@/actions/admin/site-config-actions'
import { CreditCard, MessageCircle } from 'lucide-react'

interface Props {
  initial: PlatformBillingMessages
}

type MsgKey = keyof PlatformBillingMessages

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

export function PlatformBillingForm({ initial }: Props) {
  const [form, setForm] = useState<PlatformBillingMessages>(initial)
  const [saving, setSaving] = useState(false)

  const handleCancel = () => {
    setForm(initial)
    toast.message('Cambios descartados')
  }

  const handleSave = async () => {
    setSaving(true)
    const res = await savePlatformBillingMessages(form)
    setSaving(false)
    if (res.success) toast.success(res.message)
    else toast.error(res.message)
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Mensajes de cobro de la plataforma
          </CardTitle>
          <CardDescription className="mt-1 text-xs">
            Estos son los mensajes que se envían a tus clientes (y el estándar que heredan los resellers).
            Déjalo <b>vacío</b> para usar el texto por defecto. Placeholders:{' '}
            <code className="bg-muted px-1 rounded text-[11px]">{'{empresa} {fecha} {dias} {precio} {plan} {link}'}</code>.
          </CardDescription>
        </CardHeader>
      </Card>

      {MSGS.map(({ key, label, hint }) => {
        const value = form[key] ?? ''
        return (
          <Card key={key}>
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
                placeholder="Vacío = se usa el mensaje estándar por defecto. Escribe aquí solo si quieres personalizarlo."
                onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="resize-none text-sm"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {value.trim() ? `${value.length} caracteres (personalizado)` : 'Usando el mensaje estándar'}
                </span>
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
          {saving ? 'Guardando...' : 'Guardar mensajes'}
        </Button>
      </div>
    </div>
  )
}
