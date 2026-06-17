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
import { updateSessionClientStatus } from "@/actions/session-action";
import type { ClientStatus } from "@/types/session";

const CLIENT_STATUS_OPTIONS: { value: ClientStatus | null; label: string; description: string }[] = [
  { value: "ACTIVO",   label: "Cliente Activo",   description: "Suscripción vigente con el servicio" },
  { value: "INACTIVO", label: "Cliente Inactivo",  description: "Ex-cliente, puede querer retomar" },
  { value: null,       label: "Sin clasificar",    description: "Estado no definido aún" },
];

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

  const handleSelect = async (value: ClientStatus | null) => {
    if (value === currentValue) return;
    setIsPending(true);
    try {
      const result = await updateSessionClientStatus(sessionId, value);
      if (result.success) {
        await onUpdated?.(value);
        const label = CLIENT_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? "Sin clasificar";
        toast.success(`Estado cambiado a: ${label}`);
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
        aria-label="Cambiar estado del cliente"
      >
        <ClientStatusBadge value={currentValue ?? null} />
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          {CLIENT_STATUS_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value ?? "__none__"}
              onSelect={() => handleSelect(option.value)}
              className={currentValue === option.value ? "bg-muted" : ""}
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
  );
}
