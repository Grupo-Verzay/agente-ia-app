// components/forms/ReminderForm.tsx
"use client"

import { useCallback, useEffect, useState } from "react"
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
import { DateTimePicker, SelectComboBox, SelectWorkflowBox } from "@/components/custom"
import { createReminder, getRemindersByUserId, updateReminder } from "@/actions/reminders-actions"
import { useReminderDialogStore } from "@/stores"
import { LeadCreateForm } from "../../sessions/_components"
import { Card } from "@/components/ui/card"

import { SelectMultipleComboBox } from "../../campaigns/_components"

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
}: ReminderInterface) => {
    const router = useRouter();
    const { selectedReminderId: reminderId, isCampaignPage } = useReminderDialogStore();
    const [createLead, setCreateLead] = useState(false);
    const [countScheduleReminders, setCountScheduleReminders] = useState(0);

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
        }
    });

    const isEdit = !!initialData;

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
        mutation.mutate(payload);
    }

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
            <form onSubmit={handleSubmit(onSubmit, onError)} className="flex flex-col gap-4 pr-2 overflow-y-auto max-h-[80vh]">
                {/* Campos ocultos */}
                <>
                    {["userId", "remoteJid", "instanceName", "pushName", "workflowId", "apikey", "serverUrl"].map((name) => (
                        <input key={name} type="hidden" {...register(name as keyof formValuesReminderSchema)} />
                    ))}
                </>

                <Input placeholder="Título" {...register("title")} />
                {errors.title && <p className="text-sm text-red-500">{errors.title.message}</p>}

                <Textarea placeholder="Descripción" {...register("description")} />

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

                {errors.time && <p className="text-sm text-red-500">{errors.time.message}</p>}

                {!isSchedule &&
                    <div>
                        <Controller
                            control={control}
                            name="repeatType"
                            render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <SelectTrigger>
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
                }

                {!isSchedule &&
                    <>
                        <Input type="number" placeholder="Cada cuántos (días/meses...)" {...register("repeatEvery")} />

                        {leads && (isCampaignPage ?
                            <SelectMultipleComboBox
                                leads={leads}
                                onSelect={(leads) => {

                                }}
                                onLeadCreated={() => setCreateLead(true)}
                                initialValue={initialLeadsJids}
                            />
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

                <Button type="submit" disabled={mutation.isPending} className="w-full">
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
        </>
    )
}
