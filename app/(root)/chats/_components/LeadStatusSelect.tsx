"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LeadStatusBadge } from "../../crm/dashboard/components/records-table/LeadStatusBadge";
import { LEAD_STATUS_FILTER_OPTIONS } from "../../crm/dashboard/helpers/leadStatus";
import { updateSessionLeadStatus } from "@/actions/session-action";
import type { LeadStatus } from "@/types/session";
import { usePanelFlotante } from "@/hooks/usePanelFlotante";
import { PANEL_QUE_SE_DESPLAZA } from "@/lib/paneles-flotantes";

interface LeadStatusSelectProps {
  sessionId: number;
  currentStatus?: LeadStatus | null;
  onUpdated?: (newStatus: LeadStatus | null) => void | Promise<void>;
}

export function LeadStatusSelect({ sessionId, currentStatus, onUpdated }: LeadStatusSelectProps) {
  const [isPending, setIsPending] = useState(false);
  // La temperatura vive en una FILA de la lista, así que su panel nace pegado
  // al filo derecho de la columna, bajo su control, y voltea arriba si la fila
  // está abajo del todo. Antes era `align="start"`: salía hacia la derecha y
  // se montaba sobre la conversación.
  const panel = usePanelFlotante("columnaDerecha", "menu");

  const handleSelect = async (status: LeadStatus | null) => {
    if (status === currentStatus) return;
    setIsPending(true);
    try {
      const result = await updateSessionLeadStatus(sessionId, status);
      if (result.success) {
        await onUpdated?.(status);
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <DropdownMenu onOpenChange={panel.alAbrir}>
      <DropdownMenuTrigger
        ref={panel.disparador}
        disabled={isPending}
        className="inline-flex h-7 items-center gap-0.5 cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50 focus:outline-none"
        aria-label="Cambiar estado del lead"
      >
        <LeadStatusBadge status={currentStatus} showDot={false} />
      </DropdownMenuTrigger>
      <DropdownMenuContent {...panel.props} className={PANEL_QUE_SE_DESPLAZA}>
        <DropdownMenuGroup>
          {LEAD_STATUS_FILTER_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => handleSelect(option.value)}
              className={currentStatus === option.value ? "bg-muted" : ""}
            >
              <LeadStatusBadge status={option.value} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
