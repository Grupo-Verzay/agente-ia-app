'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Save,
  RefreshCw,
  Trash2
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createTool, getTools, updateTool, deleteTool } from '@/actions/tools-action'
import { toast } from 'sonner'
import { Tools } from '../tool-types'
import { Button } from '@/components/ui/button'

import { ClientInterface } from '@/lib/types'

interface Props {
  user: ClientInterface
  openToolsDialog: boolean
  setOpenToolsDialog: (open: boolean) => void
}

import { Wrench } from 'lucide-react'

const toolConfig = [
  {
    id: 'tool1',
    label: 'Tool 1',
    placeholder: 'https://mytool.com',
    icon: <Wrench className="w-5 h-5 text-blue-500" />
  },
  {
    id: 'tool2',
    label: 'Tool 2',
    placeholder: 'https://mytool.com',
    icon: <Wrench className="w-5 h-5 text-blue-500" />
  },
  {
    id: 'tool3',
    label: 'Tool 3',
    placeholder: 'https://mytool.com',
    icon: <Wrench className="w-5 h-5 text-blue-500" />
  },
  {
    id: 'tool4',
    label: 'Tool 4',
    placeholder: 'https://mytool.com',
    icon: <Wrench className="w-5 h-5 text-blue-500" />
  },
  {
    id: 'tool5',
    label: 'Tool 5',
    placeholder: 'https://mytool.com',
    icon: <Wrench className="w-5 h-5 text-blue-500" />
  },
] as const

export const ToolsDialog = ({
  user,
  openToolsDialog,
  setOpenToolsDialog
}: Props) => {
  const router = useRouter()
  const [userTools, setUserTools] = useState<Record<string, { id: string, description: string }>>({})
  const [formValues, setFormValues] = useState<Record<string, string>>({})

  useEffect(() => {
    const loadTools = async () => {
      if (!openToolsDialog) return

      const response = await getTools(user.id)
      if (!response.success || !response.data) return

      const toolsMap: Record<string, { id: string, description: string }> = {}
      const values: Record<string, string> = {}

      for (const tool of response.data) {
        toolsMap[tool.name] = { id: tool.id, description: tool.description || '' }
        values[tool.name] = tool.description || ''
      };

      setUserTools(toolsMap);
      setFormValues(values);
    }

    loadTools()
  }, [openToolsDialog, user.id])

  const handleChange = (id: string, value: string) => {
    setFormValues(prev => ({ ...prev, [id]: value }))
  }

  const handleUpdate = async (toolId: Tools) => {
    const dbId = userTools[toolId]?.id
    const value = formValues[toolId]

    if (!dbId || !value) return toast.error('No se puede actualizar, faltan datos.')

    toast.loading('Actualizando herramienta...', { id: 'update-tool' })
    const result = await updateTool(dbId, toolId, value)

    if (result.success) {
      toast.success('Herramienta actualizada', { id: 'update-tool' })
      router.refresh()
    } else {
      toast.error(result.message, { id: 'update-tool' })
    }
  }

  const handleDelete = async (toolId: Tools) => {
    const dbId = userTools[toolId]?.id
    if (!dbId) return toast.error('No se puede eliminar esta herramienta.')

    toast.loading('Eliminando herramienta...', { id: 'delete-tool' })
    const result = await deleteTool(dbId)

    if (result.success) {
      toast.success('Herramienta eliminada', { id: 'delete-tool' })
      setFormValues(prev => ({ ...prev, [toolId]: '' }))
      setUserTools(prev => {
        const copy = { ...prev }
        delete copy[toolId]
        return copy
      })
    } else {
      toast.error(result.message, { id: 'delete-tool' })
    }
  }

  const handleCreate = async (toolId: Tools) => {
    const value = formValues[toolId]
    if (!value) return

    toast.loading('Creando herramienta...', { id: 'create-tool' })
    const result = await createTool(user.id, toolId, value)

    if (result.success && result.data) {
      toast.success('Herramienta creada', { id: 'create-tool' })

      // Actualizar estado local inmediatamente
      setUserTools(prev => ({
        ...prev,
        [toolId]: {
          id: result.data.id,
          description: result.data.description || ''
        }
      }))

      router.refresh()
    } else {
      toast.error(result.message || 'Error al crear herramienta', { id: 'create-tool' })
    }
  }

  return (
    <Dialog open={openToolsDialog} onOpenChange={setOpenToolsDialog}>
      <DialogContent className="max-w-4xl">
        <DialogHeader className="flex justify-between items-center">
          <DialogTitle className="text-2xl">Gestor de herramientas</DialogTitle>
        </DialogHeader>

        <form className="space-y-6 mt-4 px-2 pb-4">
          {toolConfig.map(({ id, label, placeholder, icon }) => {
            const isNewValue = !userTools[id]
            return (
              <div key={id}>
                <Label className="flex items-center gap-2 mb-1">
                  {icon} {label}
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder={placeholder}
                    value={formValues[id] || ''}
                    onChange={(e) => handleChange(id, e.target.value)}
                  />
                  <div className="flex items-center gap-1">
                    {
                      isNewValue &&
                      <Button type="button" variant="secondary" onClick={() => handleCreate(id as Tools)}>
                        <Save className="w-4 h-4" />
                      </Button>
                    }
                    {
                      !isNewValue &&
                      <Button type="button" variant="secondary" onClick={() => handleUpdate(id as Tools)}>
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    }
                    <Button type="button" variant="destructive" onClick={() => handleDelete(id as Tools)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {/* <p className="text-sm text-muted-foreground mt-1">{description}</p> */}
              </div>
            )
          })}
        </form>

        <DialogFooter>
          <Button variant="destructive" onClick={() => setOpenToolsDialog(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}