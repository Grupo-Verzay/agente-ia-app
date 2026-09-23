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
    dispositionSource?: "ia" | "manual" | null;
    dispositionIa?: string | null;
    status?: string;
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

export const SINTESIS_DEL_LEAD =
    "Lead de tres sedes, viene de la campaña de agosto y ya compró el plan básico en 2025";
export const PRIMERA_LINEA_DEL_RESUMEN =
    "Pidió la cotización del plan anual para las tres sedes y quiere revisar precios con su socio antes de decidir";
export const TRANSCRIPCION =
    "Agente: Hola Marta, te llamo de Verzay.\nCliente: Hola, sí, quería la cotización del plan anual.\nAgente: Claro, te la envío.\nCliente: Llámame el jueves por la tarde.";

export const LLAMADAS: CallRow[] = [
    {
        id: "c1",
        phone: "573216031493",
        contactName: "Marta Restrepo Villegas",
        direction: "outgoing",
        durationSecs: 187,
        ts: Date.parse("2026-09-18T15:04:00Z"),
        disposition: "interesado",
        dispositionSource: "ia",
        dispositionIa: "interesado",
        // La síntesis del LEAD sigue en el dato —es lo que pintaba el «antes»—
        // y NO es lo que tiene que salir en Detalle: sale el resumen.
        leadSynthesis: SINTESIS_DEL_LEAD,
        // El resumen empieza por una viñeta a propósito: la primera línea se
        // lee SIN el guion. Y es larga, para que la celda recorte con «…».
        summary: `- ${PRIMERA_LINEA_DEL_RESUMEN}\n- Pidió que le llamen el jueves por la tarde para cerrar el pago`,
        transcript: TRANSCRIPCION,
        hasRecording: true,
        // Una URL que no existe: el total del reproductor tiene que salir
        // igual, de `durationSecs`, sin bajar ni un byte del audio.
        recordingUrl: "/grabacion-que-no-existe.webm",
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
/** El «antes» del diálogo la pedía; se deja para que su paquete se construya. */
export const getSessionIdByPhone = async () => null;

/**
 * Lo que la base ya tiene de c3 y la lista NO: se procesó después de cargarla.
 * Es el caso de «abre sin resumen y sin transcripción aunque sí las tiene».
 */
export const RESUMEN_FRESCO = "- Julián confirmó que revisará la propuesta con su equipo";
export const TRANSCRIPCION_FRESCA = "Agente: Hola Julián.\nCliente: Hola, la reviso con mi equipo y te aviso.";

/** El detalle fresco que pide el diálogo al abrirse. */
export async function getCallDetailAction(id: string): Promise<CallRow | null> {
    const fila = LLAMADAS.find((c) => c.id === id) ?? null;
    if (fila?.id === "c3") {
        return { ...fila, summary: RESUMEN_FRESCO, transcript: TRANSCRIPCION_FRESCA, hasRecording: true };
    }
    return fila;
}
