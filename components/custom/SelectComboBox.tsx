"use client"

import { useEffect, useMemo, useState } from "react"
import { Session } from "@prisma/client"
import { cn } from "@/lib/utils"
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
import { Check, ChevronsUpDown } from "lucide-react"

interface Props {
  leads: Session[]
  onSelect: (lead: Session) => void
  onLeadCreated: () => void // para recargar leads luego de crear
  initialValue?: string; // Agregar este prop
}

export const SelectComboBox = ({ leads, onSelect, onLeadCreated, initialValue }: Props) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialValue || "");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (initialValue) setValue(initialValue);
  }, [initialValue]);

  const getVal = (value: string) => {
    const lead = leads.find((lead) => {
      const leadName = lead.pushName === '' ? 'Sin nombre' : lead.pushName
      const leadPhone = lead.remoteJid.split("@")[0]
      const fullValue = `${leadName} ${leadPhone}`
      return fullValue === value
    })

    if (!lead) return null

    const nameValidate = lead.pushName === ''
    const leadName = nameValidate ? 'Sin nombre' : lead.pushName
    const leadPhone = lead.remoteJid.split("@")[0]

    return nameValidate ? leadPhone : `${leadName}`
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
          className="w-full justify-between"
        >
          {value
            ? getVal(value)
            : "Seleccione un lead..."}
          <ChevronsUpDown className="opacity-50" />
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
                    onLeadCreated()
                    setOpen(false)
                  }}
                >
                  + Crear nuevo lead
                </Button>
              </div>
            )}
            <CommandGroup>
              {filteredLeads.map((lead) => {
                const leadName = lead.pushName === '' ? 'Sin nombre' : lead.pushName;
                const leadPhone = lead.remoteJid.split("@")[0];

                return (
                  <CommandItem
                    key={lead.id}
                    value={`${leadName} ${leadPhone}`}
                    className="min-h-[48px]"
                    onSelect={(currentValue) => {
                      setValue(currentValue === value ? "" : currentValue)
                      onSelect(lead)
                      setOpen(false)
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{leadName}</span>
                      <span className="text-muted-foreground text-xs">{leadPhone}</span>
                    </div>
                    <Check
                      className={cn(
                        "ml-auto",
                        value === `${leadName} ${leadPhone}` ? "opacity-100" : "opacity-0"
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
