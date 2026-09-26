"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { updateSessionLeadStatus } from "@/actions/session-action";
import { comoCalificacion } from "@/lib/calificacion-del-lead";
import { LEAD_STATUS_FILTER_OPTIONS } from "@/app/(root)/crm/dashboard/helpers/leadStatus";
import type { LeadStatus } from "@/types/session";

/** Las cinco que la plataforma reconoce, en el orden en que se ofrecen. */
export const CALIFICACIONES = LEAD_STATUS_FILTER_OPTIONS.map((o) => o.value);

/**
 * Cambiar la calificación de un lead, UNA vez.
 *
 * La calificación se pone desde dos sitios de la misma fila —la pastilla,
 * cuando la hay, y el menú «⋯», que es el único camino cuando no la hay— y los
 * dos tienen que hacer exactamente lo mismo: sanear lo elegido, no escribir si
 * no cambia nada, decirlo cuando el servidor dice que no, y avisar a la lista
 * para que la fila se pinte al momento.
 *
 * Con eso escrito en los dos, el día que se afine uno el otro se queda atrás —y
 * eso no se ve como un error: se ve como que «desde el menú a veces no se
 * guarda».
 *
 * Dos cosas que hay que mantener:
 *
 * 1. **No se escribe si no cambia nada.** Volver a elegir lo que ya está es lo
 *    más normal del mundo —se abre el menú para mirar y se cierra eligiendo lo
 *    mismo— y una escritura ahí es una petición para no cambiar nada.
 * 2. **El aviso a la lista va solo cuando el servidor dijo que sí.** Al revés,
 *    la fila se pintaría con una calificación que no se guardó y solo volvería
 *    a la verdad en la vuelta siguiente del reloj de sesiones, hasta un minuto
 *    después.
 */
export function useCambiarCalificacion(
    sessionId: number,
    actual: LeadStatus | null | undefined,
    alCambiar?: (nueva: LeadStatus | null) => void | Promise<void>,
) {
    const [pendiente, setPendiente] = useState(false);

    const cambiar = useCallback(
        async (elegida: LeadStatus | null) => {
            // Lo que llega del navegador no decide: lo que no se reconoce es
            // «sin clasificar», que es el lado seguro.
            const nueva = elegida === null ? null : comoCalificacion(elegida, CALIFICACIONES);
            if (nueva === (actual ?? null)) return;
            setPendiente(true);
            try {
                const res = await updateSessionLeadStatus(sessionId, nueva);
                if (res.success) {
                    await alCambiar?.(nueva);
                } else {
                    toast.error(res.message);
                }
            } finally {
                setPendiente(false);
            }
        },
        [sessionId, actual, alCambiar],
    );

    return { cambiar, pendiente };
}
