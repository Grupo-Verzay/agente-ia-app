// src/components/ManagementPromptBuilder.tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { PROMPT_FRAGMENTS, PromptFragment } from "./helpers/prompt-fragments";

type Props = {
    onInsert: ({ id, label, value }: PromptFragment) => void;
    buttonText?: string;
    className?: string;
};

export function ManagementPromptBuilder({ onInsert, buttonText = "Agregar fragmento", className }: Props) {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");

    const items = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return PROMPT_FRAGMENTS;
        return PROMPT_FRAGMENTS.filter((f) => f.label.toLowerCase().includes(q));
    }, [search]);

    const handleSelect = (id: string) => {
        const selected = PROMPT_FRAGMENTS.find((f) => f.id === id);
        if (selected) {
            onInsert({ id: selected.id, label: selected.label, value: selected.value });
            setSearch("");
            setOpen(false);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("gap-2", className)}>
                    <Plus className="h-4 w-4" />
                    {buttonText}
                    <ChevronsUpDown className="ml-1 h-4 w-4 opacity-50" />
                </Button>
            </PopoverTrigger>

            <PopoverContent className="p-0 w-[420px]" align="end">
                {/* Contenedor con scroll vertical */}
                <div className="max-h-80 overflow-y-auto"> {/* <- ajusta 80 (20rem) a tu gusto */}
                    <Command shouldFilter={false}>
                        <CommandInput
                            value={search}
                            onValueChange={setSearch}
                            placeholder="Buscar fragmento…"
                        />
                        <CommandEmpty>No hay resultados.</CommandEmpty>
                        <CommandGroup heading="Fragmentos de prompt">
                            {items.map((f) => (
                                <CommandItem
                                    key={f.id}
                                    value={f.id}
                                    className="text-xs"
                                    onSelect={handleSelect}
                                >
                                    <Check className="mr-2 h-4 w-4 opacity-0" />
                                    {f.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </Command>
                </div>
            </PopoverContent>
        </Popover>
    );
}