"use client"

import { useEffect, useState } from "react"
import { Workflow } from "@prisma/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Check, ChevronsUpDown } from "lucide-react"

interface Props {
    workflows: Workflow[]
    onSelect: (workflow: Workflow) => void
    initialValue?: string
}

export const SelectWorkflowBox = ({ workflows, onSelect, initialValue }: Props) => {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState(initialValue || "");

    useEffect(() => {
        if (initialValue) setValue(initialValue);
    }, [initialValue]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between gap-2"
                >
                    <span className="min-w-0 truncate">
                        {value
                            ? workflows.find((w) => w.id === value)?.name?.toUpperCase()
                            : "Seleccione workflow..."}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                    <CommandInput placeholder="Buscar flujo..." className="h-9" />
                    <CommandList className="max-h-[260px]">
                        <CommandEmpty>No se encontró flujo.</CommandEmpty>
                        <CommandGroup>
                            {workflows.map((workflow) => {
                                return (
                                    <CommandItem
                                        key={workflow.id}
                                        value={workflow.id}
                                        className="min-h-[48px]"
                                        onSelect={(currentValue) => {
                                            setValue(currentValue === value ? "" : currentValue)
                                            onSelect(workflow)
                                            setOpen(false)
                                        }}
                                    >
                                        <div className="flex min-w-0 flex-col">
                                            <span className="truncate font-medium uppercase">{workflow.name}</span>
                                            {/* <span className="text-muted-foreground text-xs">{workflow.description}</span> */}
                                        </div>
                                        <Check
                                            className={cn(
                                                "ml-auto",
                                                value === workflow.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                    </CommandItem>
                                )
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
