"use client";

import { cn } from "@/lib/utils";
import { RELLENO_DE_PX_2 } from "@/lib/pastillas-de-la-fila";
import type { LeadStatus } from "@/types/session";
import {
  getLeadStatusLabel,
  LEAD_STATUS_BADGE_CLASSNAMES,
  LEAD_STATUS_DOT_CLASSNAMES,
} from "../../helpers/leadStatus";

export function LeadStatusBadge({
  status,
  showDot = true,
  compacta = false,
}: {
  status?: LeadStatus | null;
  showDot?: boolean;
  /** En la fila de una tarjeta de Chats: 2 px menos de relleno por lado (`lib/pastillas-de-la-fila.ts`). */
  compacta?: boolean;
}) {
  const relleno = compacta ? RELLENO_DE_PX_2 : "px-2";
  if (!status) {
    return (
      <span className={cn("inline-flex h-6 items-center rounded-full border border-dashed border-border text-xs text-muted-foreground", relleno)}>
        Sin clasificar
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border text-xs font-medium",
        relleno,
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
