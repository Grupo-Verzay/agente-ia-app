/**
 * La única acción que abre el diálogo «Detalle de la llamada», apuntada para
 * el banco `scripts/banco-detalle-de-llamada.sh`. Los datos son los MISMOS en
 * los dos modos: lo único que cambia entre el «antes» y el «ahora» es cómo se
 * pinta el diálogo.
 */
import type { CallRow } from "@/lib/fila-de-llamada";

export const CON_TURNOS =
    "Operador: Hola, soy Verzy, de Verzay. ¿Hablo con Julián?\n" +
    "Cliente: Sí, soy yo, dígame.\n" +
    "Operador: Le llamo por la cotización del plan anual.";

export const CORRIDA = "Hola soy Verzy de Verzay le llamo por la cotización sí dígame claro que sí";

export const RESUMEN = "- Julián pidió la cotización del plan anual.\n- Revisará precios con su socio.";

const BASE: CallRow = {
    id: "d1",
    phone: "573001112233",
    contactName: "Julián",
    direction: "outgoing",
    durationSecs: 187,
    ts: Date.UTC(2026, 8, 22, 15, 0, 0),
    disposition: null,
    summary: RESUMEN,
    transcript: CON_TURNOS,
    hasRecording: true,
    recordingUrl: "/grabacion.wav",
} as CallRow;

export const LLAMADAS: Record<string, CallRow> = {
    d1: BASE,
    d2: { ...BASE, id: "d2", transcript: CORRIDA } as CallRow,
};

export async function getCallDetailAction(id: string): Promise<CallRow | null> {
    return LLAMADAS[id] ?? null;
}
