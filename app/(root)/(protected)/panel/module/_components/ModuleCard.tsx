'use client'

import { useState } from 'react'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    ShieldCheck,
    EyeOff,
    Eye,
    Star,
    Edit2Icon,
    Trash2,
    GripVertical
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { iconMap, ModuleWithItems } from '@/schema/module'
import { GenericDeleteDialog } from '@/components/shared/GenericDeleteDialog'
import { deleteModule } from '@/actions/module-actions'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"

export const ModuleCard = ({
    module: moduleComponent,
    setOpenModule
}: {
    module: ModuleWithItems
    setOpenModule: (state: boolean, module: ModuleWithItems) => void
}) => {
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const Icon = iconMap[moduleComponent.icon as keyof typeof iconMap]

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition
    } = useSortable({ id: moduleComponent.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <Card
            ref={setNodeRef}
            style={style}
            className="relative flex flex-col justify-between min-h-[280px] border border-border rounded-xl shadow-sm bg-background p-4"
        >
            {/* Drag handle */}
            <div
                className="absolute left-3 top-3 z-10 cursor-grab"
                {...attributes}
                {...listeners}
            >
                <GripVertical className="w-4 h-4 text-muted-foreground" />
            </div>

            <CardHeader className="pl-8 pr-4 pt-2 pb-1">
                <CardTitle className="flex items-center gap-2 text-lg">
                    {Icon && <Icon className="h-5 w-5 text-primary" />}
                    {moduleComponent.label}
                </CardTitle>
                <p className="text-xs text-muted-foreground truncate">{moduleComponent.route}</p>
            </CardHeader>

            <CardContent className="pl-8 pr-4 pt-2 pb-2 space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                    {moduleComponent.adminOnly && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                            <ShieldCheck className="h-4 w-4" /> Admin
                        </Badge>
                    )}
                    {moduleComponent.requiresPremium && (
                        <Badge variant="default" className="flex items-center gap-1">
                            <Star className="h-4 w-4" /> Premium
                        </Badge>
                    )}
                    {moduleComponent.showInSidebar ? (
                        <Badge variant="outline" className="flex items-center gap-1">
                            <Eye className="h-4 w-4" /> Sidebar
                        </Badge>
                    ) : (
                        <Badge variant="destructive" className="flex items-center gap-1">
                            <EyeOff className="h-4 w-4" /> Oculto
                        </Badge>
                    )}
                </div>

                {moduleComponent.allowedPlans?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                        {moduleComponent.allowedPlans.map(plan => (
                            <Badge key={plan} variant="outline" className="text-xs">
                                {plan}
                            </Badge>
                        ))}
                    </div>
                )}

                {moduleComponent.moduleItems?.length > 0 && (
                    <Accordion type="single" collapsible className="pt-1">
                        <AccordionItem value="items">
                            <AccordionTrigger className="text-sm text-muted-foreground hover:no-underline">
                                Ver submódulos ({moduleComponent.moduleItems.length})
                            </AccordionTrigger>
                            <AccordionContent>
                                <ul className="list-disc list-inside text-muted-foreground text-xs space-y-1">
                                    {moduleComponent.moduleItems.map((item, index) => (
                                        <li key={index}>
                                            <span className="font-medium">{item.title}</span> –{' '}
                                            <span className="text-muted-foreground">{item.url}</span>
                                        </li>
                                    ))}
                                </ul>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                )}
            </CardContent>

            <div className="flex justify-end gap-2 pt-2 px-4">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setOpenModule(true, moduleComponent)}
                >
                    <Edit2Icon className="w-4 h-4" />
                </Button>
                <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => setShowDeleteDialog(true)}
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            </div>

            <GenericDeleteDialog
                open={showDeleteDialog}
                setOpen={setShowDeleteDialog}
                itemName="modulo"
                itemId={moduleComponent.id}
                mutationFn={() => deleteModule(moduleComponent.id)}
                entityLabel="modulo"
            />
        </Card>
    )
}