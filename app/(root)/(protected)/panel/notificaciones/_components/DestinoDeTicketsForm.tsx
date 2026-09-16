'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, LifeBuoy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
  cuentasParaDestinoAction,
  guardarElDestinoAction,
} from '@/actions/tickets-actions'

/**
 * A qué cuenta caen los tickets de soporte de toda la plataforma.
 *
 * Es UN destino, no uno por reseller: el encargo lo dice en singular. Si algún
 * día los clientes de un reseller tienen que ir a su reseller, eso es una tabla
 * de correspondencia encima de esto, no un rehacer.
 *
 * **Sin destino no hay botón**: el flotante no se pinta y nadie puede abrir un
 * ticket. Es mejor que un botón que guarda en la nada — eso deja al cliente
 * esperando una respuesta que nadie va a ver.
 */
export function DestinoDeTicketsForm({
  initial,
}: {
  initial: { destinoId: string | null; nombre: string | null }
}) {
  const [destinoId, setDestinoId] = useState(initial.destinoId)
  const [nombre, setNombre] = useState(initial.nombre)
  const [cuentas, setCuentas] = useState<Array<{ id: string; nombre: string }>>([])
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    let vivo = true
    void (async () => {
      setCargando(true)
      try {
        const res = await cuentasParaDestinoAction()
        if (vivo && res.success) setCuentas(res.data ?? [])
      } catch (e) {
        // Sin lista se puede seguir viendo el destino actual; sin aviso, no se
        // sabe por qué el desplegable sale vacío.
        console.warn('[tickets] no se pudieron cargar las cuentas de destino', e)
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  const guardar = async (id: string | null) => {
    setGuardando(true)
    try {
      const res = await guardarElDestinoAction(id)
      if (!res.success) {
        toast.error(res.message)
        return
      }
      setDestinoId(id)
      setNombre(id ? (cuentas.find((c) => c.id === id)?.nombre ?? null) : null)
      toast.success(res.message)
    } catch (e) {
      console.warn('[tickets] no se pudo guardar el destino', e)
      toast.error('No se pudo guardar el destino.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <LifeBuoy className="h-5 w-5 text-primary" />
          Tickets de soporte
        </CardTitle>
        <CardDescription>
          La cuenta que recibe las solicitudes de soporte de los clientes. Sin ella, el botón de
          soporte no se muestra a nadie.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Cuenta que los atiende</Label>
          <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={abierto}
                disabled={guardando}
                className="w-full justify-between font-normal"
              >
                <span className="truncate">
                  {guardando ? 'Guardando…' : (nombre ?? destinoId ?? 'Sin destino')}
                </span>
                {cargando ? (
                  <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
                ) : (
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[--radix-popover-trigger-width] p-0"
              // Un menú con una lista dentro va con su propio tope, y el tope es
              // el hueco de verdad, no `vh`: con el botón abajo del todo, `70vh`
              // abre un menú que se sale por arriba.
              style={{ maxHeight: 'min(70vh, var(--radix-popover-content-available-height))' }}
            >
              <Command>
                <CommandInput placeholder="Buscar cuenta…" />
                <CommandList>
                  <CommandEmpty>Ninguna cuenta.</CommandEmpty>
                  <CommandGroup>
                    {cuentas.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`${c.nombre} ${c.id}`}
                        onSelect={() => {
                          setAbierto(false)
                          void guardar(c.id)
                        }}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${destinoId === c.id ? 'opacity-100' : 'opacity-0'}`}
                        />
                        <span className="truncate">{c.nombre}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {destinoId && !nombre && (
          // Que el nombre no se pueda resolver significa que esa cuenta ya no
          // existe, y entonces los tickets caen donde nadie los mira.
          <p className="text-xs text-amber-600">
            No se encontró esa cuenta. Elige otra o los tickets no los verá nadie.
          </p>
        )}

        {destinoId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={guardando}
            onClick={() => void guardar(null)}
            className="text-xs text-muted-foreground"
          >
            Quitar destino
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
