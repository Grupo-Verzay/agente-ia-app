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
import { cn } from "@/lib/utils";
import { ChevronsUpDown, Check, Eye, EyeOff, Building2, User as UserIcon, Copy } from "lucide-react";

// Server actions del CRUD (usa la ruta donde lo pegaste)
import { upsertUserAiConfig, setUserDefaults, getUserAiSettings, getAiKeyOriginInfo, type AiKeyOriginDTO } from "@/actions/userAiconfig-actions";
import { validateProviderApiKey } from "@/lib/ai-key-validation";
import { useEffect, useState } from "react";
import { keepSupportedProviders } from "../helpers/keepOnlyOpenAIProvider";

type ApiKeyConfiguratorProps = {
    userId: string;
    disabled?: boolean;
    label?: string;
    defaultOpen?: boolean;
    /** callback opcional luego de guardar por si quieres refrescar datos del padre */
    onSaved?: () => void;
    /**
     * Solo admin/reseller: muestra el ojito para revelar la key completa y el
     * badge de origen (Verzay compartida vs propia del cliente).
     */
    showOrigin?: boolean;
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
    temperature: z.number().min(0).max(0.5).default(0),
});

type FormValues = z.infer<typeof FormSchema>;

// ====== Utils ======
function maskKey(key?: string) {
    if (!key) return "";
    return "*".repeat(24);
}

