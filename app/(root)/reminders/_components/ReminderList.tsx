"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import TooltipWrapper from "@/components/TooltipWrapper"
import { fmtPhone } from "@/lib/whatsapp-jid"
import { ReminderListInterface, repeatTypes } from "@/schema/reminder"
import { cancelReminderPendingDeliveries, resumeReminderCanceledDeliveries, retryReminderFailedDeliveries } from "@/actions/reminders-actions"
import { openDeleteDialog, openEditDialog } from "@/stores"
import { toast } from "sonner"
import {
    BellRing,
    CalendarDaysIcon,
    CheckCircle2,
    Clock3,
    FileIcon,
    GitBranch,
    Phone,
    Pencil,
    Repeat2,
    Trash2,
    User,
    XCircle,
} from "lucide-react"

const formatReminderTime = (time: string | null | undefined): string => {
    if (!time) return ""
    const match = time.match(/^(hours|minutes)-(\d+)$/)
    if (match) {
        const [, unit, numStr] = match
        const n = Number(numStr)
        if (n === 0) return "Al momento"
        if (unit === "hours") return n === 1 ? "1 hora antes" : `${n} horas antes`
        return n === 1 ? "1 minuto antes" : `${n} minutos antes`
    }
    return time
}

const statusConfig = {
    pending: { label: "Pendiente", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", Icon: Clock3 },
    sent: { label: "Enviado", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", Icon: CheckCircle2 },
    failed: { label: "Fallido", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", Icon: XCircle },
    canceled: { label: "Cancelado", className: "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300", Icon: XCircle },
} as const

function getMainStatus(deliverySummary: ReminderListInterface["deliverySummary"]) {
    if (!deliverySummary || deliverySummary.total === 0) return null
    if (deliverySummary.failed > 0) return "failed"
    if (deliverySummary.pending > 0) return "pending"
    if (deliverySummary.canceled === deliverySummary.total) return "canceled"
    return "sent"
}

function formatStatus(status: string) {
    const normalized = status.toLowerCase()
    if (["sent", "success", "completed", "done", "delivered"].includes(normalized)) return "Enviado"
    if (["failed", "error"].includes(normalized)) return "Fallido"
    if (["canceled", "cancelled", "deleted"].includes(normalized)) return "Cancelado"
    return "Pendiente"
}

export const ReminderList = ({ reminder, workflow, deliverySummary, compact = false }: ReminderListInterface) => {
    const [historyOpen, setHistoryOpen] = useState(false)
    const [isUpdatingStatus, startStatusTransition] = useTransition()
    const router = useRouter()
    const isRecurring = Boolean(reminder.repeatType && reminder.repeatType !== "NONE")
    const isSent = Boolean(reminder.sentAt)
    const phone = fmtPhone(reminder.remoteJid)
    const repeatLabel = isRecurring
        ? repeatTypes.find(type => type.value === reminder.repeatType)?.label ?? "Recurrente"
        : "Unico"
    const mainStatus = getMainStatus(deliverySummary)
    const StatusIcon = mainStatus ? statusConfig[mainStatus].Icon : null
    const statusText = deliverySummary ? `${deliverySummary.sent}/${deliverySummary.total} enviados` : "Sin historial"
    const hasMedia = Boolean(deliverySummary?.items.some((item) => item.media))

    const goToChat = () => {
        if (reminder.remoteJid) window.location.href = `/chats?jid=${encodeURIComponent(reminder.remoteJid)}`
    }

    const runDeliveryAction = (action: () => Promise<{ success: boolean; message: string }>) => {
        startStatusTransition(async () => {
            const result = await action()
            if (result.success) {
                toast.success(result.message)
                router.refresh()
                return
            }
            toast.error(result.message)
        })
    }

    const StatusButton = ({ small = false }: { small?: boolean }) => {
        if (!mainStatus || !StatusIcon) return null
        return (
            <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className={`inline-flex items-center justify-center gap-1 rounded-md font-medium ${statusConfig[mainStatus].className} ${small ? "h-6 px-2 text-[11px]" : "h-7 px-2 text-xs"}`}
            >
                <StatusIcon className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />
                {statusText}
            </button>
        )
    }

    return (
        <>
            <Card className="group w-full rounded-xl border border-border/70 bg-card/90 shadow-sm transition-shadow hover:shadow-md">
                {compact ? (
                    <CardContent className="flex flex-col gap-1 p-2.5">
                        <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                                <BellRing className="h-4 w-4" />
                            </div>
                            <h3 className="app-item-title flex-1 truncate text-foreground">{reminder.title}</h3>
                            {hasMedia && (
                                <Badge className="h-5 gap-1 border-0 bg-sky-100 px-1.5 py-0 text-[10px] text-sky-700">
                                    <FileIcon className="h-3 w-3" />
                                    Media
                                </Badge>
                            )}
                            <Badge className={`h-5 gap-1 px-1.5 py-0 text-[10px] font-medium border-0 shrink-0 ${isRecurring ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>
                                {isRecurring ? <><Repeat2 className="h-3 w-3" />{repeatLabel}</> : "Unico"}
                            </Badge>
                            {isSent && (
                                <Badge className="h-5 gap-1 border-0 bg-emerald-100 px-1.5 py-0 text-[10px] font-medium text-emerald-700 shrink-0 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Enviado
                                </Badge>
                            )}
                        </div>

                        {reminder.pushName && (
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span className="flex min-w-0 items-center gap-1">
                                    <User className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{reminder.pushName}</span>
                                </span>
                                <TooltipWrapper content="Editar">
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-500 hover:bg-amber-50 hover:text-amber-600" onClick={() => openEditDialog(reminder.id, reminder)}>
                                        <Pencil className="h-3 w-3" />
                                    </Button>
                                </TooltipWrapper>
                            </div>
                        )}

                        {phone && (
                            <button type="button" onClick={goToChat} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                <Phone className="h-3 w-3 shrink-0" />
                                <span className="truncate">{phone}</span>
                            </button>
                        )}

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <CalendarDaysIcon className="h-3 w-3 shrink-0" />
                                {formatReminderTime(reminder.time)}
                            </span>
                            <TooltipWrapper content="Eliminar">
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => openDeleteDialog(reminder.id)}>
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </TooltipWrapper>
                        </div>

                        {workflow?.name && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <GitBranch className="h-3 w-3 shrink-0" />
                                <span className="truncate">{workflow.name}</span>
                            </span>
                        )}

                        <div className="mt-1">
                            <StatusButton small />
                        </div>
                    </CardContent>
                ) : (
                    <CardContent className="flex items-center gap-3 px-3 py-2.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                            <BellRing className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="app-item-title truncate text-foreground">{reminder.title}</h3>
                            <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                                {reminder.pushName && (
                                    <span className="flex items-center gap-1">
                                        <User className="h-3 w-3 shrink-0" />
                                        <span className="max-w-[180px] truncate">{reminder.pushName}</span>
                                    </span>
                                )}
                                {phone && (
                                    <button type="button" onClick={goToChat} className="flex items-center gap-1 text-blue-600 hover:underline">
                                        <Phone className="h-3 w-3 shrink-0" />
                                        <span className="whitespace-nowrap">{phone}</span>
                                    </button>
                                )}
                                <span className="flex items-center gap-1 whitespace-nowrap">
                                    <CalendarDaysIcon className="h-3 w-3 shrink-0" />
                                    {formatReminderTime(reminder.time)}
                                </span>
                                {workflow?.name && (
                                    <span className="mt-0.5 flex items-center gap-1">
                                        <GitBranch className="h-3 w-3 shrink-0" />
                                        <span className="max-w-[120px] truncate">{workflow.name}</span>
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <Badge className={`h-5 gap-1 px-1.5 py-0 text-[10px] font-medium border-0 ${isRecurring ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>
                                {isRecurring ? <><Repeat2 className="h-3 w-3" />{repeatLabel}</> : "Unico"}
                            </Badge>
                            {isSent && (
                                <Badge className="h-5 gap-1 border-0 bg-emerald-100 px-1.5 py-0 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Enviado
                                </Badge>
                            )}
                            {hasMedia && (
                                <Badge className="h-5 gap-1 border-0 bg-sky-100 px-1.5 py-0 text-[10px] text-sky-700">
                                    <FileIcon className="h-3 w-3" />
                                    Media
                                </Badge>
                            )}
                            <StatusButton />
                            <div className="h-5 w-0.5 shrink-0 rounded-full bg-border" />
                            <div className="flex items-center gap-0.5">
                                <TooltipWrapper content="Editar">
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-500 hover:bg-amber-50 hover:text-amber-600" onClick={() => openEditDialog(reminder.id, reminder)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                </TooltipWrapper>
                                <TooltipWrapper content="Eliminar">
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => openDeleteDialog(reminder.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </TooltipWrapper>
                            </div>
                        </div>
                    </CardContent>
                )}
            </Card>

            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Historial de envios</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isUpdatingStatus || !deliverySummary?.failed}
                                onClick={() => runDeliveryAction(() => retryReminderFailedDeliveries(reminder.id))}
                            >
                                Reintentar fallidos
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isUpdatingStatus || !deliverySummary?.pending}
                                onClick={() => runDeliveryAction(() => cancelReminderPendingDeliveries(reminder.id))}
                            >
                                Pausar pendientes
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isUpdatingStatus || !deliverySummary?.canceled}
                                onClick={() => runDeliveryAction(() => resumeReminderCanceledDeliveries(reminder.id))}
                            >
                                Reanudar pausados
                            </Button>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                            <div className="rounded-md border bg-muted/20 p-2 text-center">
                                <p className="text-xs text-muted-foreground">Total</p>
                                <p className="text-lg font-semibold">{deliverySummary?.total ?? 0}</p>
                            </div>
                            <div className="rounded-md border bg-emerald-50 p-2 text-center text-emerald-700">
                                <p className="text-xs">Enviados</p>
                                <p className="text-lg font-semibold">{deliverySummary?.sent ?? 0}</p>
                            </div>
                            <div className="rounded-md border bg-amber-50 p-2 text-center text-amber-700">
                                <p className="text-xs">Pendientes</p>
                                <p className="text-lg font-semibold">{deliverySummary?.pending ?? 0}</p>
                            </div>
                            <div className="rounded-md border bg-red-50 p-2 text-center text-red-700">
                                <p className="text-xs">Fallidos</p>
                                <p className="text-lg font-semibold">{deliverySummary?.failed ?? 0}</p>
                            </div>
                        </div>

                        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                            {deliverySummary?.items.length ? deliverySummary.items.map((item) => (
                                <div key={item.id} className="rounded-md border p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">{fmtPhone(item.remoteJid) || item.remoteJid || "Sin contacto"}</p>
                                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.mensaje || "Sin mensaje"}</p>
                                            {item.media && (
                                                <a href={item.media} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                                    <FileIcon className="h-3 w-3" />
                                                    {item.nameFile || item.tipo || "Archivo multimedia"}
                                                </a>
                                            )}
                                        </div>
                                        <Badge className="shrink-0 border-0 bg-muted text-xs text-foreground">
                                            {formatStatus(item.followUpStatus)}
                                        </Badge>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                        <span>{item.time || "Sin fecha"}</span>
                                        <span>Intentos {item.followUpAttempt}/{item.followUpMaxAttempts}</span>
                                        {item.errorReason && <span className="text-red-600">{item.errorReason}</span>}
                                    </div>
                                </div>
                            )) : (
                                <div className="flex h-24 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                                    Sin historial de envio.
                                </div>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
