'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Save, Trash2, Wrench } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createTool, deleteTool, getTools, updateTool } from '@/actions/tools-action'
import { Tools } from '../tool-types'

const TOOLS = ['tool1', 'tool2', 'tool3', 'tool4', 'tool5'] as const

/**
 * Las cinco herramientas de un cliente, para vivir dentro del formulario de
 * edición igual que la clave de IA: sin `<form>` propio —anidarlo dentro del de
 * Editar no es HTML válido— y sin `name` en los campos, que si no viajarían en
 * el FormData de guardar el cliente.
 *
 * Cada herramienta se guarda por su cuenta con su botón, que es como funcionaba
 * cuando era un diálogo aparte: no dependen del "Guardar" de la ficha.
 */
export function ToolsEditor({ userId, activo }: { userId: string; activo: boolean }) {
  const router = useRouter()
  const [guardadas, setGuardadas] = useState<Record<string, string>>({})
  const [valores, setValores] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!activo) return

    let vigente = true
    getTools(userId).then((res) => {
      if (!vigente || !res.success || !res.data) return
      const ids: Record<string, string> = {}
      const textos: Record<string, string> = {}
      for (const tool of res.data) {
        ids[tool.name] = tool.id
        textos[tool.name] = tool.description || ''
      }
      setGuardadas(ids)
      setValores(textos)
    })
    return () => {
      vigente = false
    }
  }, [activo, userId])

  const guardar = async (id: Tools) => {
    const valor = valores[id]
    if (!valor) return

    const existente = guardadas[id]
    toast.loading('Guardando herramienta...', { id: 'tool' })
    const res = existente
      ? await updateTool(existente, id, valor)
      : await createTool(userId, id, valor)

    if (!res.success) {
      toast.error(res.message || 'No se pudo guardar la herramienta.', { id: 'tool' })
      return
    }
    toast.success('Herramienta guardada', { id: 'tool' })
    if (!existente && 'data' in res && res.data) {
      setGuardadas((prev) => ({ ...prev, [id]: res.data.id }))
    }
    router.refresh()
  }

  const borrar = async (id: Tools) => {
    const existente = guardadas[id]
    if (!existente) return toast.error('Esa herramienta no está guardada.')

    toast.loading('Eliminando herramienta...', { id: 'tool' })
    const res = await deleteTool(existente)
    if (!res.success) {
      toast.error(res.message || 'No se pudo eliminar la herramienta.', { id: 'tool' })
      return
    }
    toast.success('Herramienta eliminada', { id: 'tool' })
    setValores((prev) => ({ ...prev, [id]: '' }))
    setGuardadas((prev) => {
      const copia = { ...prev }
      delete copia[id]
      return copia
    })
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-2">
      {TOOLS.map((id, i) => {
        const existente = !!guardadas[id]
        return (
          <div key={id} className="flex items-center gap-2">
            <Wrench className="h-4 w-4 shrink-0 text-blue-500" />
            <Input
              placeholder={`Tool ${i + 1} — https://mytool.com`}
              value={valores[id] || ''}
              onChange={(e) => setValores((prev) => ({ ...prev, [id]: e.target.value }))}
            />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="shrink-0"
              title={existente ? 'Actualizar' : 'Guardar'}
              onClick={() => guardar(id as Tools)}
            >
              {existente ? <RefreshCw className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="shrink-0"
              title="Eliminar"
              onClick={() => borrar(id as Tools)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
