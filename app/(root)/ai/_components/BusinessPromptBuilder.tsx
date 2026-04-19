"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
    Form,
    FormField,
    FormItem,
    FormLabel,
    FormControl,
    FormMessage,
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

    return (
        <div className="gap-2 flex flex-col">
            <Card className="border-muted/60">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Información del Negocio</CardTitle>

                    {/* Indicador de autosave */}
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

                <CardContent className="space-y-4">
                    <Form {...form}>
                        <form
                            className="space-y-4"
                            onSubmit={(e) => e.preventDefault()}
                        >
                            {/* Campos Principales */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Nombre */}
                                <FormField
                                    control={form.control}
                                    name="nombre"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                Nombre del Negocio
                                                <span className="text-destructive"> *</span>
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="Ej. Holi Print RD"
                                                    {...field}
                                                    onChange={field.onChange}
                                                    onBlur={(e) => {
                                                        field.onBlur();
                                                        handleChange?.("nombre")(e);
                                                    }}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Sector */}
                                <FormField
                                    control={form.control}
                                    name="sector"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Sector / Rubro</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="Ej. Stickers y etiquetas"
                                                    {...field}
                                                    onChange={field.onChange}
                                                    onBlur={(e) => {
                                                        field.onBlur();
                                                        handleChange?.("sector")(e);
                                                    }}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Ubicación */}
                                <FormField
                                    control={form.control}
                                    name="ubicacion"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Ubicación / Dirección</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="Ej. Av. Siempre Viva 742, Quito"
                                                    {...field}
                                                    onChange={field.onChange}
                                                    onBlur={(e) => {
                                                        field.onBlur();
                                                        handleChange?.("ubicacion")(e);
                                                    }}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Horarios */}
                                <FormField
                                    control={form.control}
                                    name="horarios"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Horarios de Atención</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="Ej. Lun–Sáb 9:00 a 18:00"
                                                    {...field}
                                                    onChange={field.onChange}
                                                    onBlur={(e) => {
                                                        field.onBlur();
                                                        handleChange?.("horarios")(e);
                                                    }}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Teléfono */}
                                <FormField
                                    control={form.control}
                                    name="telefono"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Número de Contacto</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="Ej. +57 300 123 4567"
                                                    {...field}
                                                    onChange={field.onChange}
                                                    onBlur={(e) => {
                                                        field.onBlur();
                                                        handleChange?.("telefono")(e);
                                                    }}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Sitio */}
                                <FormField
                                    control={form.control}
                                    name="sitio"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Sitio web</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="url"
                                                    placeholder="https://negocio.com"
                                                    {...field}
                                                    onChange={field.onChange}
                                                    onBlur={(e) => {
                                                        field.onBlur();
                                                        handleChange?.("sitio")(e);
                                                    }}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Campos dinámicos */}

                                {shouldShow("email") && (
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Correo electrónico</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="email"
                                                        placeholder="ventas@negocio.com"
                                                        {...field}
                                                        onChange={field.onChange}
                                                        onBlur={(e) => {
                                                            field.onBlur();
                                                            handleChange?.("email")(e);
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}

                                {shouldShow("facebook") && (
                                    <FormField
                                        control={form.control}
                                        name="facebook"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Facebook</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="url"
                                                        placeholder="https://facebook.com/tu-negocio"
                                                        {...field}
                                                        onChange={field.onChange}
                                                        onBlur={(e) => {
                                                            field.onBlur();
                                                            handleChange?.("facebook")(e);
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}

                                {shouldShow("instagram") && (
                                    <FormField
                                        control={form.control}
                                        name="instagram"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Instagram</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="url"
                                                        placeholder="https://instagram.com/tu_negocio"
                                                        {...field}
                                                        onChange={field.onChange}
                                                        onBlur={(e) => {
                                                            field.onBlur();
                                                            handleChange?.("instagram")(e);
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}

                                {shouldShow("tiktok") && (
                                    <FormField
                                        control={form.control}
                                        name="tiktok"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>TikTok</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="url"
                                                        placeholder="https://tiktok.com/@tu_negocio"
                                                        {...field}
                                                        onChange={field.onChange}
                                                        onBlur={(e) => {
                                                            field.onBlur();
                                                            handleChange?.("tiktok")(e);
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}

                                {shouldShow("youtube") && (
                                    <FormField
                                        control={form.control}
                                        name="youtube"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>YouTube</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="url"
                                                        placeholder="https://youtube.com/@tu_negocio"
                                                        {...field}
                                                        onChange={field.onChange}
                                                        onBlur={(e) => {
                                                            field.onBlur();
                                                            handleChange?.("youtube")(e);
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>

                            {/* Notas */}
                            {shouldShow("notas") && (
                                <>
                                    <Separator />
                                    <FormField
                                        control={form.control}
                                        name="notas"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Notas / Instrucciones extra</FormLabel>
                                                <FormControl>
                                                    <Textarea
                                                        className="min-h-[64px]"
                                                        placeholder="Aclaraciones, tono, restricciones..."
                                                        {...field}
                                                        onChange={field.onChange}
                                                        onBlur={(e) => {
                                                            field.onBlur();
                                                            handleChange?.("notas")(e);
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </>
                            )}

                            <Separator />

                            {/* 🔽 Selector de Campos Adicionales */}
                            <div className="flex flex-col gap-2">
                                <FormLabel>Campos adicionales</FormLabel>
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
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        added ? "opacity-100" : "opacity-0"
                                                                    )}
                                                                />
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
