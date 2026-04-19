"use client";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandEmpty,
    CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ChevronsUpDown, Check } from "lucide-react";

// Server actions del CRUD (usa la ruta donde lo pegaste)
import { upsertUserAiConfig, setUserDefaults, getUserAiSettings } from "@/actions/userAiconfig-actions";
import { useEffect, useState } from "react";
import { keepOnlyOpenAIProvider } from "../helpers/keepOnlyOpenAIProvider";

type ApiKeyConfiguratorProps = {
    userId: string;
    disabled?: boolean;
    label?: string;
    /** callback opcional luego de guardar por si quieres refrescar datos del padre */
    onSaved?: () => void;
};

type SettingsData = NonNullable<
    Awaited<ReturnType<typeof getUserAiSettings>>["data"]
>;

// ====== Validación ======
const FormSchema = z.object({
    providerId: z.string({ required_error: "Selecciona un proveedor" }).min(1),
    modelId: z.string({ required_error: "Selecciona un modelo" }).min(1),
    apiKey: z
        .string({ required_error: "Ingresa tu API key" })
        .min(8, "La API key es demasiado corta"),
    makeDefaultProvider: z.boolean().optional(),
    makeDefaultModel: z.boolean().optional(),
});

type FormValues = z.infer<typeof FormSchema>;

// ====== Utils ======
function maskKey(key?: string) {
    if (!key) return "";
    const visible = 4;
    if (key.length <= visible) return "*".repeat(Math.max(4, key.length));
    return `${"*".repeat(Math.max(4, key.length - visible))}${key.slice(-visible)}`;
}

