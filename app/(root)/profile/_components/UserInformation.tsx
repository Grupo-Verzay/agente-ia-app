'use client';

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { getClientDataByUserId, updateClientDataByField, updateAbrirPhrase } from "@/actions/userClientDataActions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from 'zod';
import {
    Bell,
    Bot,
    BotOff,
    Building2,
    Camera,
    Clock,
    Database,
    FileSpreadsheet,
    Globe,
    HardDrive,
    Loader2,
    Lock,
    MessageSquare,
    Palette,
    Settings2,
    ShieldCheck,
    Sparkles,
    Timer,
    Wifi,
    Zap,
} from "lucide-react";
import { UserWithPausar } from "@/lib/types";
import { BrandSelector } from "../../../../components/custom";
import { useResellerStore } from "@/stores/resellers/resellerStore";
import { Role } from "@prisma/client";
import { ApiKeyConfigurator, ChangePasswordCard, ChangeEmailCard } from "./";
import { NotificationContactsManager } from "./NotificationContactsManager";
import { UserInformationProps } from "../page";
import { ConnectionMain } from "../../connection/_components";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { optimizeFile } from "../../workflow/[workflowId]/helpers";
import { SafeImage } from "@/components/custom/SafeImage";
import { TimezoneCombobox } from "@/components/shared/TimezoneCombobox";
import { Button } from "@/components/ui/button";
import { UserBackupManager } from "@/components/backup/UserBackupManager";
import dynamic from "next/dynamic";
import type { Plan } from "@prisma/client";
import { PLAN_LABELS } from "@/types/plans";

const MyDataManagement = dynamic(() => import("../../my-data/_components/MyDataManagement").then(m => ({ default: m.MyDataManagement })), { ssr: false });
const MyDataImport = dynamic(() => import("../../my-data/_components/MyDataImport").then(m => ({ default: m.MyDataImport })), { ssr: false });
const MyToolsManagement = dynamic(() => import("../../my-data/_components/MyToolsManagement").then(m => ({ default: m.MyToolsManagement })), { ssr: false });

// ── Schema ────────────────────────────────────────────────────────────────────
const clientSchema = z.object({
    apiUrl: z.string().min(10).max(200),
    company: z.string().max(50).min(3, { message: 'Mínimo 3 caracteres' }),
    notificationNumber: z.string().min(7).max(15),
    delSeguimiento: z.string().min(3).max(45),
    lat: z.string().optional(),
    lng: z.string().optional(),
    mapsUrl: z.string().url({ message: 'URL de Google Maps no válida' }),
    openMsg: z.string().min(3).max(45),
    autoReactivate: z.string(),
    delayTimeGpt: z.string(),
    timezone: z.string().optional(),
});

const defaultImgUrl = 'https://images.pexels.com/photos/133356/pexels-photo-133356.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1';

const ROLE_LABELS: Record<string, string> = {
    user: 'Usuario',
    admin: 'Administrador',
    reseller: 'Reseller',
    super_admin: 'Super Admin',
};

