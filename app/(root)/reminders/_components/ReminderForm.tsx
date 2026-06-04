// components/forms/ReminderForm.tsx
"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { fmtPhone } from "@/lib/whatsapp-jid"
import { Controller, useForm } from "react-hook-form"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { formValuesReminderSchema, ReminderInterface, reminderSchema, repeatTypes } from "@/schema/reminder"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DateTimePicker, SelectComboBox, SelectWorkflowBox } from "@/components/custom"
import { createReminder, getRemindersByUserId, updateReminder } from "@/actions/reminders-actions"
import { useReminderDialogStore } from "@/stores"
import { LeadCreateForm } from "../../sessions/_components"
import { Card } from "@/components/ui/card"
import { FileAudio, FileText, ImageIcon, Paperclip, Trash2, Video } from "lucide-react"

import { SelectMultipleComboBox, CampaignSegmentPanel } from "../../campaigns/_components"

import { Reminders } from '@prisma/client';
import { TimeInput } from "@/components/shared/TimeInput"
import { Session } from "@prisma/client"

type ReminderMediaPreview = {
    fileName: string;
    mimeType: string;
    size: number;
    type: "image" | "video" | "audio" | "document";
};

const MEDIA_OPTIONS = [
    { type: "image", label: "Imagen", accept: "image/*", Icon: ImageIcon },
    { type: "video", label: "Video", accept: "video/*", Icon: Video },
    { type: "audio", label: "Audio", accept: "audio/*", Icon: FileAudio },
    { type: "document", label: "Doc.", accept: ".pdf,.doc,.docx,.xls,.xlsx,.csv,application/pdf", Icon: FileText },
] as const;