export function ApiKeyConfigurator({
    userId,
    disabled,
    label = "API key (por proveedor)",
    defaultOpen = false,
    onSaved,
    showOrigin = false,
}: ApiKeyConfiguratorProps) {
    const [open, setOpen] = useState(false);
    // Solo admin/reseller: revelar la key completa + origen (Verzay vs propia).
    const [revealed, setRevealed] = useState(false);
    const [copied, setCopied] = useState(false);
    const [origin, setOrigin] = useState<AiKeyOriginDTO | null>(null);

    const handleCopyKey = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!previewApiKey) return;
        try {
            await navigator.clipboard.writeText(previewApiKey);
            setCopied(true);
            toast.success("API key copiada");
            setTimeout(() => setCopied(false), 1500);
        } catch {
            toast.error("No se pudo copiar la key");
        }
    };

    useEffect(() => {
        if (defaultOpen) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
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
            temperature: 0,
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
            const dataFormatted = keepSupportedProviders(data)
            setSettings(dataFormatted);

            // Defaults del usuario
            const defProvId = dataFormatted.defaults.defaultProviderId || dataFormatted.providers[0]?.id || "";
            const modelsForDefault =
                dataFormatted.providers.find((p) => p.id === defProvId)?.models || [];
            const defModelId =
                dataFormatted.defaults.defaultAiModelId || modelsForDefault[0]?.id || "";

            form.setValue("providerId", defProvId);
            form.setValue("modelId", defModelId);

            // Prefill apiKey y temperature si ya había config para ese provider
            const existingCfg = dataFormatted.configs.find((c) => c.providerId === defProvId);
            if (existingCfg) {
                form.setValue("apiKey", existingCfg.apiKey);
                form.setValue("temperature", existingCfg.temperature ?? 0);
            }

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
        if (modelsForProvider.length === 1) {
            form.setValue("modelId", modelsForProvider[0].id, { shouldValidate: true, shouldDirty: true });
        }

        const cfg = settings.configs.find((c) => c.providerId === currentProviderId);
        form.setValue("apiKey", cfg?.apiKey || "");
        form.setValue("temperature", cfg?.temperature ?? 0);

        // actualiza preview (fuera del diálogo)
        setPreviewProviderId(currentProviderId);
        setPreviewApiKey(cfg?.apiKey || "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentProviderId, settings]);

    // Origen de la key (solo admin/reseller): cuántas cuentas la comparten.
    useEffect(() => {
        if (!showOrigin || !previewProviderId) {
            setOrigin(null);
            return;
        }
        setRevealed(false);
        let cancelled = false;
        (async () => {
            const res = await getAiKeyOriginInfo(userId, previewProviderId);
            if (!cancelled) setOrigin(res?.success ? res.data ?? null : null);
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showOrigin, userId, previewProviderId, previewApiKey]);

    const submit = async (data: FormValues) => {
        // Validación de formato de la API key según el proveedor: evita guardar una
        // URL, un teléfono u otro texto (causaba 401 silenciosos y degradaba el
        // clasificador de leads). Usamos la MISMA función que el server action para
        // no divergir; el servidor la revalida como barrera definitiva.
        const providerName = providers.find((p) => p.id === data.providerId)?.name ?? "";
        const keyError = validateProviderApiKey(providerName, data.apiKey);
        if (keyError) {
            form.setError("apiKey", { type: "manual", message: keyError });
            toast.error(keyError);
            return;
        }

        setLoading(true);
        try {
            // 1) API key x usuario x provider (upsert)
            const up = await upsertUserAiConfig({
                userId,
                providerId: data.providerId,
                apiKey: data.apiKey,
                isActive: true,
                temperature: data.temperature ?? 0,
                makeDefaultProvider: true,
            });

            if (!up.success) {
                toast.error(up.message || "No se pudo guardar la API key");
                setLoading(false);
                return;
            }

            // 2) Defaults (provider/model)
            const setDef = await setUserDefaults({
                userId,
                providerId: data.providerId,
                modelId: data.modelId,
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
                const filtered = keepSupportedProviders(ref.data);
                setSettings(filtered);

                const cfg = filtered.configs.find((c: any) => c.providerId === data.providerId);
                setPreviewProviderId(data.providerId);
                setPreviewApiKey(cfg?.apiKey || "");
            }

            onSaved?.();
        } catch (err) {
            toast.error(err?.message || "Error guardando configuración");
        } finally {
            setLoading(false);
        }
    };

    const fmtProvider = (name: string) =>
        ({ openai: 'OpenIA', google: 'Google' } as Record<string, string>)[name.toLowerCase()] ?? name;

    // Etiquetas
    const providerLabel =
        fmtProvider(providers.find((p) => p.id === form.getValues("providerId"))?.name ?? "") ||
        "Selecciona un proveedor";
    const modelLabel =
        modelsForProvider.find((m) => m.id === form.getValues("modelId"))?.name ||
        "Selecciona un modelo";

    // Preview label (fuera del diálogo)
    const previewProviderLabel =
        fmtProvider(providers.find((p) => p.id === previewProviderId)?.name ?? "") || "Proveedor";

    return (
        <div className="space-y-2">
            <Label className="text-muted-foreground">{label}</Label>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <div className="relative">
                        <Input
                            readOnly
                            disabled={disabled || loading}
                            value={
                                previewApiKey
                                    ? `${previewProviderLabel}: ${showOrigin && revealed ? previewApiKey : maskKey(previewApiKey)}`
                                    : `${previewProviderLabel}: No configurada`
                            }
                            placeholder="No configurada"
                            className={cn(
                                "cursor-pointer bg-muted/40 border-border",
                                showOrigin && previewApiKey ? "pr-52" : "pr-28",
                                (disabled || loading) && "cursor-not-allowed opacity-60"
                            )}
                        />
                        <div className="absolute right-1 top-1 flex items-center gap-1">
                            {showOrigin && previewApiKey && (
                                <>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setRevealed((v) => !v);
                                        }}
                                        title={revealed ? "Ocultar key" : "Ver key completa"}
                                    >
                                        {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground"
                                        onClick={handleCopyKey}
                                        title="Copiar API key"
                                    >
                                        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                </>
                            )}
                            <Button
                                type="button"
                                variant="secondary"
                                className="h-8"
                                disabled={disabled || loading}
                            >
                                Configurar
                            </Button>
                        </div>
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
                                                        {fmtProvider(prov.name)}
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
                            {modelsForProvider.length === 1 ? (
                                <div className="flex items-center h-9 px-3 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">
                                    {modelsForProvider[0].name}
                                </div>
                            ) : (
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
                            )}
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
                                placeholder={
                                    providers.find(p => p.id === form.watch("providerId"))?.name === "google"
                                        ? "AIza****************************"
                                        : "sk-****************************"
                                }
                                {...form.register("apiKey")}
                                className="bg-background border-border"
                                disabled={loading}
                            />
                            {form.formState.errors.apiKey && (
                                <p className="text-xs text-destructive">
                                    {form.formState.errors.apiKey.message}
                                </p>
                            )}
                            <p className="text-base text-muted-foreground mt-3">
                                {providers.find(p => p.id === form.watch("providerId"))?.name === "google"
                                    ? <>Obtén tu key en 👉{" "}<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline cursor-pointer hover:text-foreground transition-colors">aistudio.google.com/apikey</a></>
                                    : <>Obtén tu key en 👉{" "}<a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline cursor-pointer hover:text-foreground transition-colors">platform.openai.com/api-keys</a></>
                                }
                            </p>
                        </div>

                        {/* Temperatura */}
                        <div className="grid gap-2">
                            <Label>Temperatura del agente</Label>
                            <div className="grid grid-cols-3 gap-2">
                                {([
                                    { value: 0,   label: "Preciso",    activeClass: "border-blue-500 bg-blue-500/10 text-blue-500",    hoverClass: "hover:border-blue-400 hover:text-blue-400"    },
                                    { value: 0.2, label: "Balanceado", activeClass: "border-green-500 bg-green-500/10 text-green-500", hoverClass: "hover:border-green-400 hover:text-green-400" },
                                    { value: 0.5, label: "Creativo",   activeClass: "border-amber-500 bg-amber-500/10 text-amber-500", hoverClass: "hover:border-amber-400 hover:text-amber-400" },
                                ] as const).map((opt) => {
                                    const active = form.watch("temperature") === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            disabled={loading}
                                            onClick={() => form.setValue("temperature", opt.value, { shouldDirty: true })}
                                            className={cn(
                                                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                                                active
                                                    ? opt.activeClass
                                                    : `border-border bg-background text-muted-foreground ${opt.hoverClass}`
                                            )}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <DialogFooter className="mt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                                disabled={loading}
                            >
                                Cancelar
                            </Button>
                            <Button variant="save" type="submit" disabled={loading}>
                                {loading ? "Guardando..." : "Guardar"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Origen de la key (solo admin/reseller): Verzay compartida vs propia. */}
            {showOrigin && origin?.configured && (
                origin.accounts > 1 ? (
                    <div
                        className="flex items-center gap-1.5 text-xs font-medium text-blue-600"
                        title={`${origin.accounts} cuentas usan esta misma key (final …${origin.keyTail}). Las keys de Verzay las comparten muchas cuentas; una propia la usa 1 sola.`}
                    >
                        <Building2 className="h-3.5 w-3.5" />
                        Verzay · compartida por {origin.accounts} cuentas
                        {origin.keyTail && <span className="text-muted-foreground">(…{origin.keyTail})</span>}
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600" title="Solo esta cuenta usa esta key.">
                        <UserIcon className="h-3.5 w-3.5" />
                        Propia del cliente
                        {origin.keyTail && <span className="text-muted-foreground">(…{origin.keyTail})</span>}
                    </div>
                )
            )}
            {showOrigin && origin && !origin.configured && (
                <div className="text-xs text-muted-foreground">Sin API key configurada.</div>
            )}
        </div>
    );
}
