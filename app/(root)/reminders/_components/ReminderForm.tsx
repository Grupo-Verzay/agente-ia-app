// components/forms/ReminderForm.tsx
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { formValuesReminderSchema, ReminderInterface, reminderSchema, repeatTypes } from "@/schema/reminder"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
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

import { SelectMultipleComboBox, CampaignSegmentPanel } from "../../campaigns/_components"

import { Reminders } from '@prisma/client';
import { TimeInput } from "@/components/shared/TimeInput"
import { Session } from "@prisma/client"

export const ReminderForm = ({
    userId,
    serverUrl,
    apikey,
    leads,
    workflows,
    instanceNameReminder,
    onSuccess,
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
        ? `${initialData.pushName || 'Sin nombre'} ${initialData?.remoteJid.split('@')[0]}`
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
        if (pendingPayload.current) mutation.mutate(pendingPayload.current);
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
            <form onSubmit={handleSubmit(onSubmit, onError)} className="flex flex-col gap-2 pr-2 overflow-y-auto max-h-[80vh]">
                {/* Campos ocultos */}
                <>
                    {["userId", "remoteJid", "instanceName", "pushName", "workflowId", "apikey", "serverUrl"].map((name) => (
                        <input key={name} type="hidden" {...register(name as keyof formValuesReminderSchema)} />
                    ))}
                </>

                <Input placeholder="Título" className="h-8 text-sm" {...register("title")} />
                {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}

                {(() => {
                    const { ref: rhfRef, ...descRest } = register("description");
                    return (
                        <Textarea
                            placeholder="Descripción"
                            rows={2}
                            className="min-h-0 resize-none text-sm"
                            {...descRest}
                            ref={(el) => { rhfRef(el); (textareaRef as any).current = el; }}
                        />
                    );
                })()}
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
                    <Controller
                        control={control}
                        name="repeatType"
                        render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger className="h-8 text-sm">
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
                }

                {!isSchedule &&
                    <>
                        <Input type="number" placeholder="Cada cuántos (días/meses...)" className="h-8 text-sm" {...register("repeatEvery")} />

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

                <Button type="submit" disabled={mutation.isPending} className="w-full h-8 text-sm">
                    {mutation.isPending ? "Guardando..." : isEdit ? `Actualizar ${modalTitle}` : `Crear ${modalTitle}`}
                </Button>
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
                                <p className="text-xs text-muted-foreground">
                                    Al confirmar, aceptas que el uso de esta función es bajo tu propia responsabilidad.
                                </p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-row justify-between sm:flex-row">
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmCampaign} className="bg-red-600 hover:bg-red-700 text-white">
                            Continuar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
