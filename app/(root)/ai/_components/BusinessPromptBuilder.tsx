"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Form,
    FormField,
} from "@/components/ui/form";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Command,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";

import {
    BusinessPromptBuilderProps,
    FormValues,
    promptSchema,
} from "@/types/agentAi";
import { useBusinessAutosave, AutosaveStatus } from "./hooks/useBusinessAutosave";

/* ---------- CAMPOS ADICIONALES DISPONIBLES ---------- */
const optionalFields = [
    { value: "email", label: "Correo electrónico" },
    { value: "facebook", label: "Facebook" },
    { value: "instagram", label: "Instagram" },
    { value: "tiktok", label: "TikTok" },
    { value: "youtube", label: "YouTube" },
    { value: "notas", label: "Notas" },
];

export const BusinessPromptBuilder = ({
    values,
    handleChange,
    user,
    promptId,
    version,
    onVersionChange,
    onConflict,
    registerSaveHandler
}: BusinessPromptBuilderProps) => {
    const [selectedFields, setSelectedFields] = useState<string[]>([]);
    const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");

    const form = useForm<FormValues>({
        resolver: zodResolver(promptSchema),
        defaultValues: values,
        mode: "onChange",
    });

    const { forceSave } = useBusinessAutosave({
        form,
        promptId,
        version,
        onVersionChange,
        onConflict,
        onStatusChange: setAutosaveStatus,
        mode: "manual",
    });

    useEffect(() => {
        if (!registerSaveHandler) return;
        registerSaveHandler(forceSave);
    }, [registerSaveHandler, forceSave]);

    useEffect(() => {
        if (autosaveStatus === "saved") {
            const t = setTimeout(() => setAutosaveStatus("idle"), 1500);
            return () => clearTimeout(t);
        }
    }, [autosaveStatus]);

    useEffect(() => {
        form.reset(values, { keepDirtyValues: true });
    }, [form, values]);

    // 👇 Mostrar campos ocultos si ya tienen valor (con typings seguros)
    const watchAll = form.watch() as Partial<Record<keyof FormValues, unknown>>;

    const hasValue = (name: keyof FormValues) => {
        const v = watchAll[name];
        if (typeof v === "string") return v.trim().length > 0;
        if (Array.isArray(v)) return v.length > 0;
        return v != null && v !== "";
    };

    const shouldShow = (name: keyof FormValues) =>
        selectedFields.includes(name) || hasValue(name);

    //  Considerar "agregado" si está seleccionado o si ya tiene valor
    const isAdded = (name: keyof FormValues) =>
        selectedFields.includes(name) || hasValue(name);

    const toggleField = (field: string) => {
        setSelectedFields((prev) =>
            prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
        );
    };

    // Helper: fila de campo — label izquierda, input derecha
    const FieldRow = ({
        label,
        required,
        children,
        error,
    }: {
        label: string;
        required?: boolean;
        children: React.ReactNode;
        error?: string;
    }) => (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-muted/40 last:border-0">
            <span className="w-44 shrink-0 text-sm font-medium">
                {label}
                {required && <span className="text-destructive"> *</span>}
            </span>
            <div className="flex-1">
                {children}
                {error && <p className="text-xs text-destructive mt-1">{error}</p>}
            </div>
        </div>
    );

    return (
        <div className="gap-2 flex flex-col">
            <Card className="border-muted/60">
                <CardHeader className="pb-2 flex-row items-center justify-between">
                    <CardTitle className="text-base">Información del Negocio</CardTitle>

                    {autosaveStatus !== "idle" && (
                        <span
                            className={cn(
                                "text-xs",
                                autosaveStatus === "saving" && "text-muted-foreground",
                                autosaveStatus === "saved" && "text-emerald-500",
                                autosaveStatus === "error" && "text-destructive"
                            )}
                        >
                            {autosaveStatus === "saving" && "Guardando..."}
                            {autosaveStatus === "saved" && "Cambios guardados"}
                            {autosaveStatus === "error" && "Error al guardar"}
                        </span>
                    )}
                </CardHeader>

                <CardContent className="space-y-3 px-0 pb-4">
                    <Form {...form}>
                        <form onSubmit={(e) => e.preventDefault()}>

                            {/* Campos principales */}
                            <Card className="mx-6 bg-muted/20 border-muted/60">
                                <CardContent className="p-0">
                                    <FormField control={form.control} name="nombre" render={({ field, fieldState }) => (
                                        <FieldRow label="Nombre del Negocio" required error={fieldState.error?.message}>
                                            <Input className="h-8" placeholder="Ej. Holi Print RD" {...field}
                                                onChange={field.onChange}
                                                onBlur={(e) => { field.onBlur(); handleChange?.("nombre")(e); }} />
                                        </FieldRow>
                                    )} />
                                    <FormField control={form.control} name="sector" render={({ field, fieldState }) => (
                                        <FieldRow label="Sector / Rubro" error={fieldState.error?.message}>
                                            <Input className="h-8" placeholder="Ej. Stickers y etiquetas" {...field}
                                                onChange={field.onChange}
                                                onBlur={(e) => { field.onBlur(); handleChange?.("sector")(e); }} />
                                        </FieldRow>
                                    )} />
                                    <FormField control={form.control} name="ubicacion" render={({ field, fieldState }) => (
                                        <FieldRow label="Ubicación / Dirección" error={fieldState.error?.message}>
                                            <Input className="h-8" placeholder="Ej. Av. Siempre Viva 742, Quito" {...field}
                                                onChange={field.onChange}
                                                onBlur={(e) => { field.onBlur(); handleChange?.("ubicacion")(e); }} />
                                        </FieldRow>
                                    )} />
                                    <FormField control={form.control} name="horarios" render={({ field, fieldState }) => (
                                        <FieldRow label="Horarios de Atención" error={fieldState.error?.message}>
                                            <Input className="h-8" placeholder="Ej. Lun–Sáb 9:00 a 18:00" {...field}
                                                onChange={field.onChange}
                                                onBlur={(e) => { field.onBlur(); handleChange?.("horarios")(e); }} />
                                        </FieldRow>
                                    )} />
                                    <FormField control={form.control} name="telefono" render={({ field, fieldState }) => (
                                        <FieldRow label="Número de Contacto" error={fieldState.error?.message}>
                                            <Input className="h-8" placeholder="Ej. +57 300 123 4567" {...field}
                                                onChange={field.onChange}
                                                onBlur={(e) => { field.onBlur(); handleChange?.("telefono")(e); }} />
                                        </FieldRow>
                                    )} />
                                    <FormField control={form.control} name="sitio" render={({ field, fieldState }) => (
                                        <FieldRow label="Sitio web" error={fieldState.error?.message}>
                                            <Input className="h-8" type="url" placeholder="https://negocio.com" {...field}
                                                onChange={field.onChange}
                                                onBlur={(e) => { field.onBlur(); handleChange?.("sitio")(e); }} />
                                        </FieldRow>
                                    )} />

                                    {/* Campos opcionales */}
                                    {shouldShow("email") && (
                                        <FormField control={form.control} name="email" render={({ field, fieldState }) => (
                                            <FieldRow label="Correo electrónico" error={fieldState.error?.message}>
                                                <Input className="h-8" type="email" placeholder="ventas@negocio.com" {...field}
                                                    onChange={field.onChange}
                                                    onBlur={(e) => { field.onBlur(); handleChange?.("email")(e); }} />
                                            </FieldRow>
                                        )} />
                                    )}
                                    {shouldShow("facebook") && (
                                        <FormField control={form.control} name="facebook" render={({ field, fieldState }) => (
                                            <FieldRow label="Facebook" error={fieldState.error?.message}>
                                                <Input className="h-8" type="url" placeholder="https://facebook.com/tu-negocio" {...field}
                                                    onChange={field.onChange}
                                                    onBlur={(e) => { field.onBlur(); handleChange?.("facebook")(e); }} />
                                            </FieldRow>
                                        )} />
                                    )}
                                    {shouldShow("instagram") && (
                                        <FormField control={form.control} name="instagram" render={({ field, fieldState }) => (
                                            <FieldRow label="Instagram" error={fieldState.error?.message}>
                                                <Input className="h-8" type="url" placeholder="https://instagram.com/tu_negocio" {...field}
                                                    onChange={field.onChange}
                                                    onBlur={(e) => { field.onBlur(); handleChange?.("instagram")(e); }} />
                                            </FieldRow>
                                        )} />
                                    )}
                                    {shouldShow("tiktok") && (
                                        <FormField control={form.control} name="tiktok" render={({ field, fieldState }) => (
                                            <FieldRow label="TikTok" error={fieldState.error?.message}>
                                                <Input className="h-8" type="url" placeholder="https://tiktok.com/@tu_negocio" {...field}
                                                    onChange={field.onChange}
                                                    onBlur={(e) => { field.onBlur(); handleChange?.("tiktok")(e); }} />
                                            </FieldRow>
                                        )} />
                                    )}
                                    {shouldShow("youtube") && (
                                        <FormField control={form.control} name="youtube" render={({ field, fieldState }) => (
                                            <FieldRow label="YouTube" error={fieldState.error?.message}>
                                                <Input className="h-8" type="url" placeholder="https://youtube.com/@tu_negocio" {...field}
                                                    onChange={field.onChange}
                                                    onBlur={(e) => { field.onBlur(); handleChange?.("youtube")(e); }} />
                                            </FieldRow>
                                        )} />
                                    )}
                                </CardContent>
                            </Card>

                            {/* Notas */}
                            {shouldShow("notas") && (
                                <Card className="mx-6 mt-3 bg-muted/20 border-muted/60">
                                    <CardContent className="p-0">
                                        <FormField control={form.control} name="notas" render={({ field, fieldState }) => (
                                            <div className="px-4 py-3">
                                                <span className="text-sm font-medium">Notas / Instrucciones extra</span>
                                                <Textarea
                                                    className="min-h-[64px] mt-2"
                                                    placeholder="Aclaraciones, tono, restricciones..."
                                                    {...field}
                                                    onChange={field.onChange}
                                                    onBlur={(e) => { field.onBlur(); handleChange?.("notas")(e); }}
                                                />
                                                {fieldState.error && <p className="text-xs text-destructive mt-1">{fieldState.error.message}</p>}
                                            </div>
                                        )} />
                                    </CardContent>
                                </Card>
                            )}

                            {/* Campos adicionales */}
                            <div className="px-6 mt-3 flex flex-col gap-2">
                                <span className="text-sm font-medium">Campos adicionales</span>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" role="combobox" className="justify-between">
                                            Seleccionar campos...
                                            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[280px]">
                                        <Command>
                                            <CommandInput placeholder="Buscar campo..." />
                                            <CommandList>
                                                <CommandGroup>
                                                    {optionalFields.map((field) => {
                                                        const added = isAdded(field.value as keyof FormValues);
                                                        return (
                                                            <CommandItem
                                                                key={field.value}
                                                                onSelect={() => toggleField(field.value)}
                                                                aria-selected={added}
                                                            >
                                                                <Check className={cn("mr-2 h-4 w-4", added ? "opacity-100" : "opacity-0")} />
                                                                {field.label}
                                                            </CommandItem>
                                                        );
                                                    })}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
};
