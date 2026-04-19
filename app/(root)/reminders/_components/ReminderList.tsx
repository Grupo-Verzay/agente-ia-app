"use client"

import { Card, CardContent } from "@/components/ui/card"
import { CalendarDaysIcon, ClockIcon } from "lucide-react"
import { ReminderListInterface, repeatTypes } from "@/schema/reminder"
import { ReminderActions } from "./"

export const ReminderList = ({ reminder, workflow }: ReminderListInterface) => {
    const repeatLabel = reminder.repeatType === "NONE"
        ? "Unico"
        : `${repeatTypes.find(rt => rt.value === reminder.repeatType)?.label} - ${reminder.repeatEvery} ${reminder.repeatEvery === 1 ? "vez" : "veces"}`;

    return (
        <Card key={reminder.id} className="border-border w-full">
            <CardContent className="p-2">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-base text-primary">
                        {reminder.title}
                    </h3>
                    <ReminderActions reminder={reminder} />
                </div>

                {reminder.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                        {reminder.description}
                    </p>
                )}

                <div className="flex items-center gap-2 text-sm">
                    <CalendarDaysIcon className="h-4 w-4 text-muted-foreground" />
                    {reminder.time}
                </div>

                {/* <div className="flex items-center gap-2 text-sm">
                    <ClockIcon className="h-4 w-4 text-muted-foreground" />
                    {/* Enviar a <strong className="ml-1">+{reminder.remoteJid?.split("@")[0]}</strong> 
                </div> */}

                {/* <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                        Flujo | {workflow?.name ?? 'No asignado'}
                    </div>
                    <span className="text-xs text-muted-foreground">{repeatLabel}</span>
                </div> */}
            </CardContent>
        </Card>
    )
}