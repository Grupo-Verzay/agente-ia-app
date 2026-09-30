'use client'

import { useEffect, useState, useTransition } from 'react'
import type { CurrentUser } from '@/lib/auth';
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { deleteManual, createManual, updateManual, getManuals } from '@/actions/manual-actions'
import { z } from 'zod'
import { Textarea } from '@/components/ui/textarea'
import { Role } from '@prisma/client'
import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { BarraDeAcciones, BotonDeCrear } from '@/components/shared/BarraDeAcciones'
import { RejillaOrdenable, TarjetaOrdenable } from '@/components/shared/OrdenDeTarjetas'
import { useOrdenPropio } from '@/components/shared/OrdenPropio'
import { CabeceraDeDocumentacion } from '@/components/documentacion/CabeceraDeDocumentacion'
import { REJILLA_DE_DOCUMENTOS, TarjetaDeDocumento } from '@/components/documentacion/TarjetaDeDocumento'
import { coincideConLaBusqueda } from '@/lib/buscar-en-documentacion'
import type { OrdenGuardado } from '@/lib/orden-de-las-tarjetas'
import { GenericDeleteDialog } from '@/components/shared/GenericDeleteDialog'
interface MainGuideProps {
  user: CurrentUser
  /** Las guías públicas que deja la IA, ya pintadas. Solo llegan para la casa. */
  guiasPublicas?: Array<{ id: string; nombre: string; nodo: ReactNode }>
  /** El orden en que esta persona dejó esas guías. */
  ordenInicial?: OrdenGuardado
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

export function MainGuide({ user, guiasPublicas, ordenInicial }: MainGuideProps) {
  const orden = useOrdenPropio('guias-publicadas', ordenInicial ?? {})
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

  const esAdmin = user.role === Role.admin || user.role === Role.super_admin

  // Sin mirar mayúsculas ni tildes, igual que en Tutoriales.
  const filtered = manuals.filter(m => coincideConLaBusqueda(search, m.name, m.description))
  const colocadas = orden.colocar(guiasPublicas ?? [], (g) => g.id)
  const guiasQueSeVen = colocadas.filter((g) => coincideConLaBusqueda(search, g.nombre))
  // La lista ENTERA ya colocada: buscando, lo escondido conserva su sitio.
  const idsDeLasGuias = colocadas.map((g) => g.id)
  const hayBusqueda = search.trim().length > 0

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4" data-pantalla-de-guias>
        <CabeceraDeDocumentacion titulo="Guías" />

        {/* La barra de siempre: el buscador a la izquierda y el azul de crear
            a la DERECHA. Sin pestañas de otros módulos: el título ya dice
            dónde se está. */}
        <BarraDeAcciones
          buscador={
            <div className="relative w-56 sm:w-72">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar guía..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          }
          crear={
            esAdmin ? (
              <BotonDeCrear
                data-crear-guia
                onClick={() => {
                  setEditData(null)
                  setFormData({ name: '', description: '', url: '' })
                  setOpen(true)
                }}
              >
                Nuevo
              </BotonDeCrear>
            ) : undefined
          }
        />

        <div className="flex-1 min-h-0 space-y-6 overflow-auto py-1">
          {/* Las guías públicas que deja la IA (`/guia/<modulo>`). Solo la
              casa las ve, y cada persona las pone en su orden arrastrándolas. */}
          {guiasPublicas ? (
            <section className="space-y-2" data-seccion-guias-publicas>
              <h3 className="text-sm font-semibold text-muted-foreground">Guías publicadas</h3>
              {guiasQueSeVen.length > 0 ? (
                <RejillaOrdenable
                  ids={idsDeLasGuias}
                  puedeOrdenar
                  onMover={(todos, arrastrada, sobre) => void orden.mover(todos, arrastrada, sobre)}
                  className="grid gap-2"
                >
                  {guiasQueSeVen.map((g) => (
                    <TarjetaOrdenable key={g.id} id={g.id} puedeOrdenar asa="centro">
                      {g.nodo}
                    </TarjetaOrdenable>
                  ))}
                </RejillaOrdenable>
              ) : (
                <p className="text-sm text-muted-foreground">Ninguna guía publicada coincide con «{search.trim()}».</p>
              )}
            </section>
          ) : null}

          <section className="space-y-2" data-seccion-manuales>
            {guiasPublicas ? <h3 className="text-sm font-semibold text-muted-foreground">Manuales</h3> : null}
            {loading ? (
              <p className="py-10 text-center text-muted-foreground">Cargando guías…</p>
            ) : filtered.length > 0 ? (
              <div className={REJILLA_DE_DOCUMENTOS}>
                {filtered.map((manual) => (
                  <TarjetaDeDocumento
                    key={manual.id}
                    titulo={manual.name}
                    descripcion={manual.description}
                    alVer={() => window.open(manual.url, "_blank", "noopener,noreferrer")}
                    alEditar={esAdmin ? () => openEdit(manual) : undefined}
                    alEliminar={esAdmin ? () => handleOpenDeleteModal(manual.id) : undefined}
                  />
                ))}
              </div>
            ) : (
              <p className="py-10 text-center text-muted-foreground">
                {hayBusqueda ? `Ninguna guía coincide con «${search.trim()}».` : 'Todavía no hay guías.'}
              </p>
            )}
          </section>
        </div>
      </div>

      {esAdmin &&
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="border-border">
            <DialogHeader>
              <DialogTitle>{editData ? 'Editar guía' : 'Crear guía'}</DialogTitle>
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

      {templateId && (
        <GenericDeleteDialog
          open={showDeleteDialog}
          itemName="Guía"
          entityLabel="Guía"
          setOpen={setShowDeleteDialog}
          itemId={templateId}
          mutationFn={(id) => handleDelete(id)}
        />
      )}
    </>
  )
}
