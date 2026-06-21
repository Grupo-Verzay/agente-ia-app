"use client"

import { SubmitHandler, useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import type { CheckedState } from "@radix-ui/react-checkbox"
import { FormModuleSchema, FormModuleValues, iconMap } from "@/schema/module"
import { GripVertical, Trash2, Lock } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { navigationRoutes } from "@/lib/navigation-routes"
import { PLAN_LABELS, PLANS } from "@/types/plans"
import { Label } from "@/components/ui/label"
import {
    DndContext,
    closestCenter,
    useSensor,
    useSensors,
    PointerSensor,
    type DragEndEvent,
} from "@dnd-kit/core"
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

const labelMap: Record<string, string> = {
    showInSidebar: 'Mostrar en Sidebar',
    adminOnly: 'Solo Admin',
    requiresPremium: 'Requiere Premium',
}

import { Plan } from "@prisma/client"

function SortableSubmodule({
    id,
    index,
    url,
    titleValue,
    customUrlValue,
    lockedPlans,
    onRemove,
    onUrlChange,
    onTitleChange,
    onCustomUrlChange,
    onLockedPlansChange,
}: {
    id: string
    index: number
    url: string
    titleValue: string
    customUrlValue: string
    lockedPlans: Plan[]
    onRemove: () => void
    onUrlChange: (value: string) => void
    onTitleChange: (value: string) => void
    onCustomUrlChange: (value: string) => void
    onLockedPlansChange: (plans: Plan[]) => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
    const style = { transform: CSS.Transform.toString(transform), transition }

    return (
        <div ref={setNodeRef} style={style} className="flex flex-col gap-2">
            <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="cursor-grab touch-none text-muted-foreground"
                        {...attributes}
                        {...listeners}
                    >
                        <GripVertical className="h-4 w-4" />
                    </button>
                    <Label className="text-xs text-muted-foreground">Submódulo #{index + 1}</Label>
                </div>
                <Button type="button" variant="destructive" size="icon" onClick={onRemove}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex flex-col gap-2">
                <Select onValueChange={onUrlChange} value={url}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecciona URL" />
                    </SelectTrigger>
                    <SelectContent>
                        {[...navigationRoutes]
                            .sort((a, b) => a.route.localeCompare(b.route))
                            .map((item) => (
                                <SelectItem key={item.route} value={item.route}>
                                    {item.route}
                                </SelectItem>
                            ))}
                    </SelectContent>
                </Select>
                {url === "/canva" && (
                    <Input
                        placeholder="https://bot.verzay.co/es/typebots"
                        value={customUrlValue}
                        onChange={(e) => onCustomUrlChange(e.target.value)}
                        className="w-full"
                    />
                )}
                <Input
                    placeholder="Título"
                    value={titleValue}
                    onChange={(e) => onTitleChange(e.target.value)}
                    className="w-full"
                />
                <div className="flex flex-col gap-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                        <Lock className="h-3 w-3" /> Bloqueado para
                    </Label>
                    <div className="flex gap-1">
                        {PLANS.map(plan => {
                            const isLocked = lockedPlans.includes(plan)
                            return (
                                <button
                                    key={plan}
                                    type="button"
                                    onClick={() => onLockedPlansChange(
                                        isLocked ? lockedPlans.filter(p => p !== plan) : [...lockedPlans, plan]
                                    )}
                                    className={`flex-1 text-[11px] px-1 py-0.5 rounded-full border transition-colors text-center ${isLocked
                                        ? 'bg-orange-100 border-orange-400 text-orange-700 dark:bg-orange-900/30 dark:border-orange-500 dark:text-orange-400'
                                        : 'border-muted-foreground/20 text-muted-foreground/40 hover:border-muted-foreground/50 hover:text-muted-foreground'
                                        }`}
                                >
                                    {PLAN_LABELS[plan]}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}

export const ModuleForm = ({
    onSubmit,
    defaultValues,
}: {
    onSubmit: SubmitHandler<FormModuleValues>;
    defaultValues?: Partial<FormModuleValues>;
}) => {

    const form = useForm<FormModuleValues>({
        resolver: zodResolver(FormModuleSchema),
        defaultValues: {
            showInSidebar: true,
            isContainer: false,
            ...defaultValues,
        },
    });

    const { fields, append, remove, move } = useFieldArray({
        control: form.control,
        name: "items",
    });

    const selectedRoute = form.watch("route");
    const watchedItems = form.watch("items");

    const isContainerRoute = selectedRoute === "#container";

    const sensors = useSensors(useSensor(PointerSensor))

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return
        const oldIndex = fields.findIndex((f) => f.id === active.id)
        const newIndex = fields.findIndex((f) => f.id === over.id)
        if (oldIndex !== -1 && newIndex !== -1) move(oldIndex, newIndex)
    }

    return (
        <Form {...form}>
            <form id="module-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-2">
                <FormField
                    control={form.control}
                    name="label"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-xs font-semibold text-foreground">Nombre del módulo</FormLabel>
                            <FormControl>
                                <Input placeholder="Ej: Leads" {...field} />
                            </FormControl>
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="route"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-xs font-semibold text-foreground">Ruta</FormLabel>
                            <Select
                                onValueChange={(val) => {
                                    field.onChange(val);
                                    form.setValue("isContainer", val === "#container");
                                }}
                                defaultValue={field.value}
                                value={field.value}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona una ruta" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="#container">
                                        Sin ruta — Módulo contenedor (solo sub-módulos)
                                    </SelectItem>
                                    {[...navigationRoutes]
                                        .sort((a, b) => a.route.localeCompare(b.route))
                                        .map((item) => (
                                            <SelectItem key={item.route} value={item.route}>
                                                {item.route}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {!isContainerRoute && selectedRoute === "/canva" && (
                    <FormField
                        control={form.control}
                        name="customUrl"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs font-semibold text-foreground">Ruta personalizada</FormLabel>
                                <FormControl>
                                    <Input placeholder="https://bot.verzay.co/es/typebots" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                <FormField
                    control={form.control}
                    name="icon"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-xs font-semibold text-foreground">Icono del módulo</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona un icono" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {Object.entries(iconMap).map(([key, IconComponent]) => (
                                        <SelectItem key={key} value={key}>
                                            <div className="flex items-center gap-2">
                                                <IconComponent className="w-4 h-4" />
                                                {key}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FormItem>
                    )}
                />

                {['showInSidebar', 'adminOnly', 'requiresPremium'].map((key) => (
                    <FormField
                        key={key}
                        control={form.control}
                        name={key as keyof z.infer<typeof FormModuleSchema>}
                        render={({ field }) => (
                            <FormItem className="flex items-center gap-3">
                                <FormControl>
                                    <Checkbox
                                        checked={!!field.value}
                                        onCheckedChange={(checked: CheckedState) => field.onChange(!!checked)}
                                    />
                                </FormControl>
                                <FormLabel className="text-xs font-semibold text-foreground">{labelMap[key]}</FormLabel>
                            </FormItem>
                        )}
                    />
                ))}

                <div className="flex flex-col gap-2">
                    <FormLabel className="text-xs font-semibold text-foreground">Planes permitidos</FormLabel>
                    <div className="rounded-md border divide-y">
                        <div className="flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                            <span>Plan</span>
                            <div className="flex items-center">
                                <span className="w-16 text-center">Acceso</span>
                                <span className="w-20 flex items-center justify-center gap-1"><Lock className="h-3 w-3" /> Bloqueado</span>
                            </div>
                        </div>
                        {PLANS.map((plan) => {
                            const allowed = form.watch('allowedPlans') || [];
                            const locked = form.watch('lockedPlans') || [];
                            const isAllowed = allowed.includes(plan);
                            const isLocked = locked.includes(plan);
                            return (
                                <div key={plan} className="flex items-center justify-between px-3 py-2">
                                    <span className="text-sm capitalize">{PLAN_LABELS[plan]}</span>
                                    <div className="flex items-center">
                                        <div className="w-16 flex justify-center">
                                            <Checkbox
                                                checked={isAllowed}
                                                onCheckedChange={(checked) => {
                                                    const updated = checked
                                                        ? [...allowed, plan]
                                                        : allowed.filter((p) => p !== plan);
                                                    form.setValue('allowedPlans', updated);
                                                    if (!checked) {
                                                        form.setValue('lockedPlans', locked.filter((p) => p !== plan));
                                                    }
                                                }}
                                            />
                                        </div>
                                        <div className="w-20 flex justify-center">
                                            <button
                                                type="button"
                                                disabled={!isAllowed}
                                                onClick={() => {
                                                    const updated = isLocked
                                                        ? locked.filter((p) => p !== plan)
                                                        : [...locked, plan];
                                                    form.setValue('lockedPlans', updated);
                                                }}
                                                className={`transition-colors ${isAllowed ? (isLocked ? 'text-orange-500' : 'text-muted-foreground/30 hover:text-muted-foreground') : 'text-muted-foreground/10 cursor-not-allowed'}`}
                                            >
                                                <Lock className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="flex flex-col flex-1 gap-3">
                    <FormLabel className="text-xs font-semibold text-foreground">Submódulos</FormLabel>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                            <div className="flex flex-col gap-4">
                                {fields.map((field, index) => (
                                    <SortableSubmodule
                                        key={field.id}
                                        id={field.id}
                                        index={index}
                                        url={watchedItems?.[index]?.url ?? ""}
                                        titleValue={watchedItems?.[index]?.title ?? ""}
                                        customUrlValue={watchedItems?.[index]?.customUrl ?? ""}
                                        lockedPlans={(watchedItems?.[index]?.lockedPlans ?? []) as Plan[]}
                                        onRemove={() => remove(index)}
                                        onUrlChange={(value) => form.setValue(`items.${index}.url`, value)}
                                        onTitleChange={(value) => form.setValue(`items.${index}.title`, value)}
                                        onCustomUrlChange={(value) => form.setValue(`items.${index}.customUrl`, value)}
                                        onLockedPlansChange={(plans) => form.setValue(`items.${index}.lockedPlans`, plans)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                    <Button type="button" variant="outline" onClick={() => append({ url: "", title: "", lockedPlans: [] })}>
                        Agregar submódulo
                    </Button>
                </div>
            </form>
        </Form>
    )
}
