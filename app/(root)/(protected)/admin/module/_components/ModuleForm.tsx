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
import { ChevronsUpDown, GripVertical, Trash2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { navigationRoutes } from "@/lib/navigation-routes"
import { PLAN_LABELS, PLANS } from "@/types/plans"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { useState } from "react"
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

function SortableSubmodule({
    id,
    index,
    url,
    titleValue,
    customUrlValue,
    onRemove,
    onUrlChange,
    onTitleChange,
    onCustomUrlChange,
}: {
    id: string
    index: number
    url: string
    titleValue: string
    customUrlValue: string
    onRemove: () => void
    onUrlChange: (value: string) => void
    onTitleChange: (value: string) => void
    onCustomUrlChange: (value: string) => void
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

    const [openPlans, setOpenPlans] = useState(false);

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

                <FormField
                    control={form.control}
                    name="allowedPlans"
                    render={({ field }) => {
                        const selected = field.value || [];

                        return (
                            <FormItem className="flex flex-col gap-2">
                                <FormLabel className="text-xs font-semibold text-foreground">Planes permitidos</FormLabel>
                                <Popover open={openPlans} onOpenChange={setOpenPlans}>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className="w-full justify-between"
                                            >
                                                {selected.length > 0
                                                    ? `${selected.length} seleccionado(s)`
                                                    : 'Selecciona uno o más planes'}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-full p-0">
                                        <Command>
                                            <CommandInput placeholder="Buscar plan..." />
                                            <CommandGroup>
                                                {PLANS.map((plan) => (
                                                    <CommandItem
                                                        key={plan}
                                                        onSelect={() => {
                                                            const updated = selected.includes(plan)
                                                                ? selected.filter((p) => p !== plan)
                                                                : [...selected, plan];
                                                            field.onChange(updated);
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <Checkbox
                                                                checked={selected.includes(plan)}
                                                                onCheckedChange={() => { }}
                                                            />
                                                            <span className="capitalize">
                                                                {PLAN_LABELS[plan]}
                                                            </span>
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </FormItem>
                        );
                    }}
                />

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
                                        onRemove={() => remove(index)}
                                        onUrlChange={(value) => form.setValue(`items.${index}.url`, value)}
                                        onTitleChange={(value) => form.setValue(`items.${index}.title`, value)}
                                        onCustomUrlChange={(value) => form.setValue(`items.${index}.customUrl`, value)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                    <Button type="button" variant="outline" onClick={() => append({ url: "", title: "" })}>
                        Agregar submódulo
                    </Button>
                </div>
            </form>
        </Form>
    )
}
