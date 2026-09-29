import "server-only";

/**
 * Dispara (sin esperar) las automatizaciones configuradas para un estado de
 * cita —las del engranaje de cada columna del tablero, `ApptAutomationsPanel`—.
 * Las ejecuta el backend sobre la CONVERSACIÓN (`sessionId`).
 *
 * Es UNA y la llaman los dos tableros de citas: Agenda (`Appointment`, que
 * trae su `sessionId`) y Multiagenda (`booking_appointments`, que no lo trae y
 * lo resuelve por el teléfono del cliente). Con una copia en cada uno, el día
 * que cambie la ruta o la clave uno de los dos dejaría de disparar sin ningún
 * error — que es exactamente cómo Multiagenda llevaba sin disparar nunca.
 *
 * Nunca lanza, pero no es muda.
 */
export async function dispararLasAutomatizacionesDeCita(
    sessionId: number | null | undefined,
    apptStatus: string,
): Promise<void> {
    if (!sessionId) return;
    const backendUrl = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");
    if (!backendUrl) return;
    const key = process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? "";
    try {
        await fetch(`${backendUrl}/appt-automations/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-secret": key },
            body: JSON.stringify({ sessionId, apptStatus }),
        });
    } catch (error) {
        console.error("[automatizaciones-de-cita] no se pudieron disparar", { sessionId, apptStatus, error });
    }
}
