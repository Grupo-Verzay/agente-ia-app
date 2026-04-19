'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { deleteManual, createManual, updateManual, getManuals } from '@/actions/manual-actions'
import { z } from 'zod'
import { Textarea } from '@/components/ui/textarea'
import { User, Manual, Role } from '@prisma/client'
import { Edit2Icon, Eye, Pencil, Search, Trash2 } from 'lucide-react'
import Header from '@/components/shared/header'
import { GenericDeleteDialog } from '@/components/shared/GenericDeleteDialog'
interface MainGuideProps {
  user: User
}

type ManualClient = {
  id: string
  name: string
  description?: string | null
  url: string
}

const manualFormSchema = z.object({
  name: z.string().min(3, 'El nombre del manual es obligatorio.'),
  url: z.string().url('La URL del manual no es válida.'),
})

export function MainGuide({ user }: MainGuideProps) {
  const [manuals, setManuals] = useState<ManualClient[]>([])

  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()

  const [loading, setLoading] = useState(true);

  const [editData, setEditData] = useState<ManualClient | null>(null)
  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState({ name: '', description: '', url: '' })

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [templateId, setTemplateId] = useState<string>()

  const fetchManuals = async () => {
    setLoading(true)
    const res = await getManuals()
    if (res.success && Array.isArray(res.data)) {
      setManuals(res.data)
    } else {
      toast.error(res.message)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchManuals()
  }, [])

  const handleCreate = async () => {
    startTransition(async () => {
      const res = await createManual('userId', formData)
      if (res.success) {
        toast.success(res.message)
        setFormData({ name: '', description: '', url: '' })
        setOpen(false)
        fetchManuals()
      } else toast.error(res.message)
    })
  }

  const handleUpdate = async () => {
    startTransition(async () => {
      if (!editData) return;
      const res = await updateManual({
        id: editData.id,
        name: formData.name,
        description: formData.description,
        url: formData.url, // ⬅️ agregar esto
      })
      if (res.success) {
        toast.success(res.message)
        setEditData(null)
        setFormData({ name: '', description: '', url: '' })
        setOpen(false)
        fetchManuals()
      } else toast.error(res.message)
    })
  }

  const handleDelete = async (id: string) => {
    const res = await deleteManual(id);

    if (res.success) {
      toast.success(res.message);
      fetchManuals();
    } else {
      toast.error(res.message);
    }

    return res;
  };

  const openEdit = (manual: ManualClient) => {
    setEditData(manual)
    setFormData({ name: manual.name, description: manual.description || '', url: manual.url || '' })
    setOpen(true)
  }

  const handleOpenDeleteModal = (templateId: string) => {
    setTemplateId(templateId)
    setShowDeleteDialog(true)
  }

  const filtered = manuals.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <>
      <div className="flex flex-col p-4 gap-6 overflow-hidden">
        <Header
          title="Guías"
        />
        {/* Header y Filtro */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between overflow-hidden">
          <div className="flex flex-1 gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar guía..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {(user.role === Role.admin || user.role === Role.super_admin) &&
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => {
                      setEditData(null) // ⬅️ importante
                      setFormData({ name: '', description: '', url: '' }) // ⬅️ limpio para crear
                    }}
                  >
                    Crear Guía
                  </Button>
                </DialogTrigger>

                <DialogContent className="border-border">
                  <DialogHeader>
                    <DialogTitle>{editData ? 'Editar Manual' : 'Crear Manual'}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input placeholder="Nombre" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                    <Textarea placeholder="Descripción" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                    <Input placeholder="https://medias3.verzay.co/verzay-documentation/..." value={formData.url} onChange={(e) => setFormData({ ...formData, url: e.target.value })} />
                  </div>
                  <DialogFooter>
                    <Button onClick={editData ? handleUpdate : handleCreate} disabled={isPending}>
                      {isPending ? 'Guardando...' : editData ? 'Actualizar' : 'Crear'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            }
          </div>
        </div>


        {/* Cards */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <p className="text-muted-foreground">Loading manual...</p>
          </div>
        ) : (
          <div className="flex-1">
            <div className="max-h-[80vh] overflow-auto py-2">
              <div className="flex flex-wrap flex-1 gap-2 justify-center">
                {filtered.map((manual) => (
                  <Card
                    key={manual.id}
                    className="flex flex-col border-border transition-all duration-300 hover:shadow-lg hover:scale-[1.015] hover:border-primary w-64">
                    <CardHeader>
                      <CardTitle>{manual.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-1 justify-stretch items-center">
                      <p className="text-sm text-muted-foreground">{manual.description}</p>
                    </CardContent>
                    <CardFooter className="flex mt-auto gap-2 w-full">
                      <Button
                        className="w-full"
                        onClick={() => window.open(manual.url, "_blank")}
                        rel="noopener noreferrer"
                      >
                        {(user.role === Role.admin || user.role === Role.super_admin) ? <Eye /> : 'Ver'}
                      </Button>
                      {(user.role === Role.admin || user.role === Role.super_admin) &&
                        <>
                          <Button
                            variant="secondary"
                            className="w-full"
                            onClick={() => openEdit(manual)}
                          >
                            <Pencil />
                          </Button>

                          <Button
                            variant="destructive"
                            className="w-full"
                            onClick={() => handleOpenDeleteModal(manual.id)}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      }
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {templateId && (
        <GenericDeleteDialog
          open={showDeleteDialog}
          itemName="Plantilla"
          entityLabel="Plantilla"
          setOpen={setShowDeleteDialog}
          itemId={templateId}
          mutationFn={(id) => handleDelete(id)}
        />
      )}
    </>

  )
}