// ── Shared UI helpers ─────────────────────────────────────────────────────────
const FieldGroup = ({
    label,
    hint,
    loading,
    icon: Icon,
    children,
}: {
    label: string;
    hint?: string;
    loading?: boolean;
    icon?: React.ElementType;
    children: React.ReactNode;
}) => (
    <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
            {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
            <Label className="text-sm font-medium">{label}</Label>
            {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground ml-auto" />}
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        {children}
    </div>
);

const InputSuffix = ({
    suffix,
    className,
    ...props
}: React.ComponentProps<typeof Input> & { suffix: string }) => (
    <div className="relative">
        <Input {...props} className={`pr-10 ${className ?? ''}`} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none font-medium">
            {suffix}
        </span>
    </div>
);

// ── Tab content wrapper (consistent inner padding + scroll) ───────────────────
const TabPanel = ({ children }: { children: React.ReactNode }) => (
    <ScrollArea className="h-full">
        <div className="p-4 space-y-4 pb-6">{children}</div>
    </ScrollArea>
);

// ── Section title inside a tab ────────────────────────────────────────────────
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{children}</p>
);

// ── Micro label inside a card (replaces external SectionTitle) ────────────────
const CardLabel = ({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) => (
    <div className="flex items-center gap-1.5 pb-1 border-b border-border">
        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{children}</span>
    </div>
);

// ── Main component ────────────────────────────────────────────────────────────
export const UserInformation = ({ userId, countries, instancesData }: UserInformationProps) => {
    useResellerStore((state) => state.reseller);

    const [user, setUser] = useState<(UserWithPausar & { openMsg?: string })>();
    const [originalUser, setOriginalUser] = useState<(UserWithPausar & { openMsg?: string })>();
    const [loadingField, setLoadingField] = useState<string | null>(null);
    const [timezone, setTimezone] = useState<string>("");
    const fileRef = useRef<HTMLInputElement | null>(null);

    const fetchClientData = useCallback(async () => {
        if (!userId) return toast.error("El usuario no existe.");
        try {
            const result = await getClientDataByUserId(userId);
            if (!result || !result.success || !result.data) {
                return toast.error(result?.message || "Error al cargar los datos.");
            }
            const data = result.data;
            const openMsg = data.pausar.find((p) => p.tipo === "abrir")?.mensaje || "";
            setUser({ ...data, openMsg });
            setOriginalUser({ ...data, openMsg });
            setTimezone(data.timezone ?? "");
        } catch (err) {
            toast.error("Error al obtener datos: " + err);
        }
    }, [userId]);

    useEffect(() => { void fetchClientData(); }, [fetchClientData]);

    const handleBlur = async (field: keyof (UserWithPausar & { openMsg?: string }), valueFied?: string) => {
        if (!user || !originalUser) return;
        const newValue = user[field];
        if (newValue === originalUser[field]) return;

        try {
            const fieldSchema = clientSchema.shape[field as keyof typeof clientSchema.shape];
            fieldSchema.parse(newValue);
            setLoadingField(field);
            toast.loading('Guardando...', { id: field });

            const fieldValue = (field === 'lat' || field === 'lng') ? valueFied ?? '' : String(newValue ?? '');
            const result = field === 'openMsg'
                ? await updateAbrirPhrase(userId, fieldValue)
                : await updateClientDataByField(userId, field, fieldValue);

            if (!result.success) {
                toast.error(result.message || 'Error al guardar.', { id: field });
            } else {
                setOriginalUser(prev => prev ? { ...prev, [field]: newValue } : prev);
                toast.success('Guardado', { id: field });
            }
        } catch (error: any) {
            toast.error(error?.errors?.[0]?.message || 'Error de validación', { id: field });
        } finally {
            setLoadingField(null);
        }
    };

    const handleChange = (field: keyof (UserWithPausar & { openMsg?: string }), value: string) => {
        setUser(prev => prev ? { ...prev, [field]: value } : prev);
    };

    const handleTimezoneChange = async (newTz: string) => {
        if (!newTz || newTz === timezone) return;
        setTimezone(newTz);
        toast.loading("Guardando zona horaria...", { id: "timezone" });
        try {
            const res = await updateClientDataByField(userId, "timezone", newTz);
            if (res.success) {
                setUser(prev => prev ? { ...prev, timezone: newTz } : prev);
                toast.success("Zona horaria actualizada", { id: "timezone" });
            } else {
                toast.error(res.message, { id: "timezone" });
            }
        } catch { toast.error("Error al guardar", { id: "timezone" }); }
    };

    const handleMuteToggle = async (value: boolean) => {
        if (!user) return;
        toast.loading("Actualizando...", { id: "mute" });
        try {
            const res = await updateClientDataByField(userId, "muteAgentResponses", String(value));
            if (res.success) {
                setUser(prev => prev ? { ...prev, muteAgentResponses: value } : prev);
                toast.success(value ? "Agente silenciado" : "Agente activado", { id: "mute" });
            } else {
                toast.error(res.message, { id: "mute" });
            }
        } catch { toast.error("Error al actualizar", { id: "mute" }); }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !userId) return toast.error('No hay archivo seleccionado');
        const toastId = toast.loading('Subiendo avatar...');
        setLoadingField('image');
        try {
            const content = await file.arrayBuffer();
            const optimizedFile = await optimizeFile({
                name: file.name, size: file.size, type: file.type,
                content: Array.from(new Uint8Array(content)),
            });
            const blob = new Blob([new Uint8Array(optimizedFile.buffer)], { type: optimizedFile.type });
            const formData = new FormData();
            formData.append('file', blob);
            formData.append('userID', userId);
            formData.append('workflowID', userId);

            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            if (!res.ok) throw new Error(await res.text());
            const { url } = await res.json();

            const result = await updateClientDataByField(userId, 'image', url);
            if (!result.success) throw new Error(result.message);
            setUser(prev => prev ? { ...prev, image: url } : prev);
            toast.success('Avatar actualizado', { id: toastId });
        } catch (error: any) {
            toast.error(error?.message || 'Error al subir el avatar', { id: toastId });
        } finally {
            setLoadingField(null);
        }
    };

    const [activeTab, setActiveTab] = useState('conexion');
    const [showMoreTabs, setShowMoreTabs] = useState(false);

    if (!user) return null;

    const isMuted = user.muteAgentResponses ?? false;
    const isReseller = user.role === Role.reseller;

    const primaryTabs = [
        { value: 'conexion', label: 'Conexión', icon: Wifi },
        { value: 'integraciones', label: 'Integraciones', icon: Zap },
        { value: 'preferencias', label: 'Preferencias', icon: Settings2 },
    ];

    const secondaryTabs = [
        { value: 'comportamiento', label: 'Comportamiento', icon: Timer },
        { value: 'herramientas', label: 'Herramientas', icon: Database },
        { value: 'seguridad', label: 'Seguridad', icon: ShieldCheck },
        { value: 'respaldo', label: 'Respaldo', icon: HardDrive },
        ...(isReseller ? [{ value: 'apariencia', label: 'Apariencia', icon: Palette }] : []),
    ];

    const tabs = [...primaryTabs, ...secondaryTabs];

    return (
        <div className="flex flex-col h-full gap-0">

            {/* ── PROFILE STRIP ─────────────────────────────────────────── */}
            <Card className="border-border rounded-xl shrink-0 mb-4">
                <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center gap-3 sm:gap-4">

                        {/* Avatar */}
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden border-2 border-border shrink-0 group cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                        >
                            <SafeImage
                                src={(user.image as string) ?? defaultImgUrl}
                                alt="avatar"
                                fill
                                sizes="56px"
                                className="object-cover"
                            />
                            <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                {loadingField === 'image'
                                    ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                                    : <Camera className="w-4 h-4 text-white" />}
                            </div>
                        </button>

                        <Input id="avatar" type="file" accept="image/*" ref={fileRef} onChange={handleImageUpload} className="hidden" />

                        {/* Name + meta */}
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-sm sm:text-base truncate">
                                    {user.name ?? 'Sin nombre'}
                                </span>
                                <Badge variant="secondary" className="text-xs shrink-0">
                                    {ROLE_LABELS[user.role] ?? user.role}
                                </Badge>
                            </div>
                            <p className="text-xs sm:text-sm text-muted-foreground truncate">{user.email}</p>
                        </div>

                        {/* Status pill */}
                        <div className="shrink-0 hidden xs:flex items-center gap-1.5 text-xs text-muted-foreground">
                            {isMuted
                                ? <><BotOff className="w-3.5 h-3.5 text-destructive" /><span className="hidden sm:inline text-destructive">Silenciado</span></>
                                : <><Bot className="w-3.5 h-3.5 text-green-500" /><span className="hidden sm:inline text-green-600 dark:text-green-400">Activo</span></>
                            }
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ── TABBED WIZARD ─────────────────────────────────────────── */}
            <Tabs
                defaultValue="conexion"
                className="flex flex-col flex-1 min-h-0"
                onValueChange={setActiveTab}
            >
                {/* Tab nav */}
                <TabsList className="w-full h-auto bg-transparent p-0 rounded-none border-b border-border justify-start gap-0 shrink-0 overflow-x-auto">
                    {tabs.map(({ value, label, icon: Icon }) => (
                        <TabsTrigger
                            key={value}
                            value={value}
                            className="
                                relative flex items-center gap-1.5 px-3 py-2.5 h-auto text-xs sm:text-sm
                                font-medium rounded-none border-b-2 border-transparent -mb-px
                                text-muted-foreground bg-transparent shadow-none
                                data-[state=active]:border-primary data-[state=active]:text-foreground
                                data-[state=active]:bg-primary/10 data-[state=active]:shadow-none
                                hover:text-foreground hover:bg-muted/50 transition-colors whitespace-nowrap
                            "
                        >
                            <Icon className="w-4 h-4 shrink-0" />
                            <span className="hidden sm:inline">{label}</span>
                        </TabsTrigger>
                    ))}
                </TabsList>

                {/* Active tab breadcrumb — visible only on mobile where labels are hidden */}
                {(() => {
                    const current = tabs.find(t => t.value === activeTab);
                    if (!current) return null;
                    const ActiveIcon = current.icon;
                    return (
                        <div className="flex items-center gap-2 px-1 py-2 sm:hidden shrink-0 border-b border-border/50">
                            <ActiveIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="text-sm font-medium text-foreground">{current.label}</span>
                        </div>
                    );
                })()}

                {/* Content area — absolute-filled so all panels share the same space */}
                <div className="flex-1 min-h-0 relative mt-1">

                    {/* ── Tab: Conexión ─────────────────────────── */}
                    <TabsContent value="conexion" className="absolute inset-0 mt-0 data-[state=inactive]:pointer-events-none">
                        <TabPanel>
                            <SectionTitle>Canal de comunicación</SectionTitle>
                            <div className="flex flex-col lg:flex-row gap-2">
                                <ConnectionMain
                                    user={user}
                                    instance={instancesData["Whatsapp"].instance}
                                    instanceInfo={instancesData["Whatsapp"].info}
                                    instanceType={"Whatsapp"}
                                    prompts={instancesData["Whatsapp"].prompts}
                                />
                                {/* Instagram no está en uso actualmente */}
                                {/* <ConnectionMain
                                user={user}
                                instance={instancesData["Instagram"].instance}
                                instanceInfo={instancesData["Instagram"].info}
                                instanceType={"Instagram"}
                                prompts={instancesData["Instagram"].prompts}
                            /> */}

                                {/* Estado del agente */}
                                <Card className="border-border flex flex-1 flex-col">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                {isMuted ? <BotOff className="w-4 h-4 text-primary" /> : <Bot className="w-4 h-4 text-primary" />}
                                            </div>
                                            <div>
                                                <CardTitle className="text-sm font-semibold">Estado del agente</CardTitle>
                                                <CardDescription className="text-xs">
                                                    {isMuted ? "El bot no enviará respuestas automáticas." : "El bot responde automáticamente a tus contactos."}
                                                </CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="flex flex-col flex-1">
                                        <div className="flex items-center justify-between mt-auto">
                                            <Button
                                                variant={"outline"}
                                                className={`text-xs ${!isMuted ? "text-green-600 border-green-600 dark:text-green-400 dark:border-green-400" : ""}`}
                                            >
                                                {isMuted ? "Silenciado" : "Activo"}
                                            </Button>
                                            <Switch checked={!isMuted} onCheckedChange={(v) => handleMuteToggle(!v)} />
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabPanel>
                    </TabsContent>

                    {/* ── Tab: Integraciones ────────────────────── */}
                    <TabsContent value="integraciones" className="absolute inset-0 mt-0 data-[state=inactive]:pointer-events-none">
                        <TabPanel>
                            <div className="grid gap-4 lg:grid-cols-2">
                                <Card className="border-border flex flex-col">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                <Zap className="w-4 h-4 text-primary" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-sm font-semibold">Proveedor de IA</CardTitle>
                                                <CardDescription className="text-xs">Configura tu clave de acceso al modelo de IA</CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="flex flex-col flex-1 gap-4">
                                        <ApiKeyConfigurator userId={userId} onSaved={() => { }} />
                                        <p className="text-sm text-muted-foreground">
                                            Obtén tu API key en el portal de tu proveedor. Para: OpenAI - Google
                                        </p>
                                    </CardContent>
                                </Card>

                                <Card className="border-border flex flex-col">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                <Bell className="w-4 h-4 text-primary" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-sm font-semibold">Contactos de notificación</CardTitle>
                                                <CardDescription className="text-xs">Números que reciben alertas del sistema</CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="flex flex-col flex-1 gap-4">
                                        <NotificationContactsManager
                                            userId={userId}
                                            primaryNumber={(user.notificationNumber as string) ?? ""}
                                        />
                                    </CardContent>
                                </Card>
                            </div>
                        </TabPanel>
                    </TabsContent>

                    {/* ── Tab: Preferencias ────────────────────── */}
                    <TabsContent value="preferencias" className="absolute inset-0 mt-0 data-[state=inactive]:pointer-events-none">
                        <TabPanel>
                            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2">
                                <Card className="border-border flex flex-1 flex-col">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                <Globe className="w-4 h-4 text-primary" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-sm font-semibold">Zona horaria</CardTitle>
                                                <CardDescription className="text-xs">Región para fechas y horarios del sistema</CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <TimezoneCombobox value={timezone} onChange={handleTimezoneChange} />
                                    </CardContent>
                                </Card>

                                <Card className="border-border flex flex-1 flex-col">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                <Building2 className="w-4 h-4 text-primary" />
                                            </div>
                                            <div className="flex-1">
                                                <CardTitle className="text-sm font-semibold">Empresa</CardTitle>
                                                <CardDescription className="text-xs">Nombre visible en el sistema</CardDescription>
                                            </div>
                                            {loadingField === "company" && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <Input
                                            id="company"
                                            name="company"
                                            placeholder="Acme Corp."
                                            value={(user.company as string) ?? ""}
                                            disabled={loadingField === "company"}
                                            onChange={(e) => handleChange("company", e.target.value)}
                                            onBlur={() => handleBlur("company")}
                                        />
                                    </CardContent>
                                </Card>
                            </div>
                        </TabPanel>
                    </TabsContent>

                    {/* ── Tab: Comportamiento ───────────────────── */}
                    <TabsContent value="comportamiento" className="absolute inset-0 mt-0 data-[state=inactive]:pointer-events-none">
                        <TabPanel>
                            <SectionTitle>Tiempos de respuesta</SectionTitle>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Card className="border-border">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                <Clock className="w-4 h-4 text-primary" />
                                            </div>
                                            <div className="flex-1">
                                                <CardTitle className="text-sm font-semibold">Reactivación automática</CardTitle>
                                                <CardDescription className="text-xs">Tiempo sin mensajes antes de reactivar</CardDescription>
                                            </div>
                                            {loadingField === "autoReactivate" && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <InputSuffix
                                            id="autoReactivate"
                                            type="number"
                                            min={0}
                                            suffix="min"
                                            value={user.autoReactivate != null ? String(user.autoReactivate) : ""}
                                            disabled={loadingField === "autoReactivate"}
                                            onChange={(e) => handleChange("autoReactivate", e.target.value)}
                                            onBlur={() => handleBlur("autoReactivate")}
                                        />
                                    </CardContent>
                                </Card>

                                <Card className="border-border">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                <Timer className="w-4 h-4 text-primary" />
                                            </div>
                                            <div className="flex-1">
                                                <CardTitle className="text-sm font-semibold">Retraso de respuesta IA</CardTitle>
                                                <CardDescription className="text-xs">Espera antes de enviar cada respuesta</CardDescription>
                                            </div>
                                            {loadingField === "delayTimeGpt" && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <InputSuffix
                                            id="delayTimeGpt"
                                            type="number"
                                            min={0}
                                            suffix="seg"
                                            value={user.delayTimeGpt != null ? String(user.delayTimeGpt) : ""}
                                            disabled={loadingField === "delayTimeGpt"}
                                            onChange={(e) => handleChange("delayTimeGpt", e.target.value)}
                                            onBlur={() => handleBlur("delayTimeGpt")}
                                        />
                                    </CardContent>
                                </Card>
                            </div>

                            <SectionTitle>Frases automáticas</SectionTitle>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Card className="border-border">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                <MessageSquare className="w-4 h-4 text-primary" />
                                            </div>
                                            <div className="flex-1">
                                                <CardTitle className="text-sm font-semibold">Frase de reactivación</CardTitle>
                                                <CardDescription className="text-xs">Mensaje enviado al reactivar una conversación</CardDescription>
                                            </div>
                                            {loadingField === "openMsg" && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <Input
                                            id="openMsg"
                                            name="openMsg"
                                            placeholder="Fue un gusto ayudarle."
                                            value={(user.openMsg as string) ?? ""}
                                            disabled={loadingField === "openMsg"}
                                            onChange={(e) => handleChange("openMsg", e.target.value)}
                                            onBlur={() => handleBlur("openMsg")}
                                        />
                                    </CardContent>
                                </Card>

                                <Card className="border-border">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                <MessageSquare className="w-4 h-4 text-primary" />
                                            </div>
                                            <div className="flex-1">
                                                <CardTitle className="text-sm font-semibold">Frase de desactivación</CardTitle>
                                                <CardDescription className="text-xs">Mensaje enviado al finalizar el seguimiento</CardDescription>
                                            </div>
                                            {loadingField === "delSeguimiento" && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <Input
                                            id="delSeguimiento"
                                            name="delSeguimiento"
                                            placeholder="Fue un gusto ayudarle."
                                            value={(user.delSeguimiento as string) ?? ""}
                                            disabled={loadingField === "delSeguimiento"}
                                            onChange={(e) => handleChange("delSeguimiento", e.target.value)}
                                            onBlur={() => handleBlur("delSeguimiento")}
                                        />
                                    </CardContent>
                                </Card>
                            </div>
                        </TabPanel>
                    </TabsContent>

                    {/* ── Tab: Seguridad ───────────────────────── */}
                    <TabsContent value="seguridad" className="absolute inset-0 mt-0 data-[state=inactive]:pointer-events-none">
                        <TabPanel>
                            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                                <ChangeEmailCard currentEmail={user.email ?? ""} />
                                <ChangePasswordCard />
                            </div>
                        </TabPanel>
                    </TabsContent>

                    {/* ── Tab: Respaldo ────────────────────────── */}
                    <TabsContent value="respaldo" className="absolute inset-0 mt-0 data-[state=inactive]:pointer-events-none">
                        <TabPanel>
                            <UserBackupManager
                                targetUserId={userId}
                                subjectLabel={user.company ?? user.name ?? "tu cuenta"}
                                twoColumns
                            />
                        </TabPanel>
                    </TabsContent>

                    {/* ── Tab: Herramientas ────────────────────── */}
                    <TabsContent value="herramientas" className="absolute inset-0 mt-0 data-[state=inactive]:pointer-events-none">
                        <TabPanel>
                            {!(['intermedio', 'avanzado', 'enterprise', 'personalizado', 'unico'] as Plan[]).includes((user as any).plan) ? (
                                <div className="flex flex-col items-center justify-center min-h-[50vh] px-4">
                                    <Card className="w-full max-w-md border-dashed">
                                        <CardHeader className="items-center text-center pb-3">
                                            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-3">
                                                <Lock className="h-7 w-7 text-muted-foreground" />
                                            </div>
                                            <CardTitle className="text-xl">Funcionalidad no disponible</CardTitle>
                                            <CardDescription className="text-sm">
                                                Tu plan actual no incluye la gestión de datos externos.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="flex flex-col items-center gap-4 text-center">
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <span>Plan actual:</span>
                                                <Badge variant="outline">{PLAN_LABELS[(user as any).plan as Plan]}</Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                                Disponible desde el plan <strong>Intermedio</strong>. Contacta a tu administrador para actualizar tu plan.
                                            </p>
                                            <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                                                {(['intermedio', 'avanzado', 'enterprise', 'personalizado', 'unico'] as Plan[]).map((plan) => (
                                                    <Badge key={plan} className="text-xs bg-primary/10 text-primary border-primary/20">
                                                        <Sparkles className="h-2.5 w-2.5 mr-1" />
                                                        {PLAN_LABELS[plan]}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            ) : (
                                <Tabs defaultValue="tools">
                                    <TabsList className="mb-4">
                                        <TabsTrigger value="tools" className="gap-2">
                                            <Bot className="h-4 w-4" />
                                            Herramientas IA
                                        </TabsTrigger>
                                        <TabsTrigger value="import" className="gap-2">
                                            <FileSpreadsheet className="h-4 w-4" />
                                            Importar
                                        </TabsTrigger>
                                        <TabsTrigger value="management" className="gap-2">
                                            <Database className="h-4 w-4" />
                                            Gestión
                                        </TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="tools">
                                        <MyToolsManagement userId={userId} />
                                    </TabsContent>
                                    <TabsContent value="import">
                                        <MyDataImport userId={userId} />
                                    </TabsContent>
                                    <TabsContent value="management">
                                        <MyDataManagement userId={userId} />
                                    </TabsContent>
                                </Tabs>
                            )}
                        </TabPanel>
                    </TabsContent>

                    {/* ── Tab: Apariencia (reseller only) ─────── */}
                    {isReseller && (
                        <TabsContent value="apariencia" className="absolute inset-0 mt-0 data-[state=inactive]:pointer-events-none">
                            <TabPanel>
                                <SectionTitle>Tema del panel</SectionTitle>
                                <Card className="border-border">
                                    <CardContent className="pt-4">
                                        <p className="text-xs text-muted-foreground mb-3">
                                            Personaliza los colores del panel para tus clientes.
                                        </p>
                                        <BrandSelector />
                                    </CardContent>
                                </Card>
                            </TabPanel>
                        </TabsContent>
                    )}

                </div>
            </Tabs>
        </div>
    );
};
