"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LeadStatusBadge } from "../../crm/dashboard/components/records-table/LeadStatusBadge";
import { LEAD_STATUS_FILTER_OPTIONS } from "../../crm/dashboard/helpers/leadStatus";
import type { LeadStatus } from "@/types/session";
import { useCambiarCalificacion } from "@/hooks/useCambiarCalificacion";
import { usePanelFlotante } from "@/hooks/usePanelFlotante";
import { PANEL_QUE_SE_DESPLAZA, RELLENO_DEL_MENU } from "@/lib/paneles-flotantes";
import { DISPARADOR_DE_LA_PASTILLA } from "@/lib/pastillas-de-la-fila";

interface LeadStatusSelectProps {
  sessionId: number;
  currentStatus?: LeadStatus | null;
  onUpdated?: (newStatus: LeadStatus | null) => void | Promise<void>;
}

export function LeadStatusSelect({ sessionId, currentStatus, onUpdated }: LeadStatusSelectProps) {
  // El mismo camino de escritura que el menú «⋯» de la fila, que es el único
  // que queda cuando la conversación no está calificada y esta pastilla no se
  // pinta (`lib/calificacion-del-lead.ts`).
  const { cambiar, pendiente } = useCambiarCalificacion(sessionId, currentStatus, onUpdated);
  // La temperatura vive en una FILA de la lista, así que su panel nace pegado
  // al filo derecho de la columna, bajo su control, y voltea arriba si la fila
  // está abajo del todo. Antes era `align="start"`: salía hacia la derecha y
  // se montaba sobre la conversación.
  const panel = usePanelFlotante("columnaDerecha", "menu");


  return (
    <DropdownMenu onOpenChange={panel.alAbrir}>
      <DropdownMenuTrigger
        ref={panel.disparador}
        disabled={pendiente}
        className={`${DISPARADOR_DE_LA_PASTILLA} cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-50 focus:outline-none`}
        aria-label="Cambiar estado del lead"
      >
        <LeadStatusBadge status={currentStatus} showDot={false} compacta />
      </DropdownMenuTrigger>
      <DropdownMenuContent {...panel.props} className={`${RELLENO_DEL_MENU} ${PANEL_QUE_SE_DESPLAZA}`}>
        <DropdownMenuGroup>
          {LEAD_STATUS_FILTER_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => void cambiar(option.value)}
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
