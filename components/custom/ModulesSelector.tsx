'use client'

import { useState } from 'react';
import { useModuleStore } from '@/stores/modules/useModuleStore';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { AnimatePresence, motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { CardFooter } from '@/components/ui/card';
import { Label } from '../ui/label';
import { Check, ChevronsUpDown, X } from 'lucide-react'

export function ModulesSelector() {
    const { modules } = useModuleStore();

    const [open, setOpen] = useState(false)
    const [selectedValues, setSelectedValues] = useState<string[]>([])
    const [openCard, setOpenCard] = useState(false);

    const toggleOption = (value: string) => {
        setSelectedValues(prev =>
            prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
        )
    }

    const clearAll = () => setSelectedValues([])

    return (
        <div className="space-y-1 w-full">
            <Label className="text-muted-foreground text-sm">Módulos</Label>
            <Button
                onClick={() => setOpenCard(true)}
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between"
            >
                {selectedValues.length > 0
                    ? `${selectedValues.length} seleccionados`
                    : 'Selector de módulos'}
                <ChevronsUpDown />
            </Button>
            {
                openCard &&
                <AnimatePresence>
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className="w-full max-w-md p-2"
                        >
                            <Card className="relative shadow-2xl border-border rounded-md bg-background">
                                <CardHeader className="flex items-center justify-between flex-row">
                                    <CardTitle>
                                        Módulos
                                    </CardTitle>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setOpenCard(false)}
                                    >
                                        <X className="w-5 h-5" />
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <Popover open={open} onOpenChange={setOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={open}
                                                className="w-full justify-between"
                                            >
                                                {selectedValues.length > 0
                                                    ? `${selectedValues.length} seleccionados`
                                                    : 'Selecciona opciones'}
                                                <ChevronsUpDown />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-full p-0">
                                            <Command>
                                                <CommandInput placeholder="Buscar..." />
                                                <CommandEmpty>No se encontraron resultados.</CommandEmpty>
                                                <CommandGroup>
                                                    {modules.map(moduleComponent => (
                                                        <>
                                                            {
                                                                !moduleComponent.hiddenModuleToSelector && (
                                                                    <CommandItem
                                                                        key={moduleComponent.label}
                                                                        onSelect={() => toggleOption(moduleComponent.id)}
                                                                    >
                                                                        <div
                                                                            className={cn(
                                                                                'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                                                                                selectedValues.includes(moduleComponent.id) && 'bg-blue-500 text-white'
                                                                            )}
                                                                        >
                                                                            {selectedValues.includes(moduleComponent.id) && <Check className="h-4 w-4" />}
                                                                        </div>
                                                                        <span>{moduleComponent.label}</span>
                                                                    </CommandItem>
                                                                )
                                                            }
                                                        </>
                                                    ))}
                                                </CommandGroup>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>

                                    {selectedValues.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {selectedValues.map(value => {
                                                const label = modules.find(o => o.id === value)?.label || value
                                                return (
                                                    <Badge key={value} variant="secondary" className="flex items-center gap-1">
                                                        {label}
                                                        <button onClick={() => toggleOption(value)} className="ml-1 text-xs">✕</button>
                                                    </Badge>
                                                )
                                            })}
                                            <Button onClick={clearAll} size="sm" variant="outline" className="text-xs">Limpiar todo</Button>
                                        </div>
                                    )}
                                </CardContent>
                                <CardFooter className="flex flex-row justify-end">
                                    <Button
                                        onClick={() => setOpenCard(false)}
                                    >
                                        Guardar
                                    </Button>
                                </CardFooter>
                            </Card>
                        </motion.div>
                    </div>
                </AnimatePresence>
            }
        </div>
    )
}