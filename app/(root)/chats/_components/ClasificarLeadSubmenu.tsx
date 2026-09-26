"use client";

import { Check, Thermometer } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { LeadStatusBadge } from "../../crm/dashboard/components/records-table/LeadStatusBadge";
import { LEAD_STATUS_FILTER_OPTIONS } from "../../crm/dashboard/helpers/leadStatus";
import { useCambiarCalificacion } from "@/hooks/useCambiarCalificacion";
import { deSubmenu } from "@/lib/paneles-flotantes";
import type { LeadStatus } from "@/types/session";

/**
 * «Clasificar lead» en el menú «⋯» de una fila de la lista de Chats.
 *
 * Existe porque la pastilla de calificación dejó de pintarse cuando no hay
 * calificación (`lib/calificacion-del-lead.ts`), y esa pastilla era **el único
 * mando de Chats para calificar**: sin esto, la conversación que hay que
 * calificar —la que nadie ha calificado todavía— se quedaba sin forma de
 * hacerlo. Quitar un mando de una pantalla no puede quitar lo que ese mando
 * hacía.
 *
 * Va aquí, y no en un botón nuevo de la fila, porque el menú «⋯» es donde ya
 * viven las acciones de la fila —«Asignar agente», «Asignar etiqueta»— y
 * porque el renglón es lo que escaseaba: devolverle un mando sería deshacer el
 * arreglo.
 *
 * Es un SUBMENÚ y no una lista suelta, por la regla de siempre: *si la lista es
 * el motivo del menú, scroll; si es una opción más entre otras, submenú*. Aquí
 * es una más entre siete, y son seis entradas fijas que no crecen con nada.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **El camino de escritura es el MISMO que el de la pastilla**
 *    (`useCambiarCalificacion`). Con dos, el día que se afine uno el otro se
 *    queda atrás y se lee como que «desde el menú a veces no se guarda».
 * 2. **«Sin clasificar» va primero y QUITA la calificación**, como «Sin
 *    asignar» en el submenú del asesor. Sin esa entrada, una calificación
 *    puesta por error no se podría deshacer desde ninguna parte.
 * 3. **Lo puesto se marca con un chulito**, no escondiéndolo: la lista es de
 *    selección única y hay que poder ver cuál está sin abrir otra cosa.
 */
export function ClasificarLeadSubmenu({
  sessionId,
  actual,
  alCambiar,
}: {
  sessionId: number;
  actual: LeadStatus | null;
  alCambiar?: (nueva: LeadStatus | null) => void;
}) {
  const { cambiar, pendiente } = useCambiarCalificacion(sessionId, actual, alCambiar);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={pendiente}>
        <Thermometer className="h-4 w-4" />
        Clasificar lead
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent {...deSubmenu()} className="w-48 overflow-y-auto overscroll-contain z-[70]">
        <DropdownMenuItem
          onSelect={() => void cambiar(null)}
          className="flex items-center justify-between gap-2"
        >
          <span className="text-sm text-muted-foreground">Sin clasificar</span>
          {actual === null && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {LEAD_STATUS_FILTER_OPTIONS.map((opcion) => (
          <DropdownMenuItem
            key={opcion.value}
            onSelect={() => void cambiar(opcion.value)}
            className="flex items-center justify-between gap-2"
          >
            <LeadStatusBadge status={opcion.value} />
            {actual === opcion.value && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
