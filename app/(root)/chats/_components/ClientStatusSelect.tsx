"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CircleCheck, CircleX, HelpCircle, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { updateSessionClientStatus } from "@/actions/session-action";
import type { ClientStatus } from "@/types/session";

const CLIENT_STATUS_OPTIONS: { value: ClientStatus | null; label: string; description: string }[] = [
  { value: "ACTIVO",   label: "Cliente Activo",   description: "Suscripción vigente con el servicio" },
  { value: "INACTIVO", label: "Cliente Inactivo",  description: "Ex-cliente, puede querer retomar" },
  { value: null,       label: "Sin clasificar",    description: "Estado no definido aún" },
];

function ClientStatusIcon({ value }: { value: ClientStatus | null }) {
  if (value === "ACTIVO") {
    return (
      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-green-100 border border-green-200 dark:bg-green-950 dark:border-green-800">
        <CircleCheck className="h-3 w-3 text-green-700 dark:text-green-300" />
      </span>
    );
  }
  if (value === "INACTIVO") {
    return (
      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-red-100 border border-red-200 dark:bg-red-950 dark:border-red-800">
        <CircleX className="h-3 w-3 text-red-700 dark:text-red-300" />
      </span>
    );
  }
  return <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50" />;
}

function ClientStatusBadge({ value }: { value: ClientStatus | null }) {
  if (value === "ACTIVO") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
        <CircleCheck className="h-3 w-3" />
        Cliente Activo
      </span>
    );
  }
  if (value === "INACTIVO") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        <CircleX className="h-3 w-3" />
        Cliente Inactivo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-muted bg-muted/40 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
      <HelpCircle className="h-3 w-3" />
      Sin clasificar
    </span>
  );
}

interface ClientStatusSelectProps {
  sessionId: number;
  currentValue?: ClientStatus | null;
  onUpdated?: (newValue: ClientStatus | null) => void | Promise<void>;
}

export function ClientStatusSelect({ sessionId, currentValue, onUpdated }: ClientStatusSelectProps) {
  const [isPending, setIsPending] = useState(false);
  const value = currentValue ?? null;
  const label = CLIENT_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? "Sin clasificar";

  const handleSelect = async (selected: ClientStatus | null) => {
    if (selected === value) return;
    setIsPending(true);
    try {
      const result = await updateSessionClientStatus(sessionId, selected);
      if (result.success) {
        await onUpdated?.(selected);
        const newLabel = CLIENT_STATUS_OPTIONS.find((o) => o.value === selected)?.label ?? "Sin clasificar";
        toast.success(`Estado cambiado a: ${newLabel}`);
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger
              disabled={isPending}
              className="inline-flex items-center gap-0.5 cursor-pointer hover:opacity-70 transition-opacity disabled:opacity-50 focus:outline-none"
              aria-label="Cambiar estado del cliente"
            >
              <ClientStatusIcon value={value} />
              <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/60" />
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {label}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuGroup>
            {CLIENT_STATUS_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value ?? "__none__"}
                onSelect={() => handleSelect(option.value)}
                className={value === option.value ? "bg-muted" : ""}
              >
                <div className="flex flex-col gap-0.5">
                  <ClientStatusBadge value={option.value} />
                  <span className="text-xs text-muted-foreground pl-0.5">{option.description}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
