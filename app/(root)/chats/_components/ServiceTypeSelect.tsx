"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bot, UserRound, HelpCircle, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateSessionServiceType } from "@/actions/session-action";
import type { ServiceType } from "@/types/session";

const SERVICE_OPTIONS: { value: ServiceType | null; label: string; description: string }[] = [
  { value: "IA",     label: "Asistencia IA",     description: "El agente IA atiende al cliente" },
  { value: "HUMANO", label: "Asistencia Humana",  description: "Se escala a un humano (S/N)" },
  { value: null,     label: "Sin asignar",        description: "Lead sin servicio definido" },
];

function ServiceTypeBadge({ value }: { value: ServiceType | null }) {
  if (value === "IA") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
        <Bot className="h-3 w-3" />
        Asistencia IA
      </span>
    );
  }
  if (value === "HUMANO") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        <UserRound className="h-3 w-3" />
        Asistencia Humana
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-muted bg-muted/40 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
      <HelpCircle className="h-3 w-3" />
      Sin asignar
    </span>
  );
}

interface ServiceTypeSelectProps {
  sessionId: number;
  currentValue?: ServiceType | null;
  onUpdated?: (newValue: ServiceType | null) => void | Promise<void>;
}

export function ServiceTypeSelect({ sessionId, currentValue, onUpdated }: ServiceTypeSelectProps) {
  const [isPending, setIsPending] = useState(false);

  const handleSelect = async (value: ServiceType | null) => {
    if (value === currentValue) return;
    setIsPending(true);
    try {
      const result = await updateSessionServiceType(sessionId, value);
      if (result.success) {
        await onUpdated?.(value);
        const label = SERVICE_OPTIONS.find((o) => o.value === value)?.label ?? "Sin asignar";
        toast.success(`Servicio cambiado a: ${label}`);
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isPending}
        className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50 focus:outline-none"
        aria-label="Cambiar tipo de servicio"
      >
        <ServiceTypeBadge value={currentValue ?? null} />
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuGroup>
          {SERVICE_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value ?? "__none__"}
              onSelect={() => handleSelect(option.value)}
              className={currentValue === option.value ? "bg-muted" : ""}
            >
              <div className="flex flex-col gap-0.5">
                <ServiceTypeBadge value={option.value} />
                <span className="text-xs text-muted-foreground pl-0.5">{option.description}</span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