export function ApiKeyConfigurator({
    userId,
    disabled,
    label = "API key (por proveedor)",
    onSaved,
}: ApiKeyConfiguratorProps) {
    const [open, setOpen] = useState(false);
    const [providerOpen, setProviderOpen] = useState(false);
    const [modelOpen, setModelOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState<SettingsData | null>(null);

    // Estado de preview (fuera del diálogo)
    const [previewProviderId, setPreviewProviderId] = useState<string | null>(null);
    const [previewApiKey, setPreviewApiKey] = useState<string>("");

    const form = useForm<FormValues>({
        resolver: zodResolver(FormSchema),
        defaultValues: {
            providerId: "",
            modelId: "",
            apiKey: "",
            makeDefaultProvider: true,
            makeDefaultModel: true,
        },
        mode: "onSubmit",
    });

    // Carga inicial
    useEffect(() => {
        (async () => {
            setLoading(true);
            const res = await getUserAiSettings(userId);
            setLoading(false);

            if (!res?.success || !res.data) {
                toast.error(res?.message || "No se pudieron cargar los proveedores");
                return;
            }

            const data = res.data;
            const dataFormatted = keepOnlyOpenAIProvider(data)
            setSettings(dataFormatted);

            // Defaults del usuario
            const defProvId = dataFormatted.defaults.defaultProviderId || dataFormatted.providers[0]?.id || "";
            const modelsForDefault =
                dataFormatted.providers.find((p) => p.id === defProvId)?.models || [];
            const defModelId =
                dataFormatted.defaults.defaultAiModelId || modelsForDefault[0]?.id || "";

            form.setValue("providerId", defProvId);
            form.setValue("modelId", defModelId);

            // Prefill apiKey si ya había config para ese provider
            const existingCfg = dataFormatted.configs.find((c) => c.providerId === defProvId);
            if (existingCfg) {
                form.setValue("apiKey", existingCfg.apiKey);
            }

            // Preview inicial (el input arriba que muestra **key)
            setPreviewProviderId(defProvId);
            setPreviewApiKey(existingCfg?.apiKey || "");
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    const providers = settings?.providers || [];
    const currentProviderId = form.watch("providerId");
    const modelsForProvider =
        providers.find((p) => p.id === currentProviderId)?.models || [];

    // Si cambia provider, resetea modelo + llena API key si existe config
    useEffect(() => {
        if (!settings) return;

        const existsModel = modelsForProvider.some(
            (m) => m.id === form.getValues("modelId")
        );
        if (!existsModel) {
            form.setValue("modelId", "");
        }

        const cfg = settings.configs.find((c) => c.providerId === currentProviderId);
        form.setValue("apiKey", cfg?.apiKey || "");

        // actualiza preview (fuera del diálogo)
        setPreviewProviderId(currentProviderId);
        setPreviewApiKey(cfg?.apiKey || "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentProviderId, settings]);

    const submit = async (data: FormValues) => {
        setLoading(true);
        try {
            // 1) API key x usuario x provider (upsert)
            const up = await upsertUserAiConfig({
                userId,
                providerId: data.providerId,
                apiKey: data.apiKey,
                isActive: true,
                makeDefaultProvider: !!data.makeDefaultProvider,
            });

            if (!up.success) {
                toast.error(up.message || "No se pudo guardar la API key");
                setLoading(false);
                return;
            }

            // 2) Defaults (provider/model)
            const setDef = await setUserDefaults({
                userId,
                providerId: data.makeDefaultProvider ? data.providerId : undefined,
                modelId: data.makeDefaultModel ? data.modelId : undefined,
            });

            if (!setDef.success) {
                toast.warning(
                    setDef.message ||
                    "Clave guardada, pero no se pudieron actualizar los valores por defecto."
                );
            } else {
                toast.success("Guardado correctamente.");
            }

            setOpen(false);

            // refresca settings locales
            const ref = await getUserAiSettings(userId);
            if (ref?.success && ref.data) {
                const filtered = keepOnlyOpenAIProvider(ref.data);
                setSettings(filtered);

                const cfg = filtered.configs.find((c: any) => c.providerId === data.providerId);
                setPreviewProviderId(data.providerId);
                setPreviewApiKey(cfg?.apiKey || "");
            }

            onSaved?.();
        } catch (err: any) {
            toast.error(err?.message || "Error guardando configuración");
        } finally {
            setLoading(false);
        }
    };

    // Etiquetas
    const providerLabel =
        providers.find((p) => p.id === form.getValues("providerId"))?.name ||
        "Selecciona un proveedor";
    const modelLabel =
        modelsForProvider.find((m) => m.id === form.getValues("modelId"))?.name ||
        "Selecciona un modelo";

    // Preview label (fuera del diálogo)
    const previewProviderLabel =
        providers.find((p) => p.id === previewProviderId)?.name || "Proveedor";

    return (
        <div className="space-y-2">
            <Label className="text-muted-foreground">{label}</Label>

            {/* Input de previsualización (no editable) */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <div className="relative">
                        <Input
                            readOnly
                            disabled={disabled || loading}
                            value={
                                previewApiKey
                                    ? `${previewProviderLabel}: ${maskKey(previewApiKey)}`
                                    : `${previewProviderLabel}: No configurada`
                            }
                            placeholder="No configurada"
                            className={cn(
                                "pr-28 cursor-pointer bg-muted/40 border-border",
                                (disabled || loading) && "cursor-not-allowed opacity-60"
                            )}
                        />
                        <Button
                            type="button"
                            variant="secondary"
                            className="absolute right-1 top-1 h-8"
                            disabled={disabled || loading}
                        >
                            Configurar
                        </Button>
                    </div>
                </DialogTrigger>

                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Configurar proveedor y modelo</DialogTitle>
                        <DialogDescription>
                            Guarda la API key por <span className="font-medium">proveedor</span> y define el{" "}
                            <span className="font-medium">proveedor/modelo por defecto</span> del usuario.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={form.handleSubmit(submit)} className="grid gap-4 py-2">
                        {/* Provider */}
                        <div className="grid gap-2">
                            <Label>Proveedor</Label>
                            <Popover open={providerOpen} onOpenChange={setProviderOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={providerOpen}
                                        className="justify-between"
                                        disabled={loading}
                                    >
                                        {providerLabel}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                    <Command>
                                        <CommandInput placeholder="Buscar proveedor..." />
                                        <CommandList>
                                            <CommandEmpty>Sin resultados</CommandEmpty>
                                            <CommandGroup>
                                                {providers.map((prov) => (
                                                    <CommandItem
                                                        key={prov.id}
                                                        value={prov.id}
                                                        onSelect={(val) => {
                                                            form.setValue("providerId", val, {
                                                                shouldValidate: true,
                                                                shouldDirty: true,
                                                            });
                                                            setProviderOpen(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                prov.id === form.getValues("providerId")
                                                                    ? "opacity-100"
                                                                    : "opacity-0"
                                                            )}
                                                        />
                                                        {prov.name}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            {form.formState.errors.providerId && (
                                <p className="text-xs text-destructive">
                                    {form.formState.errors.providerId.message}
                                </p>
                            )}
                        </div>

                        {/* Model */}
                        <div className="grid gap-2">
                            <Label>Modelo</Label>
                            <Popover open={modelOpen} onOpenChange={setModelOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={modelOpen}
                                        disabled={!form.getValues("providerId") || loading}
                                        className={cn(
                                            "justify-between",
                                            !form.getValues("providerId") && "opacity-60"
                                        )}
                                    >
                                        {modelLabel}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                    <Command>
                                        <CommandInput placeholder="Buscar modelo..." />
                                        <CommandList>
                                            <CommandEmpty>Sin resultados</CommandEmpty>
                                            <CommandGroup>
                                                {modelsForProvider.map((m) => (
                                                    <CommandItem
                                                        key={m.id}
                                                        value={m.id}
                                                        onSelect={(val) => {
                                                            form.setValue("modelId", val, {
                                                                shouldValidate: true,
                                                                shouldDirty: true,
                                                            });
                                                            setModelOpen(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                m.id === form.getValues("modelId")
                                                                    ? "opacity-100"
                                                                    : "opacity-0"
                                                            )}
                                                        />
                                                        {m.name}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            {form.formState.errors.modelId && (
                                <p className="text-xs text-destructive">
                                    {form.formState.errors.modelId.message}
                                </p>
                            )}
                        </div>

                        {/* API Key */}
                        <div className="grid gap-2">
                            <Label>API key</Label>
                            <Input
                                type="password"
                                placeholder="sk-********************************"
                                {...form.register("apiKey")}
                                className="bg-background border-border"
                                disabled={loading}
                            />
                            {form.formState.errors.apiKey && (
                                <p className="text-xs text-destructive">
                                    {form.formState.errors.apiKey.message}
                                </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                Seguridad: se guarda por proveedor en <code>UserAiConfig</code>.
                            </p>
                        </div>

                        {/* Opciones por defecto */}
                        <div className="grid gap-2">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="makeDefaultProvider"
                                    checked={!!form.watch("makeDefaultProvider")}
                                    onCheckedChange={(v) =>
                                        form.setValue("makeDefaultProvider", Boolean(v), {
                                            shouldDirty: true,
                                            shouldValidate: true,
                                        })
                                    }
                                    disabled={loading}
                                />
                                <Label htmlFor="makeDefaultProvider" className="cursor-pointer">
                                    Usar este proveedor como <b>por defecto</b>
                                </Label>
                            </div>

                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="makeDefaultModel"
                                    checked={!!form.watch("makeDefaultModel")}
                                    onCheckedChange={(v) =>
                                        form.setValue("makeDefaultModel", Boolean(v), {
                                            shouldDirty: true,
                                            shouldValidate: true,
                                        })
                                    }
                                    disabled={loading}
                                />
                                <Label htmlFor="makeDefaultModel" className="cursor-pointer">
                                    Usar este modelo como <b>por defecto</b>
                                </Label>
                            </div>
                        </div>

                        <DialogFooter className="mt-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setOpen(false)}
                                disabled={loading}
                            >
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading ? "Guardando..." : "Guardar"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