function formatFileSize(bytes: number) {
    if (!bytes) return "0 KB";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const ReminderForm = ({
    userId,
    serverUrl,
    apikey,
    leads,
    workflows,
    instanceNameReminder,
    onSuccess,
    onCancel,
    initialData,
    isSchedule,
    forceCreate,
}: ReminderInterface) => {
    const router = useRouter();
    const { selectedReminderId: reminderId, isCampaignPage } = useReminderDialogStore();
    const [createLead, setCreateLead] = useState(false);
    const [countScheduleReminders, setCountScheduleReminders] = useState(0);
    const [segmentKey, setSegmentKey] = useState(0);
    const [showCampaignWarning, setShowCampaignWarning] = useState(false);
    const [mediaPreview, setMediaPreview] = useState<ReminderMediaPreview | null>(null);
    const [mediaAccept, setMediaAccept] = useState("image/*");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pendingPayload = useRef<formValuesReminderSchema | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const insertVariable = (variable: string) => {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart ?? 0;
        const end   = el.selectionEnd   ?? 0;
        const current = el.value;
        const next = current.slice(0, start) + variable + current.slice(end);
        setValue("description", next, { shouldValidate: true });
        // Restore cursor after inserted text
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(start + variable.length, start + variable.length);
        });
    };

    const reminderForm = useForm<formValuesReminderSchema>({
        resolver: zodResolver(reminderSchema),
        defaultValues: initialData || {
            title: "",
            description: "",
            time: "",
            repeatType: "NONE",
            repeatEvery: undefined,
            userId: userId,
            remoteJid: "",
            instanceName: "",
            pushName: "",
            workflowId: "",
            apikey: "",
            serverUrl: "",
            isSchedule: isSchedule ?? false,
            campaignMinDelay: 20,
            campaignMaxDelay: 60,
        }
    });

    const isEdit = !!initialData && !forceCreate;

    useEffect(() => {
        const fetchReminders = async () => {
            try {
                const reminders = await getRemindersByUserId(userId)
                if (!reminders.success) return;
                const dataReminder = reminders.data as Reminders[];
                const filtered = dataReminder.filter((r) => r.isSchedule === true)
                setCountScheduleReminders(filtered.length)
            } catch (error) {
                console.error("Error al obtener recordatorios:", error)
            }
        }
        fetchReminders()
    }, [userId]);

    const {
        control,
        getValues,
        register,
        handleSubmit,
        reset,
        setValue,
        watch,
        formState: { errors }
    } = reminderForm;

    const initialLeadValue = initialData && initialData?.remoteJid
        ? `${initialData.pushName || 'Sin nombre'} ${fmtPhone(initialData?.remoteJid)}`
        : undefined;

    // Lógica para inicializar con múltiples leads
    const initialLeadsJids = initialData?.remoteJid
        ? initialData.remoteJid.split(',')
        : [];

    // IDs de sesión (para SelectMultipleComboBox que filtra por id.toString())
    const [campaignInitialIds, setCampaignInitialIds] = useState<string[]>(() =>
        (leads ?? []).filter(l => initialLeadsJids.includes(l.remoteJid)).map(l => l.id.toString())
    );

    const handleSegmentApply = (matching: Session[]) => {
        setValue("remoteJid", matching.map(l => l.remoteJid).join(','), { shouldValidate: true });
        setValue("pushName", matching.map(l => l.pushName).join(','), { shouldValidate: true });
        setCampaignInitialIds(matching.map(l => l.id.toString()));
        setSegmentKey(k => k + 1);
    };

    const initialWorkflowId = initialData?.workflowId;

    const mutation = useMutation({
        mutationFn: async (data: formValuesReminderSchema) => {
            return isEdit ? updateReminder(reminderId?.toString() ?? '', data) : createReminder(data);
        },
        onSuccess: (res) => {
            reset()
            if (!res.success) return toast.error(res.message)
            toast.success(res.message)
            router.refresh()
            setCountScheduleReminders((c) => c + 1)
            if (onSuccess) onSuccess()
        },
        onError: () => {
            toast.error("Error inesperado al guardar recordatorio")
        }
    });

    useEffect(() => {
        const v = getValues();
        if (apikey && v.apikey !== apikey) setValue("apikey", apikey);
        if (serverUrl && v.serverUrl !== serverUrl) setValue("serverUrl", serverUrl);
        if (instanceNameReminder && v.instanceName !== instanceNameReminder) {
            setValue("instanceName", instanceNameReminder);
        }
    }, [apikey, serverUrl, getValues, instanceNameReminder, setValue]);

    const handleTimeChange = useCallback((value: string) => {
        setValue("time", value);
    }, [setValue]);

    const handlePickMedia = (option: (typeof MEDIA_OPTIONS)[number]) => {
        setMediaAccept(option.accept);
        requestAnimationFrame(() => fileInputRef.current?.click());
    };

    const handleMediaSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const detectedType =
            file.type.startsWith("image/")
                ? "image"
                : file.type.startsWith("video/")
                    ? "video"
                    : file.type.startsWith("audio/")
                        ? "audio"
                        : "document";

        setMediaPreview({
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            type: detectedType,
        });
    };

    const clearMediaPreview = () => {
        setMediaPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const modalTitle = isCampaignPage ? 'campaña' : 'recordatorio';

    const onSubmit = (payload: formValuesReminderSchema) => {
        if (countScheduleReminders >= 10) return toast.info('No se pueden crear más de 10 recordatorios en el módulo de agendamiento.');
        // Campañas: mostrar advertencia antes de confirmar
        if (isCampaignPage && !isEdit) {
            pendingPayload.current = payload;
            setShowCampaignWarning(true);
            return;
        }
        mutation.mutate(payload);
    };

    const handleConfirmCampaign = () => {
        if (pendingPayload.current && !mutation.isPending) {
            const payload = pendingPayload.current;
            pendingPayload.current = null;
            mutation.mutate(payload);
        }
        setShowCampaignWarning(false);
    };

    const onError = (errors: typeof reminderForm.formState.errors) => {
        const messages = Object.values(errors).map(err => err?.message).filter(Boolean)
        toast.error("Revisa los campos obligatorios", {
            description: (
                <ul className="text-xs mt-2 space-y-1 list-disc list-inside">
                    {messages.map((msg, i) => <li key={i}>{msg}</li>)}
                </ul>
            )
        })
    }

    return (
        <>
            <form onSubmit={handleSubmit(onSubmit, onError)} className="flex flex-col flex-1 min-h-0 h-full">
                {/* Campos ocultos */}
                <>
                    {["userId", "remoteJid", "instanceName", "pushName", "workflowId", "apikey", "serverUrl"].map((name) => (
                        <input key={name} type="hidden" {...register(name as keyof formValuesReminderSchema)} />
                    ))}
                </>

                <div className="flex flex-col gap-2.5 flex-1 min-h-0 overflow-y-auto px-1 pb-1 pt-1">

                <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-semibold">Título</Label>
                    <Input placeholder="Ej: Recordatorio cita" {...register("title")} />
                    {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-semibold">Mensaje</Label>
                    {(() => {
                        const { ref: rhfRef, ...descRest } = register("description");
                        return (
                            <Textarea
                                placeholder="Hola @client_name, te recordamos que..."
                                className="resize-none text-sm flex-1 min-h-[72px]"
                                {...descRest}
                                ref={(el) => { rhfRef(el); (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el; }}
                            />
                        );
                    })()}
                </div>

                <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/15 px-3 py-2.5">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={mediaAccept}
                        className="hidden"
                        onChange={handleMediaSelected}
                    />
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground shadow-sm">
                                <Paperclip className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold leading-tight">Archivo multimedia</p>
                                <p className="truncate text-[11px] text-muted-foreground">Opcional para enviar junto al recordatorio</p>
                            </div>
                        </div>
                        {mediaPreview && (
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={clearMediaPreview}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                        {MEDIA_OPTIONS.map((option) => {
                            const Icon = option.Icon;
                            return (
                                <Button
                                    key={option.type}
                                    type="button"
                                    variant={mediaPreview?.type === option.type ? "default" : "outline"}
                                    size="sm"
                                    className="h-8 gap-1 px-2 text-xs"
                                    onClick={() => handlePickMedia(option)}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    <span className="truncate">{option.label}</span>
                                </Button>
                            );
                        })}
                    </div>

                    {mediaPreview ? (
                        <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                {mediaPreview.type === "image" ? <ImageIcon className="h-4 w-4" /> :
                                    mediaPreview.type === "video" ? <Video className="h-4 w-4" /> :
                                        mediaPreview.type === "audio" ? <FileAudio className="h-4 w-4" /> :
                                            <FileText className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">{mediaPreview.fileName}</p>
                                <p className="text-xs text-muted-foreground">{formatFileSize(mediaPreview.size)} · {mediaPreview.mimeType}</p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-[11px] text-muted-foreground">Selecciona una imagen, video, audio o documento.</p>
                    )}
                </div>
                {isCampaignPage && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-muted-foreground">Variables:</span>
                        {['{{nombre}}', '{{telefono}}', '{{fecha}}'].map(v => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => insertVariable(v)}
                                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                )}

                {!isSchedule ? (
                    <DateTimePicker
                        isSchedule={false}
                        value={watch("time")}
                        onChange={handleTimeChange}
                    />
                ) : (
                    <TimeInput
                        className="text-xs text-muted-foreground"
                        onChange={handleTimeChange}
                        currentValue={initialData?.time ?? 'minutes-0'}
                    />
                )}

                {errors.time && <p className="text-xs text-red-500">{errors.time.message}</p>}

                {!isSchedule &&
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-sm font-semibold">Repetición</Label>
                            <Controller
                                control={control}
                                name="repeatType"
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <SelectTrigger className="text-sm">
                                            <SelectValue placeholder="Seleccionar" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {repeatTypes.map((rt) => (
                                                <SelectItem key={rt.value} value={rt.value}>
                                                    {rt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-sm font-semibold">Repetir cada</Label>
                            <Input type="number" placeholder="Ej: 7" className="text-sm" {...register("repeatEvery")} />
                        </div>
                    </div>
                }

                {!isSchedule &&
                    <>

                        {leads && (isCampaignPage ?
                            <div className="space-y-1.5">
                                <CampaignSegmentPanel
                                    leads={leads}
                                    onApply={handleSegmentApply}
                                />

                                {/* Pausa entre envíos */}
                                <div className="rounded-lg border border-border bg-muted/10 px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
                                            Pausa entre envíos
                                        </p>
                                        <div className="flex items-center gap-1.5 flex-1">
                                            <span className="text-[10px] text-muted-foreground shrink-0">mín</span>
                                            <Input
                                                type="number"
                                                min={5} max={600}
                                                className="h-7 text-xs w-16"
                                                {...register("campaignMinDelay")}
                                            />
                                            <span className="text-[10px] text-muted-foreground shrink-0">máx</span>
                                            <Input
                                                type="number"
                                                min={5} max={600}
                                                className="h-7 text-xs w-16"
                                                {...register("campaignMaxDelay")}
                                            />
                                            <span className="text-[10px] text-muted-foreground shrink-0">seg</span>
                                        </div>
                                    </div>
                                </div>

                                <SelectMultipleComboBox
                                    key={segmentKey}
                                    leads={leads}
                                    onSelect={(selected) => {
                                        setValue("remoteJid", selected.map(l => l.remoteJid).join(','), { shouldValidate: true });
                                        setValue("pushName", selected.map(l => l.pushName).join(','), { shouldValidate: true });
                                        setCampaignInitialIds(selected.map(l => l.id.toString()));
                                    }}
                                    onLeadCreated={() => setCreateLead(true)}
                                    initialValue={campaignInitialIds}
                                />
                            </div>
                            :
                            <SelectComboBox
                                leads={leads}
                                onSelect={(lead) => {
                                    setValue("userId", lead.userId, { shouldValidate: true })
                                    setValue("remoteJid", lead.remoteJid, { shouldValidate: true })
                                    setValue("instanceName", lead.instanceId, { shouldValidate: true })
                                    setValue("pushName", lead.pushName, { shouldValidate: true })
                                }}
                                onLeadCreated={() => setCreateLead(true)}
                                initialValue={initialLeadValue}
                            />)}

                        {workflows &&
                            <SelectWorkflowBox
                                workflows={workflows}
                                onSelect={(workflow) => setValue("workflowId", workflow.id, { shouldValidate: true })}
                                initialValue={initialWorkflowId}
                            />}

                    </>
                }

                </div>

                <div className="flex justify-between gap-2 pt-3 mt-2 shrink-0 pb-3">
                    <Button type="button" variant="secondary" onClick={onCancel}>
                        Cancelar
                    </Button>
                    <Button type="submit" variant="save" disabled={mutation.isPending}>
                        {mutation.isPending ? "Guardando..." : isEdit ? "Actualizar" : `Crear ${modalTitle}`}
                    </Button>
                </div>
            </form>

            {createLead && (
                <Card className="p-4 border-border">
                    <LeadCreateForm
                        userId={userId}
                        instanceId={instanceNameReminder}
                        onCreated={() => setCreateLead(false)}
                        onCancel={() => setCreateLead(false)}
                    />
                </Card>
            )}

            {/* Advertencia de campaña */}
            <AlertDialog open={showCampaignWarning} onOpenChange={setShowCampaignWarning}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            ⚠️ Riesgo de bloqueo en WhatsApp
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-3 text-sm text-foreground/80">
                                <p>
                                    El envío masivo de mensajes puede violar los <strong>Términos de Servicio de WhatsApp</strong> y provocar la <strong>suspensión o baneo permanente</strong> de tu número.
                                </p>
                                <ul className="space-y-1.5 text-xs list-none">
                                    <li>✅ Envía solo a contactos que te han escrito antes</li>
                                    <li>✅ Usa el delay entre mensajes para no parecer un bot</li>
                                    <li>✅ Personaliza cada mensaje con las variables disponibles</li>
                                    <li>❌ Evita listas frías o contactos que no te conocen</li>
                                    <li>❌ No envíes el mismo mensaje idéntico a muchos contactos</li>
                                </ul>
                                <p className="text-sm font-semibold text-foreground">
                                    Al Continuar, aceptas que el uso de esta función es bajo tu propia responsabilidad.
                                </p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex justify-between items-center mt-4">
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmCampaign} disabled={mutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
                            {mutation.isPending ? "Creando..." : "Continuar"}
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
