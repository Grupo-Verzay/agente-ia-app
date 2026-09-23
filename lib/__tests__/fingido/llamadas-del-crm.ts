/**
 * Las acciones de CRM › Llamadas, apuntadas, para el banco que PINTA la tabla.
 *
 * Aquí no se finge la pantalla: se finge lo único que no puede correr en un
 * navegador suelto, que son las acciones de servidor. Los datos son fijos y
 * **los mismos en los dos modos**, así que la única diferencia medible entre
 * el «antes» y el «ahora» es cómo se pinta la fila.
 *
 * Las cifras de `kpis` son raras a propósito: el banco afirma que NINGUNA de
 * ellas sale ya en la barra, y con un 3 o un 12 se confundirían con el número
 * de una llamada cualquiera.
 */
export type CallRow = {
    id: string;
    phone: string;
    contactName: string | null;
    direction: "outgoing" | "incoming";
    durationSecs: number;
    ts: number;
    disposition: string | null;
    leadSynthesis?: string | null;
    transcript?: string | null;
    summary?: string | null;
    hasRecording?: boolean;
    recordingUrl?: string | null;
    astraSid?: string | null;
    astraCallId?: string | null;
    cuentaId: string;
    instanceName?: string | null;
};

export type CallsKpis = {
    total: number;
    outgoing: number;
    incoming: number;
    answered: number;
    totalDurationSecs: number;
    avgDurationSecs: number;
};

export type CallsCrmData = { calls: CallRow[]; kpis: CallsKpis };

/** Las cifras que el banco busca —y no encuentra— dentro de la barra. */
export const KPIS: CallsKpis = {
    total: 1284,
    outgoing: 742,
    incoming: 542,
    answered: 903,
    totalDurationSecs: 51240,
    avgDurationSecs: 40,
};

export const LLAMADAS: CallRow[] = [
    {
        id: "c1",
        phone: "573216031493",
        contactName: "Marta Restrepo Villegas",
        direction: "outgoing",
        durationSecs: 187,
        ts: Date.parse("2026-09-18T15:04:00Z"),
        disposition: "interested",
        leadSynthesis:
            "Pidió la cotización del plan anual para las tres sedes y quiere que le llamen el jueves por la tarde para cerrar el pago",
        cuentaId: "u1",
        instanceName: "VERZAY_ATENCION",
    },
    {
        id: "c2",
        phone: "573001112233",
        contactName: null,
        direction: "incoming",
        durationSecs: 0,
        ts: Date.parse("2026-09-18T11:22:00Z"),
        disposition: null,
        cuentaId: "u1",
        instanceName: "VERZAY_ATENCION",
    },
    // Una hija: la fila que, consolidando, lleva «● Ventas» junto al nombre.
    // Va la ÚLTIMA a propósito: los otros bancos miden la primera fila y no
    // pueden cambiar de lo que miden por esto.
    {
        id: "c3",
        phone: "573154445566",
        contactName: "Julián Ospina",
        direction: "outgoing",
        durationSecs: 64,
        ts: Date.parse("2026-09-17T09:10:00Z"),
        disposition: null,
        cuentaId: "u2",
        instanceName: "VERZAY_VENTAS",
    },
];

export async function getCallsCrmData(): Promise<CallsCrmData> {
    return { calls: LLAMADAS, kpis: KPIS };
}

const bien = async () => ({ success: true as const });

/**
 * Ya no la llama la pantalla —la columna «Estado» se fue y la acción con
 * ella—, pero el «antes» de los modos rotos sí: sin este export su paquete no
 * se construye y el modo roto dejaría de reproducir nada.
 */
export const setCallLeadStatusAction = async () => ({ success: true as const, created: false });
export const setCallDisposition = bien;
export const scheduleCallbackAction = bien;
export const clearMissedCallsAction = async () => ({ success: true as const, deleted: 0 });
export const setCallContactNameAction = bien;
export const deleteCallAction = bien;
export const deleteAllCallsAction = async () => ({ success: true as const, deleted: 0 });
export const diagnoseCallsAction = async () => ({
    totalInScope: 0,
    perScope: [] as { id: string; calls: number }[],
    lastCall: null as { ts: number; content: string } | null,
    instances: [] as { instanceName: string | null; instanceType: string | null }[],
});
export const getSessionIdByPhone = async () => null;
