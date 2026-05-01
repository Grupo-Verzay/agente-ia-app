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
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core"
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import { CSS } from "@dnd-kit/utilities"

const labelMap: Record<string, string> = {
    showInSidebar: 'Mostrar en Sidebar',
    adminOnly: 'Solo Admin',
    requiresPremium: 'Requiere Premium',
}

function SortableSubmoduleItem({
    fieldId,
    index,
    watchedUrl,
    onRemove,
    register,
    setValue,
    watch,
}: {
    fieldId: string
    index: number
    watchedUrl?: string
    onRemove: () => void
    register: ReturnType<typeof useForm<FormModuleValues>>["register"]
    setValue: ReturnType<typeof useForm<FormModuleValues>>["setValue"]
    watch: ReturnType<typeof useForm<FormModuleValues>>["watch"]
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: fieldId })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    }

    return (
        <div ref={setNodeRef} style={style} className="flex flex-col flex-1 justify-between gap-2 rounded-md border p-2 bg-background">
            <div className="flex w-full justify-between items-center">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground"
                        {...attributes}
                        {...listeners}
                    >
                        <GripVertical className="w-4 h-4" />
                    </button>
                    <Label className="text-xs text-muted-foreground">Submodulo #{index + 1}</Label>
                </div>
                <Button type="button" variant="destructive" size="icon" onClick={onRemove}>
                    <Trash2 className="w-4 h-4" />
                </Button>
            </div>

            <div className="flex gap-2 flex-col">
                <Select
                    onValueChange={(value) => setValue(`items.${index}.url`, value)}
                    defaultValue={watch(`items.${index}.url`)}
                >
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
                {watchedUrl === "/canva" && (
                    <Input
                        placeholder="https://bot.verzay.co/es/typebots"
                        {...register(`items.${index}.customUrl`)}
                        className="w-full"
                    />
                )}
                <Input
                    placeholder="Título"
                    {...register(`items.${index}.title`)}
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

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (over && active.id !== over.id) {
            const oldIndex = fields.findIndex((f) => f.id === active.id)
            const newIndex = fields.findIndex((f) => f.id === over.id)
            move(oldIndex, newIndex)
        }
    }

    return (
        <Form {...form}>
            <form id="module-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-2">
                <FormField
                    control={form.control}
                    name="label"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nombre del módulo</FormLabel>
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
                            <FormLabel>Ruta</FormLabel>
                            <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona una ruta" />
                                    </SelectTrigger>
                                </FormControl>
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
                        </FormItem>
                    )}
                />

                {selectedRoute === "/canva" && (
                    <FormField
                        control={form.control}
                        name="customUrl"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Ruta personalizada</FormLabel>
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
                            <FormLabel>Icono del módulo</FormLabel>
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
                                <FormLabel>{labelMap[key]}</FormLabel>
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
                                <FormLabel>Planes permitidos</FormLabel>
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

                <div className="flex flex-col flex-1 gap-2">
                    <FormLabel>Submódulos</FormLabel>
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        modifiers={[restrictToVerticalAxis]}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                            {fields.map((field, index) => (
                                <SortableSubmoduleItem
                                    key={field.id}
                                    fieldId={field.id}
                                    index={index}
                                    watchedUrl={watchedItems?.[index]?.url}
                                    onRemove={() => remove(index)}
                                    register={form.register}
                                    setValue={form.setValue}
                                    watch={form.watch}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                    <Button type="button" variant={"outline"} onClick={() => append({ url: "", title: "" })}>
                        Agregar submódulo
                    </Button>
                </div>
            </form>
        </Form>
    )
}
