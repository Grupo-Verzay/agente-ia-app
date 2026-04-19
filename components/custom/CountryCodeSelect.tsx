'use client';

import * as React from 'react';
import Image from 'next/image';
import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type Country = {
    name: string;
    codes?: string[];   // ej: ['+1809', '+1829', '+1849'] | ['+507']
    code?: string;      // compat legado: un solo code
    flag?: string;      // url SVG/PNG
};

type Option = {
    key: string;
    name: string;
    code: string;       // '+1829'
    flag?: string;
};

interface ComboboxCountryCodeProps {
    countries: Country[];
    defaultValue?: string;         // ej '+1829'
    value?: string;                 // controlado (opcional)
    onChange?: (code: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export const CountryCodeSelect = ({
    countries,
    defaultValue,
    value: valueProp,
    onChange,
    placeholder = 'Selecciona un indicativo',
    disabled,
    className,
}: ComboboxCountryCodeProps) => {
    const [open, setOpen] = React.useState(false);
    const [internal, setInternal] = React.useState<string | undefined>(defaultValue);

    // Soporta controlado y no controlado
    const value = valueProp !== undefined ? valueProp : internal;
    const setValue = (v: string | undefined) => {
        if (valueProp === undefined) setInternal(v);
        onChange?.(v ?? '');
    };

    // Normaliza: si sólo viene `code`, conviértelo a `codes: [code]`
    const options = React.useMemo<Option[]>(() => {
        const norm = countries.map((c) => ({
            name: c.name,
            codes: c.codes && c.codes.length ? c.codes : (c.code ? [c.code] : []),
            flag: c.flag,
        }));
        return norm.flatMap((c) =>
            (c.codes ?? []).map((code) => ({
                key: `${c.name}-${code}`,
                name: c.name,
                code,
                flag: c.flag,
            }))
        ).sort((a, b) => a.name.localeCompare(b.name));
    }, [countries]);

    const selected = options.find(o => o.code === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn('w-full justify-between', className)}
                >
                    {selected ? (
                        <span className="flex items-center gap-2 truncate">
                            {!!selected.flag && (
                                <Image
                                    src={selected.flag}
                                    alt={selected.name}
                                    width={20}
                                    height={15}
                                    className="rounded-sm shrink-0"
                                />
                            )}
                            <span className="truncate">{selected.name} ({selected.code})</span>
                        </span>
                    ) : (
                        <span className="text-muted-foreground">{placeholder}</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>
            </PopoverTrigger>

            <PopoverContent className="w-[320px] p-0">
                <Command filter={(value, search, keywords) => {
                    // Mejora de búsqueda: busca por país, código y keywords opcionales
                    const haystack = (value + ' ' + (keywords?.join(' ') ?? '')).toLowerCase();
                    const needle = search.toLowerCase();
                    return haystack.includes(needle) ? 1 : 0;
                }}>
                    <CommandInput placeholder="Buscar país o código…" className="h-9" />
                    <CommandList>
                        <CommandEmpty>No se encontraron resultados.</CommandEmpty>

                        {/* Agrupado simple: alfabético; puedes separar por inicial */}
                        <CommandGroup heading="Indicativos">
                            {options.map((opt, i) => (
                                <CommandItem
                                    key={opt.key}
                                    value={`${opt.name} ${opt.code}`}
                                    keywords={[opt.name, opt.code]}
                                    onSelect={() => {
                                        const newVal = opt.code === value ? '' : opt.code;
                                        setValue(newVal || undefined);
                                        setOpen(false);
                                    }}
                                    className="flex items-center gap-2"
                                >
                                    {!!opt.flag && (
                                        <Image
                                            src={opt.flag}
                                            alt={opt.name}
                                            width={18}
                                            height={13}
                                            className="rounded-sm shrink-0"
                                        />
                                    )}
                                    <span className="truncate">{opt.name}</span>
                                    <span className="ml-1 text-muted-foreground">{opt.code}</span>
                                    <Check
                                        className={cn(
                                            'ml-auto h-4 w-4',
                                            value === opt.code ? 'opacity-100' : 'opacity-0'
                                        )}
                                    />
                                </CommandItem>
                            ))}
                        </CommandGroup>

                        <CommandSeparator />
                        {/* Tip opcional al final */}
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                            Selecciona el indicativo exacto. Ej.: República Dominicana: +1809, +1829, +1849.
                        </div>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
