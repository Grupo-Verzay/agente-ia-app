"use client"

import { useState } from "react"
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

interface SelectComboBoxProps<T> {
  items: T[]
  getLabel: (item: T) => string
  getSubLabel?: (item: T) => string | undefined
  getValue: (item: T) => string
  placeholder?: string
  onSelect: (item: T) => void
  onEmptyAction?: () => void
  emptyLabel?: string
  createLabel?: string
}

export function UtilComboBox<T>({
  items,
  getLabel,
  getSubLabel,
  getValue,
  placeholder = "Selecciona una opción...",
  onSelect,
  onEmptyAction,
  emptyLabel = "No se encontraron resultados.",
  createLabel = "+ Crear nuevo",
}: SelectComboBoxProps<T>) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")

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
            ? getLabel(items.find((item) => getValue(item) === value)!)
            : placeholder}
          <ChevronsUpDown className="opacity-50 ml-2 h-4 w-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder="Buscar..." className="h-9" />
          <CommandList>
            <CommandEmpty>
              <div className="p-2 text-sm text-center">
                {emptyLabel}
                {onEmptyAction && (
                  <Button
                    variant="link"
                    className="text-blue-500 mt-2"
                    onClick={() => {
                      onEmptyAction()
                      setOpen(false)
                    }}
                  >
                    {createLabel}
                  </Button>
                )}
              </div>
            </CommandEmpty>

            <CommandGroup>
              {items.map((item, index) => {
                const itemValue = getValue(item)
                const itemLabel = getLabel(item)
                const itemSubLabel = getSubLabel?.(item)
                return (
                  <CommandItem
                    key={`${itemValue}-${index}`}
                    value={itemValue}
                    onSelect={() => {
                      setValue(itemValue)
                      onSelect(item)
                      setOpen(false)
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{itemLabel}</span>
                      {itemSubLabel && (
                        <span className="text-muted-foreground text-xs">{itemSubLabel}</span>
                      )}
                    </div>
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4",
                        value === itemValue ? "opacity-100" : "opacity-0"
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