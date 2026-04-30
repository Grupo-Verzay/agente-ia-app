'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { X, Search } from 'lucide-react'
import { toast } from 'sonner'

import { PromptTemplateForm, PromptTemplateFormValues } from './PromptTemplateForm'
import { TemplateCardSkeleton, TemplateList } from './'
import { PromptTemplate, Role } from '@prisma/client'
import { createTemplate, deleteTemplate, getAllTemplates, updateTemplate } from '@/actions/template-actions'
import { GenericDeleteDialog } from '@/components/shared/GenericDeleteDialog'
import { MetricCard } from '@/components/custom/MetricCard'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FileText, CheckCircle, XCircle } from 'lucide-react'

export const MainTemplate = ({ userRole }: { userRole: Role }) => {
    const router = useRouter()
    const [templates, setTemplates] = useState<PromptTemplate[]>([])
    const [templateId, setTemplateId] = useState<string>()
    const [filteredTemplates, setFilteredTemplates] = useState<PromptTemplate[]>([])
    const [search, setSearch] = useState('')
    const [modalOpen, setModalOpen] = useState(false)
    const [editTemplate, setEditTemplate] = useState<PromptTemplate | undefined>()
    const [isPending, startTransition] = useTransition()
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)

    useEffect(() => {
        startTransition(async () => {
            const res = await getAllTemplates()
            if (res.success && res.data) {
                setTemplates(res.data)
                setFilteredTemplates(res.data)
            } else {
                toast.error(res.message)
            }
        })
    }, [])

    useEffect(() => {
        const filtered = templates.filter((t) =>
            t.name.toLowerCase().includes(search.toLowerCase())
        )
        setFilteredTemplates(filtered)
    }, [search, templates])

    const normalizeTemplate = (template: PromptTemplate): PromptTemplateFormValues => ({
        name: template.name,
        content: template.content,
        description: template.description ?? undefined,
        category: template.category ?? undefined,
        isActive: template.isActive,
    })

    const handleOpenModal = (template?: PromptTemplate) => {
        setEditTemplate(template)
        setModalOpen(true)
    }

    const handleOpenDeleteModal = (templateId: string) => {
        setTemplateId(templateId)
        setShowDeleteDialog(true)
    }

    const handleCloseModal = () => {
        setEditTemplate(undefined)
        setModalOpen(false)
    }

    const onSubmit = async (data: any) => {
        toast.loading('Guardando plantilla...', { id: 'template-toast' })
        const isEditing = !!editTemplate

        startTransition(async () => {
            try {
                const res = isEditing
                    ? await updateTemplate({ ...data, id: editTemplate!.id })
                    : await createTemplate(data)

                if (res.success) {
                    toast.success(res.message, { id: 'template-toast' })
                    router.refresh()
                    setTemplates((prev) => {
                        if (isEditing) {
                            return prev.map((t) => (t.id === editTemplate!.id ? { ...t, ...data } : t))
                        } else {
                            return [...prev, { ...data, id: 'temp-id', createdAt: new Date(), updatedAt: new Date() }]
                        }
                    })
                    handleCloseModal()
                } else {
                    toast.error(res.message, { id: 'template-toast' })
                }
            } catch (error) {
                toast.error('Error inesperado al guardar')
            }
        })
    }

    const activasCount = templates.filter(t => t.isActive).length;
    const inactivasCount = templates.filter(t => !t.isActive).length;

    return (
        <TooltipProvider delayDuration={120}>
        <div className="flex h-full min-w-0 flex-col gap-2">
            {/* MetricCards */}
            <div className="flex flex-wrap gap-3">
                <div className="flex-1">
                    <MetricCard
                        icon={<FileText className="h-4 w-4" />}
                        label="Total plantillas"
                        value={templates.length}
                        helper="Plantillas configuradas en la plataforma"
                        color="#3B82F6"
                    />
                </div>
                <div className="flex-1">
                    <MetricCard
                        icon={<CheckCircle className="h-4 w-4" />}
                        label="Activas"
                        value={activasCount}
                        helper="Plantillas disponibles para uso"
                        color="#22C55E"
                    />
                </div>
                <div className="flex-1">
                    <MetricCard
                        icon={<XCircle className="h-4 w-4" />}
                        label="Inactivas"
                        value={inactivasCount}
                        helper="Plantillas deshabilitadas"
                        color="#EF4444"
                    />
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar plantilla..."
                        className="pl-8"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                {(userRole === 'admin' || userRole === 'super_admin') && (
                    <Button onClick={() => handleOpenModal()}>Crear plantilla</Button>
                )}
            </div>


            <div className="flex-1">
                <div className="overflow-auto py-2">
                    <div className="flex flex-wrap flex-1 gap-2 justify-center">
                        {isPending ? (
                            <TemplateCardSkeleton />
                        ) : (
                            <TemplateList
                                templates={filteredTemplates}
                                onEdit={handleOpenModal}
                                onDelete={handleOpenDeleteModal}
                                userRole={userRole}
                            />
                        )}
                    </div>
                </div>
            </div>

            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="max-w-2xl p-0 border-border">
                    <DialogHeader className="px-6 pt-4 flex flex-row items-center justify-between">
                        <DialogTitle>
                            {editTemplate ? 'Editar plantilla' : 'Crear plantilla'}
                        </DialogTitle>
                    </DialogHeader>

                    <ScrollArea className="max-h-[85vh]">
                        <PromptTemplateForm
                            onSubmit={onSubmit}
                            defaultValues={editTemplate ? normalizeTemplate(editTemplate) : undefined}
                        />
                    </ScrollArea>

                    <DialogFooter className="px-6 pb-4">
                        <Button form="prompt-form" type="submit" className="w-full">
                            {editTemplate ? 'Guardar cambios' : 'Crear plantilla'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {templateId &&
                <GenericDeleteDialog
                    open={showDeleteDialog}
                    itemName="Plantilla"
                    entityLabel="Plantilla"
                    setOpen={setShowDeleteDialog}
                    itemId={templateId}
                    mutationFn={() => deleteTemplate(templateId)}
                />
            }
        </div>
        </TooltipProvider>
    )
}
