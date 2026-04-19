'use client'

import { useState } from 'react'
import { useThemeStore } from '@/stores'
import { useResellerStore } from '@/stores/resellers/resellerStore'
import { themes } from '@/schema/theme'
import { ThemeApp } from '@prisma/client'
import { toast } from 'sonner'
import { updateClientDataByField } from '@/actions/userClientDataActions'

import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'

export function BrandSelector() {
    const { current, setTheme } = useThemeStore()
    const reseller = useResellerStore((s) => s.reseller)
    const [loading, setLoading] = useState(false)

    const handleThemeChange = async (newTheme: ThemeApp) => {
        if (!reseller) return toast.error('Reseller no disponible')
        if (newTheme === current) return // Evitar cambios innecesarios

        setLoading(true)
        toast.loading('Actualizando tema...', { id: 'theme-update' })

        try {
            // Actualiza Zustand visualmente
            setTheme(newTheme)

            // Guarda en base de datos
            const result = await updateClientDataByField(reseller.id, 'theme', newTheme)
            if (!result.success) throw new Error(result.message)

            toast.success('Tema actualizado correctamente', { id: 'theme-update' })
        } catch (error: any) {
            toast.error(error?.message || 'Error al actualizar el tema', { id: 'theme-update' })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-1 w-full">
            <Label className="text-muted-foreground text-sm">Marca visual</Label>
            <Select value={current} onValueChange={(value) => handleThemeChange(value as ThemeApp)} disabled={loading}>
                <SelectTrigger className="w-full bg-background border focus-visible:ring-primary">
                    <SelectValue placeholder="Selecciona un tema" />
                </SelectTrigger>
                <SelectContent>
                    {Object.entries(themes).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                            <span className="flex items-center gap-2 capitalize">
                                <span
                                    className="w-4 h-4 rounded-full border"
                                    style={{ backgroundColor: `hsl(${value['--primary']})` }}
                                />
                                {key}
                            </span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}
