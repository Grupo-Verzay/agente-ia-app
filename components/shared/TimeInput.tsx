'use client'

import { useState, useEffect, useRef } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

type TimeUnit = 'seconds' | 'minutes' | 'hours' | 'days'

const unitToSeconds: Record<TimeUnit, number> = {
    seconds: 1,
    minutes: 60,
    hours: 3600,
    days: 86400,
}

interface TimeInputProps {
    onChange?: (value: string) => void // ahora retorna 'TimeUnit-value'
    onBlur?: () => void
    currentValue?: string // espera 'TimeUnit-value'
    className?: string
}

export function TimeInput({ onChange, className, onBlur, currentValue }: TimeInputProps) {
    // const maxSeconds = 30 * 24 * 60 * 60 // 30 días
    const maxSeconds = 365 * 24 * 60 * 60 // 365 días


    let initialUnit: TimeUnit = 'minutes'
    let initialValue = 0

    if (currentValue && currentValue.includes('-')) {
        const [unitPart, valuePart] = currentValue.split('-')
        if (['seconds', 'minutes', 'hours', 'days'].includes(unitPart)) {
            initialUnit = unitPart as TimeUnit
            const parsed = parseInt(valuePart, 10)
            if (!isNaN(parsed)) {
                initialValue = parsed
            }
        }
    }

    const [unit, setUnit] = useState<TimeUnit>(initialUnit)
    const [value, setValue] = useState<number>(initialValue)
    const onChangeRef = useRef(onChange)

    useEffect(() => {
        onChangeRef.current = onChange
    }, [onChange])

    // Llama a onChange con formato 'unit-value'
    useEffect(() => {
        if (onChangeRef.current) {
            onChangeRef.current(`${unit}-${value}`)
        }
    }, [unit, value])

    // Lógica cuando se cambia la unidad
    const handleUnitChange = (newUnit: TimeUnit) => {
        const totalSeconds = value * unitToSeconds[unit]
        const newValue = Math.floor(totalSeconds / unitToSeconds[newUnit])

        // Ajustar si se pasa del máximo
        const maxValue = Math.floor(maxSeconds / unitToSeconds[newUnit])
        const safeValue = Math.min(newValue, maxValue)

        setUnit(newUnit)
        setValue(safeValue)
    }

    const handleLocalUnBlur = () => {
        const current = `${unit}-${value}`
        if (current !== currentValue && onBlur) {
            onBlur()
        }
    }

    return (
        <div className={cn(className)}>
            <Label className="text-xs">Duración de retraso. Máximo 365 días</Label>
            <div className="flex flex-row gap-2 mt-[4px]">
                <Select value={unit} onValueChange={handleUnitChange}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecciona unidad" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="minutes">Minutos</SelectItem>
                        <SelectItem value="hours">Horas</SelectItem>
                        <SelectItem value="days">Días</SelectItem>
                    </SelectContent>
                </Select>

                <Input
                    type="number"
                    min={0}
                    value={value}
                    onBlur={handleLocalUnBlur}
                    onChange={(e) => {
                        const num = parseInt(e.target.value, 10)
                        if (!isNaN(num)) {
                            const total = num * unitToSeconds[unit]
                            if (total <= maxSeconds) {
                                setValue(num)
                            } else {
                                const maxValue = Math.floor(maxSeconds / unitToSeconds[unit])
                                setValue(maxValue)
                            }
                        } else {
                            setValue(0)
                        }
                    }}
                />
            </div>
        </div>
    )
}
