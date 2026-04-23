"use client";

import { cn } from "@/lib/utils";
import type { LeadStatus } from "@/types/session";
import {
  getLeadStatusLabel,
  LEAD_STATUS_BADGE_CLASSNAMES,
  LEAD_STATUS_DOT_CLASSNAMES,
} from "../../helpers";

export function LeadStatusBadge({
  status,
  showDot = true,
}: {
  status?: LeadStatus | null;
  showDot?: boolean;
}) {
  if (!status) {
    return (
      <span className="inline-flex h-6 items-center rounded-full border border-dashed border-border px-2 text-xs text-muted-foreground">
        Sin clasificar
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs font-medium",
        LEAD_STATUS_BADGE_CLASSNAMES[status],
      )}
    >
      {showDot && (
        <span
          className={cn("h-2 w-2 rounded-full", LEAD_STATUS_DOT_CLASSNAMES[status])}
        />
      )}
      {getLeadStatusLabel(status)}
    </span>
  );
}
