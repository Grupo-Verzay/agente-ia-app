'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RefreshCw, Save, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Bot } from 'lucide-react'
import { ClientInterface } from '@/lib/types'
import {
  createEvoUrl,
  deleteEvoUrl,
  getEvoUrls,
  updateEvoUrl,
  EvoSlot,
} from '@/actions/evo-url-action'

interface Props {
  user: ClientInterface
  openEvoDialog: boolean
  setOpenEvoDialog: (open: boolean) => void
}

const evoConfig = [
  { id: 'evo1', label: 'Evo 1', placeholder: 'https://evoapi.miservidor.com/manager' },
  { id: 'evo2', label: 'Evo 2', placeholder: 'https://evoapi.miservidor.com/manager' },
  { id: 'evo3', label: 'Evo 3', placeholder: 'https://evoapi.miservidor.com/manager' },
  { id: 'evo4', label: 'Evo 4', placeholder: 'https://evoapi.miservidor.com/manager' },
  { id: 'evo5', label: 'Evo 5', placeholder: 'https://evoapi.miservidor.com/manager' },
] as const

export const EvoDialog = ({ user, openEvoDialog, setOpenEvoDialog }: Props) => {
  const router = useRouter()
  const [userEvos, setUserEvos] = useState<Record<string, { id: string; description: string }>>({})
  const [formValues, setFormValues] = useState<Record<string, string>>({})

  useEffect(() => {
    const loadEvos = async () => {
      if (!openEvoDialog) return

      const response = await getEvoUrls(user.id)
      if (!response.success || !response.data) return

      const evosMap: Record<string, { id: string; description: string }> = {}
      const values: Record<string, string> = {}

      for (const evo of response.data) {
        evosMap[evo.name] = { id: evo.id, description: evo.description || '' }
        values[evo.name] = evo.description || ''
      }

      setUserEvos(evosMap)
      setFormValues(values)
    }

    loadEvos()
  }, [openEvoDialog, user.id])

  const handleChange = (id: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [id]: value }))
  }

  const handleCreate = async (slot: EvoSlot) => {
    const value = formValues[slot]
    if (!value) return

    toast.loading('Creando EVO...', { id: 'create-evo' })
    const result = await createEvoUrl(user.id, slot, value)

    if (result.success && result.data) {
      toast.success('EVO creado', { id: 'create-evo' })
      setUserEvos((prev) => ({
        ...prev,
        [slot]: { id: result.data.id, description: result.data.description || '' },
      }))
      router.refresh()
    } else {
      toast.error(result.message || 'Error al crear EVO', { id: 'create-evo' })
    }
  }

  const handleUpdate = async (slot: EvoSlot) => {
    const dbId = userEvos[slot]?.id
    const value = formValues[slot]
    if (!dbId || !value) return toast.error('No se puede actualizar, faltan datos.')

    toast.loading('Actualizando EVO...', { id: 'update-evo' })
    const result = await updateEvoUrl(dbId, slot, value)

    if (result.success) {
      toast.success('EVO actualizado', { id: 'update-evo' })
      router.refresh()
    } else {
      toast.error(result.message, { id: 'update-evo' })
    }
  }

  const handleDelete = async (slot: EvoSlot) => {
    const dbId = userEvos[slot]?.id
    if (!dbId) return toast.error('No hay EVO guardado para eliminar.')

    toast.loading('Eliminando EVO...', { id: 'delete-evo' })
    const result = await deleteEvoUrl(dbId)

    if (result.success) {
      toast.success('EVO eliminado', { id: 'delete-evo' })
      setFormValues((prev) => ({ ...prev, [slot]: '' }))
      setUserEvos((prev) => {
        const copy = { ...prev }
        delete copy[slot]
        return copy
      })
    } else {
      toast.error(result.message, { id: 'delete-evo' })
    }
  }

  return (
    <Dialog open={openEvoDialog} onOpenChange={setOpenEvoDialog}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Gestor de EVO</DialogTitle>
        </DialogHeader>

        <form className="space-y-6 mt-4 px-2 pb-4">
          {evoConfig.map(({ id, label, placeholder }) => {
            const isNew = !userEvos[id]
            return (
              <div key={id}>
                <Label className="flex items-center gap-2 mb-1">
                  <Bot className="w-5 h-5 text-green-500" />
                  {label}
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder={placeholder}
                    value={formValues[id] || ''}
                    onChange={(e) => handleChange(id, e.target.value)}
                  />
                  <div className="flex items-center gap-1">
                    {isNew && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleCreate(id as EvoSlot)}
                      >
                        <Save className="w-4 h-4" />
                      </Button>
                    )}
                    {!isNew && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleUpdate(id as EvoSlot)}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => handleDelete(id as EvoSlot)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </form>

        <DialogFooter>
          <Button variant="destructive" onClick={() => setOpenEvoDialog(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
