"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BellRing, CalendarDaysIcon, GitBranch, Phone, Pencil, Repeat2, RefreshCw, Trash2, User } from "lucide-react"
import { ReminderListInterface, repeatTypes } from "@/schema/reminder"
import { fmtPhone } from "@/lib/whatsapp-jid"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { openEditDialog, openDeleteDialog } from "@/stores"
import TooltipWrapper from "@/components/TooltipWrapper"

export const ReminderList = ({ reminder, workflow, compact = false }: ReminderListInterface) => {
    const isRecurring = Boolean(reminder.repeatType && reminder.repeatType !== "NONE")
    const phone = fmtPhone(reminder.remoteJid)
    const goToChat = () => {
        if (reminder.remoteJid) window.location.href = `/chats?jid=${encodeURIComponent(reminder.remoteJid)}`
    }
    const repeatLabel = isRecurring
        ? repeatTypes.find(type => type.value === reminder.repeatType)?.label ?? "Recurrente"
        : "Unico"

    return (
        <Card className="group w-full rounded-xl border border-border/70 bg-card/90 shadow-sm transition-shadow hover:shadow-md">
            {compact ? (
                // ── KANBAN layout ──────────────────────────────────────
                <CardContent className="flex flex-col gap-1 p-2.5">
                    {/* Fila 1: icono + título + badge */}
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                            <BellRing className="h-4 w-4" />
                        </div>
                        <h3 className="app-item-title truncate text-foreground flex-1">{reminder.title}</h3>
                        <TooltipProvider delayDuration={200}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge className={`h-5 gap-1 px-1.5 py-0 text-[10px] font-medium cursor-default border-0 shrink-0 ${isRecurring ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"}`}>
                                        {isRecurring ? <><Repeat2 className="h-3 w-3" />{repeatLabel}</> : "Único"}
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">{isRecurring ? repeatLabel : "Único"}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>

                    {/* Fila 2: contacto + botón editar */}
                    {reminder.pushName && (
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <User className="h-3 w-3 shrink-0" />
                                <span className="truncate">{reminder.pushName}</span>
                            </span>
                            <TooltipWrapper content="Editar">
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-500 hover:text-amber-600 hover:bg-amber-50" onClick={() => openEditDialog(reminder.id, reminder)}>
                                    <Pencil className="h-3 w-3" />
                                </Button>
                            </TooltipWrapper>
                        </div>
                    )}

                    {/* Fila 3: teléfono */}
                    {phone && (
                        <button type="button" onClick={goToChat} className="flex items-center gap-1 text-xs text-blue-600 hover:underline cursor-pointer">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span className="truncate">{phone}</span>
                        </button>
                    )}

                    {/* Fila 4: fecha + botón eliminar */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <CalendarDaysIcon className="h-3 w-3 shrink-0" />
                            {reminder.time}
                        </span>
                        <TooltipWrapper content="Eliminar">
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => openDeleteDialog(reminder.id)}>
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
                </CardContent>
            ) : (
                // ── LISTA layout ───────────────────────────────────────
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
                                <span className="truncate max-w-[160px]">{reminder.pushName}</span>
                            </span>
                        )}
                        {phone && (
                            <button type="button" onClick={goToChat} className="flex items-center gap-1 text-blue-600 hover:underline cursor-pointer">
                                <Phone className="h-3 w-3 shrink-0" />
                                <span className="whitespace-nowrap">{phone}</span>
                            </button>
                        )}
                        <span className="flex items-center gap-1 whitespace-nowrap">
                            <CalendarDaysIcon className="h-3 w-3 shrink-0" />
                            {reminder.time}
                        </span>
                        {workflow?.name && (
                            <span className="flex items-center gap-1 mt-0.5">
                                <GitBranch className="h-3 w-3 shrink-0" />
                                <span className="truncate max-w-[80px]">{workflow.name}</span>
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <TooltipProvider delayDuration={200}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Badge className={`h-5 gap-1 px-1.5 py-0 text-[10px] font-medium cursor-default border-0 ${isRecurring ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"}`}>
                                    {isRecurring ? <><Repeat2 className="h-3 w-3" />{repeatLabel}</> : "Único"}
                                </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">{isRecurring ? repeatLabel : "Único"}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <div className="w-0.5 h-5 bg-border shrink-0 rounded-full" />
                    <div className="flex items-center gap-0.5">
                        <TooltipWrapper content="Editar">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-500 hover:text-amber-600 hover:bg-amber-50" onClick={() => openEditDialog(reminder.id, reminder)}>
                                <Pencil className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipWrapper>
                        <TooltipWrapper content="Eliminar">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => openDeleteDialog(reminder.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipWrapper>
                    </div>
                </div>
                </CardContent>
            )}

        </Card>
    )
}
