// components/reminders/ReminderModal.tsx
"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useReminderDialogStore, closeDialog } from "@/stores"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { Suspense } from "react"
import { CreateReminderSkeleton, ReminderForm } from "./"
import { ApiKey, Session, Workflow, User, Instancia } from "@prisma/client"

interface ReminderModalProps {
    user: User
    apiKey: ApiKey | null
    leads: Session[]
    workflows: Workflow[]
    instancia: Instancia
    isSchedule?: boolean
}

export const ReminderModal = ({ user, apiKey, leads, workflows, instancia, isSchedule }: ReminderModalProps) => {
    const { openDialog, reminderData, isCampaignPage } = useReminderDialogStore();

    const modalTitle = isCampaignPage ? 'campaña' : 'recordatorio';

    const transformedReminder = reminderData
        ? {
            title: reminderData.title || '',
            time: reminderData.time || '',
            repeatType: reminderData.repeatType || '',
            instanceName: reminderData.instanceName || '',
            pushName: reminderData.pushName || '',
            serverUrl: apiKey?.url || '',
            apikey: apiKey?.key || '',
            userId: reminderData.userId || '',
            workflowId: reminderData?.workflowId || '',
            remoteJid: reminderData.remoteJid || '',
            description: reminderData.description || '',
            repeatEvery: reminderData.repeatEvery || undefined,
        }
        : null;

    return (
        <AnimatePresence>
            {(openDialog === 'edit' || openDialog === 'create') && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="w-full max-w-[33rem] p-2"
                    >
                        <Card className="relative shadow-2xl border-border rounded-md bg-background h-[585px] flex flex-col overflow-hidden">
                            <CardHeader className="flex items-center justify-between flex-row pt-3 pb-1 shrink-0">
                                <CardTitle className="text-lg font-semibold leading-none tracking-tight">
                                    {openDialog === 'edit' ? `Editar ${modalTitle}` : `Crear ${modalTitle}`}
                                </CardTitle>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => closeDialog()}
                                >
                                    <X className="w-5 h-5" />
                                </Button>
                            </CardHeader>
                            <CardContent className="pt-0 pb-0 px-6 flex-1 min-h-0 flex flex-col">
                                {!apiKey && (
                                    <p className="text-sm text-amber-500 mb-3 shrink-0">
                                        No tienes una API Key asignada. Contacta al administrador para poder enviar recordatorios.
                                    </p>
                                )}
                                <Suspense fallback={<CreateReminderSkeleton />}>
                                    <ReminderForm
                                        instanceNameReminder={instancia.instanceName}
                                        userId={user.id}
                                        apikey={apiKey?.key ?? ''}
                                        serverUrl={apiKey?.url ?? ''}
                                        leads={leads}
                                        workflows={workflows}
                                        initialData={transformedReminder}
                                        onSuccess={() => closeDialog()}
                                        onCancel={() => closeDialog()}
                                        isSchedule={isSchedule}
                                    />
                                </Suspense>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}