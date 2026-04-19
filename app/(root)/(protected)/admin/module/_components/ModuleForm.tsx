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
import { ChevronsUpDown, Trash2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { navigationRoutes } from "@/lib/navigation-routes"
import { PLAN_LABELS, PLANS } from "@/types/plans"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { useState } from "react"
import { Label } from "@/components/ui/label"

const labelMap: Record<string, string> = {
    showInSidebar: 'Mostrar en Sidebar',
    adminOnly: 'Solo Admin',
    requiresPremium: 'Requiere Premium',
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

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items",
    });

    const [openPlans, setOpenPlans] = useState(false);

    const selectedRoute = form.watch("route");
    const watchedItems = form.watch("items");

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
                    {fields.map((field, index) => (
                        <div key={field.id} className="flex flex-col flex-1 justify-between gap-2">
                            <div className="flex w-full justify-between items-center">
                                <Label className="text-xs text-muted-foreground">Submodulo #{index + 1}</Label>
                                <Button type="button" variant="destructive" onClick={() => remove(index)}>
                                    <Trash2 />
                                </Button>
                            </div>

                            <div className="flex gap-2 flex-col">
                                {/* SELECT para URL */}
                                <Select
                                    onValueChange={(value) => form.setValue(`items.${index}.url`, value)}
                                    defaultValue={form.watch(`items.${index}.url`)}
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
                                {/* Ruta personalizada cuando la URL es /canva */}
                                {watchedItems?.[index]?.url === "/canva" && (
                                    <Input
                                        placeholder="https://bot.verzay.co/es/typebots"
                                        {...form.register(`items.${index}.customUrl`)}
                                        className="w-full"
                                    />
                                )}
                                {/* INPUT para título */}
                                <Input
                                    placeholder="Título"
                                    {...form.register(`items.${index}.title`)}
                                    className="w-full"
                                />
                            </div>
                        </div>
                    ))}
                    <Button type="button" variant={"outline"} onClick={() => append({ url: "", title: "" })}>
                        Agregar submódulo
                    </Button>
                </div>
            </form>
        </Form>
    )
}