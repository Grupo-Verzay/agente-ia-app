'use client'

import { useEffect, useRef, useState } from "react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { format, isValid, parse, setHours, setMinutes } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"

export function DateTimePicker({
    value,
    isSchedule,
    onChange
}: {
    value: string | undefined
    isSchedule: boolean
    onChange: (val: string) => void
}) {
    const parsedInitial = value
        ? parse(value, "dd/MM/yyyy HH:mm", new Date())
        : new Date();

    //  Si no es válida, usamos new Date()
    const initialDate = isValid(parsedInitial) ? parsedInitial : new Date()

    const [date, setDate] = useState<Date>(initialDate)
    const [hour, setHour] = useState(initialDate.getHours())
    const [minute, setMinute] = useState(initialDate.getMinutes())
    const onChangeRef = useRef(onChange)

    useEffect(() => {
        onChangeRef.current = onChange
    }, [onChange])

    useEffect(() => {
        const updated = setMinutes(setHours(date, hour), minute)
        onChangeRef.current(format(updated, "dd/MM/yyyy HH:mm"))
    }, [date, hour, minute])

    const updateDateTime = (newDate?: Date, newHour?: number, newMinute?: number) => {
        const base = newDate ?? date
        const h = newHour ?? hour
        const m = newMinute ?? minute
        const updated = setMinutes(setHours(base, h), m)

        setDate(updated)
        setHour(h)
        setMinute(m)
    }

    return (
        <Popover>
            <div className="grid grid-cols-2 gap-3">
                {/* Fecha */}
                {!isSchedule && (
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-semibold">Fecha</label>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="justify-start text-left w-full text-sm">
                                {date ? format(date, "dd/MM/yyyy") : "Seleccionar"}
                            </Button>
                        </PopoverTrigger>
                    </div>
                )}

                {/* Hora HH:MM */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold">Hora</label>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 flex-1">
                            <label className="text-xs text-muted-foreground shrink-0">HH:</label>
                            <select
                                className={cn("border rounded-md px-2 py-1 text-sm bg-background w-full")}
                                value={hour}
                                onChange={(e) => updateDateTime(undefined, parseInt(e.target.value), undefined)}
                            >
                                {[...Array(24)].map((_, i) => (
                                    <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-1 flex-1">
                            <label className="text-xs text-muted-foreground shrink-0">MM:</label>
                            <select
                                className={cn("border rounded-md px-2 py-1 text-sm bg-background w-full")}
                                value={minute}
                                onChange={(e) => updateDateTime(undefined, undefined, parseInt(e.target.value))}
                            >
                                {[...Array(60)].map((_, i) => (
                                    <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {!isSchedule && (
                <PopoverContent side="top" align="start" className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={date}
                        onSelect={(d) => d && updateDateTime(d)}
                    />
                </PopoverContent>
            )}
        </Popover>
    )
}
