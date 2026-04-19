"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AMERICA_TIMEZONES } from "@/lib/timezones";


/** Aplana a opciones de combobox: value = IANA TZ, label = "TZ — País" */
const TZ_OPTIONS = AMERICA_TIMEZONES.flatMap((c) =>
    c.timezones.map((tz) => ({
        value: tz,
        label: `${tz} — ${c.country}`,
        country: c.country,
    }))
);

/** Props opcionales para controlarlo desde fuera si lo necesitas */
type TimezoneComboboxProps = {
    value?: string;
    onChange?: (tz: string) => void;
    placeholder?: string;
    buttonClassName?: string;
    contentClassName?: string;
    defaultOpen?: boolean;
};

export function TimezoneCombobox({
    value: valueProp,
    onChange,
    placeholder = "Selecciona zona horaria...",
    buttonClassName,
    contentClassName,
    defaultOpen = false,
}: TimezoneComboboxProps) {
    const [open, setOpen] = useState(defaultOpen);
    const [value, setValue] = useState<string>(valueProp ?? "");

    // Sincroniza controlado/ no controlado
    useEffect(() => {
        if (valueProp !== undefined) setValue(valueProp);
    }, [valueProp]);

    const selected = TZ_OPTIONS.find((o) => o.value === value);

    const handleSelect = (currentValue: string) => {
        const v = currentValue === value ? "" : currentValue;
        if (valueProp === undefined) setValue(v);
        onChange?.(v);
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between", buttonClassName)}
                >
                    {selected ? selected.label : placeholder}
                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>
            </PopoverTrigger>

            <PopoverContent className={cn("w-[420px] p-0", contentClassName)}>
                <Command>
                    <CommandInput
                        placeholder="Busca por país o zona…"
                        className="h-9"
                    />
                    <CommandList>
                        <CommandEmpty>No se encontraron resultados.</CommandEmpty>

                        {/* Agrupado por país para mejor UX */}
                        {AMERICA_TIMEZONES.map((c) => (
                            <CommandGroup key={c.iso2} heading={c.country}>
                                {c.timezones.map((tz) => {
                                    const label = `${tz} — ${c.country}`;
                                    return (
                                        <CommandItem
                                            key={tz}
                                            value={`${tz} ${c.country}`}
                                            onSelect={() => handleSelect(tz)}
                                        >
                                            {label}
                                            <Check
                                                className={cn(
                                                    "ml-auto h-4 w-4",
                                                    value === tz ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}