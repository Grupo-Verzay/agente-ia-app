"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BellRing, CalendarDaysIcon, GitBranch, Repeat2 } from "lucide-react"
import { ReminderListInterface, repeatTypes } from "@/schema/reminder"
import { ReminderActions } from "./"

export const ReminderList = ({ reminder, workflow, compact = false }: ReminderListInterface) => {
    const isRecurring = Boolean(reminder.repeatType && reminder.repeatType !== "NONE")
    const repeatLabel = isRecurring
        ? repeatTypes.find(type => type.value === reminder.repeatType)?.label ?? "Recurrente"
        : "Unico"

    return (
        <Card className="w-full rounded-xl border border-border/70 bg-card/90 shadow-sm transition-shadow hover:shadow-md">
            <CardContent className={compact ? "flex items-start gap-2 p-2.5" : "flex items-center gap-3 px-3 py-2.5"}>
                <div className={compact
                    ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm"
                    : "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm"
                }>
                    <BellRing className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                    <h3 className="app-item-title truncate text-foreground">
                        {reminder.title}
                    </h3>
                    {reminder.description && (
                        <p className={compact ? "mt-0.5 line-clamp-2 text-xs text-muted-foreground" : "mt-0.5 line-clamp-1 text-xs text-muted-foreground"}>
                            {reminder.description}
                        </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <CalendarDaysIcon className="h-3.5 w-3.5" />
                            {reminder.time}
                        </span>
                        {workflow?.name && (
                            <span className="flex items-center gap-1">
                                <GitBranch className="h-3.5 w-3.5" />
                                {workflow.name}
                            </span>
                        )}
                        <Badge variant="outline" className="h-5 gap-1 px-1.5 py-0 text-[10px] font-normal">
                            {isRecurring && <Repeat2 className="h-3 w-3" />}
                            {repeatLabel}
                        </Badge>
                    </div>
                </div>

                <ReminderActions reminder={reminder} />
            </CardContent>
        </Card>
    )
}
