"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LeadStatusBadge } from "../../crm/dashboard/components/records-table/LeadStatusBadge";
import { LEAD_STATUS_FILTER_OPTIONS } from "../../crm/dashboard/helpers/leadStatus";
import { updateSessionLeadStatus } from "@/actions/session-action";
import type { LeadStatus } from "@/types/session";

interface LeadStatusSelectProps {
  sessionId: number;
  currentStatus?: LeadStatus | null;
  onUpdated?: () => void | Promise<void>;
}

export function LeadStatusSelect({ sessionId, currentStatus, onUpdated }: LeadStatusSelectProps) {
  const [isPending, setIsPending] = useState(false);

  const handleSelect = async (status: LeadStatus | null) => {
    if (status === currentStatus) return;
    setIsPending(true);
    try {
      const result = await updateSessionLeadStatus(sessionId, status);
      if (result.success) {
        await onUpdated?.();
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
        className="inline-flex h-7 items-center gap-0.5 cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50 focus:outline-none"
        aria-label="Cambiar estado del lead"
      >
        <LeadStatusBadge status={currentStatus} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => handleSelect(null)}>
          <LeadStatusBadge status={null} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
