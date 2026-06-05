'use client'

import { useEffect, useMemo, useState } from "react"
import { Session } from "@prisma/client"
import { cn } from "@/lib/utils"
import { fmtPhone } from "@/lib/whatsapp-jid"
import { Button } from "@/components/ui/button"
import {
    Command,
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
import { Badge } from "@/components/ui/badge"
import { Check, ChevronsUpDown } from "lucide-react"

interface Props {
    leads: Session[]
    onSelect: (lead: Session[]) => void
    onLeadCreated: () => void
    initialValue?: string[] // ahora puede recibir múltiples IDs
}

export const SelectMultipleComboBox = ({ leads, onSelect, onLeadCreated, initialValue = [] }: Props) => {
    const [open, setOpen] = useState(false);
    const [selectedLeads, setSelectedLeads] = useState<Session[]>([]);
    const [search, setSearch] = useState("");

    useEffect(() => {
        const initialLeads = leads.filter((lead) => initialValue.includes(lead.id.toString()));
        setSelectedLeads(initialLeads);
    }, [initialValue, leads]);

    const toggleLead = (lead: Session) => {
        const isSelected = selectedLeads.some((l) => l.id === lead.id);
        const updated = isSelected
            ? selectedLeads.filter((l) => l.id !== lead.id)
            : [...selectedLeads, lead];

        setSelectedLeads(updated);
        onSelect(updated);
    };

    const clearAll = () => {
        setSelectedLeads([]);
        onSelect([]);
    };

    const displayLabel = () => {
        if (selectedLeads.length === 0) return "Seleccione leads...";
        if (selectedLeads.length === 1) {
            const lead = selectedLeads[0];
            return `${lead.pushName || "Sin nombre"} (${fmtPhone(lead.remoteJid)})`;
        }
        return `${selectedLeads.length} seleccionados`;
    };

    const filteredLeads = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return leads;

        return leads.filter((lead) => {
            const leadName = (lead.pushName?.trim() || "Sin nombre").toLowerCase();
            const leadPhone = (lead.remoteJid || "").split("@")[0].toLowerCase();
            const remoteJid = (lead.remoteJid || "").toLowerCase();
            return leadName.includes(term) || leadPhone.includes(term) || remoteJid.includes(term);
        });
    }, [leads, search]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between gap-2"
                >
                    <span className="min-w-0 truncate">{displayLabel()}</span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Buscar lead..."
                        className="h-9"
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList className="max-h-[260px]">
                        {filteredLeads.length === 0 && (
                            <div className="p-2 text-sm text-center">
                                No se encontró ningún lead.
                                <br />
                                <Button
                                    variant="link"
                                    className="text-blue-500 mt-2"
                                    onClick={() => {
                                        onLeadCreated();
                                        setOpen(false);
                                    }}
                                >
                                    + Crear nuevo lead
                                </Button>
                            </div>
                        )}
                        <CommandGroup>
                            {filteredLeads.map((lead) => {
                                const leadName = lead.pushName || 'Sin nombre';
                                const leadPhone = fmtPhone(lead.remoteJid);
                                const isSelected = selectedLeads.some(l => l.id === lead.id);

                                return (
                                    <CommandItem
                                        key={lead.id}
                                        className="min-h-[48px]"
                                        onSelect={() => toggleLead(lead)}
                                    >
                                        <div className="flex min-w-0 flex-col">
                                            <span className="font-medium">{leadName}</span>
                                            <span className="text-muted-foreground text-xs">{leadPhone}</span>
                                        </div>
                                        <Check className={cn("ml-auto", isSelected ? "opacity-100" : "opacity-0")} />
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>

            {false && selectedLeads.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                    {selectedLeads.map((lead) => (
                        <Badge key={lead.id} variant="secondary" className="flex items-center gap-1">
                            {lead.pushName || "Sin nombre"}
                            <button onClick={() => toggleLead(lead)} className="ml-1 text-xs">
                                ✕
                            </button>
                        </Badge>
                    ))}
                    <Button onClick={clearAll} size="sm" variant="outline" className="text-xs">
                        Limpiar todo
                    </Button>
                </div>
            )}
        </Popover>
    );
};
