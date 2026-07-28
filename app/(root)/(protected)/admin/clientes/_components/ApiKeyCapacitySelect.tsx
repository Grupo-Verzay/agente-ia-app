'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  getEvolutionCapacity,
  pickApiKeyWithCapacity,
  type EvolutionServerCapacity,
} from '@/actions/admin/evolution-capacity'
import { Wand2 } from 'lucide-react'
import type { ApiKey } from '@prisma/client'

interface Props {
  apikeys: ApiKey[]
  /** Para formularios que se envían con FormData (diálogo de edición). */
  name?: string
  defaultValue?: string
  disabled?: boolean
  placeholder?: string
  /** Para formularios controlados (diálogo de creación). */
  onChange?: (apiKeyId: string) => void
}

/**
 * Selector de servidor de Evolution que muestra cuánto le queda a cada uno.
 *
 * Antes solo listaba URLs. Elegir servidor era entonces adivinar: no había forma
 * de saber cuál estaba lleno, así que se seguía cargando el mismo hasta que
 * empezaba a fallar, y eso se descubría por clientes con la línea caída.
 *
 * La ocupación se consulta en vivo. Los llenos se ven y no se pueden elegir, y el
 * botón "Automático" asigna el primero con cupo, que es lo que se quiere el 95%
 * de las veces.
 */
export function ApiKeyCapacitySelect({
  apikeys,
  name,
  defaultValue,
  disabled,
  placeholder,
  onChange,
}: Props) {
  const [valor, setValor] = useState(defaultValue ?? '')
  const [ocupacion, setOcupacion] = useState<EvolutionServerCapacity[]>([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    let vigente = true
    setCargando(true)
    void getEvolutionCapacity()
      .then((res) => {
        if (vigente && res.success) setOcupacion(res.data)
      })
      .catch(() => {
        // Sin ocupación el selector sigue funcionando como antes: solo URLs.
        // Es peor bloquear la creación de un cliente que dejar elegir a ciegas.
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [])

  const porId = useMemo(
    () => new Map(ocupacion.map((s) => [s.apiKeyId, s])),
    [ocupacion],
  )

  const etiqueta = (id: string, url: string) => {
    const estado = porId.get(id)
    if (!estado) return url
    if (estado.total === null) return `${url} — sin respuesta`
    return `${url} — ${estado.total}/${estado.limite}${estado.lleno ? ' (lleno)' : ''}`
  }

  const elegir = (id: string) => {
    setValor(id)
    onChange?.(id)
  }

  const asignarAutomatico = async () => {
    const res = await pickApiKeyWithCapacity()
    if (!res.success || !res.apiKeyId) {
      toast.error(res.message)
      return
    }
    elegir(res.apiKeyId)
    toast.success(res.message)
  }

  return (
    <div className="flex items-center gap-2">
      {/* El valor viaja en un input oculto: el Select de Radix no envía nada por
          sí mismo en un formulario que se lee con FormData. */}
      {name && <input type="hidden" name={name} value={valor} />}

      <Select value={valor} onValueChange={elegir} disabled={disabled}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder={cargando ? 'Cargando ocupación...' : (placeholder ?? 'Selecciona una API Key')} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {apikeys.map(({ id, url }) => {
              const estado = porId.get(id)
              // Un servidor lleno no se puede elegir, salvo que ya sea el que el
              // cliente tiene: bloquearlo ahí impediría guardar cualquier otro
              // cambio de ese cliente por un motivo que no viene al caso.
              const bloqueado = Boolean(estado?.lleno) && id !== defaultValue
              return (
                <SelectItem key={id} value={id} disabled={bloqueado}>
                  {etiqueta(id, url)}
                </SelectItem>
              )
            })}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={asignarAutomatico}
        disabled={disabled || cargando}
        title="Asignar el primer servidor con cupo"
      >
        <Wand2 className="h-4 w-4" />
      </Button>
    </div>
  )
}
