/**
 * Qué recordatorios lleva una cita y qué dicen. UNA regla para los cuatro
 * caminos por los que nace una cita —el agente de IA, la página pública, las
 * reservas por equipos y el chat—, que antes llevaba cada uno su copia y cada
 * copia se equivocaba en algo distinto:
 *
 * | camino | qué pasaba |
 * | --- | --- |
 * | chat | **ningún recordatorio** |
 * | agente y reservas | la hora del texto salía en la zona del **país del teléfono** |
 * | agente y reservas | una plantilla con la hora rota se leía como **2026 segundos** (~34 min) |
 * | página pública | los seguimientos nacían con `idNodo` vacío: sin forma de saber de qué cita eran |
 *
 * La tercera fila es la de «un recordatorio de más unos 34 minutos antes de
 * cada cita»: la acción «Recordatorio» de las automatizaciones guardaba su hora
 * como un ISO (`2026-09-28T…`) dentro de una plantilla de agenda, y la versión
 * indulgente de `normalizeTimeToSeconds` de las dos rutas de la API se caía a
 * `parseInt`, que de ese texto saca **2026**. Aquí solo vale `unidad-valor`.
 *
 * Puro. Lo que lee la base y escribe los seguimientos está en
 * `lib/recordatorios-de-la-cita.server.ts`.
 */
import { laFechaDeLaCita, laZonaDeLaCuenta } from "@/lib/zona-de-la-cuenta";

const SEGUNDOS_POR_UNIDAD: Record<string, number> = {
    seconds: 1,
    minutes: 60,
    hours: 3600,
    days: 86400,
};

/**
 * Cuántos segundos antes de la cita sale una plantilla. SOLO `unidad-valor`
 * («hours-3», «minutes-30»); cualquier otra cosa —un ISO, un número suelto, un
 * texto— vale 0, o sea «esta plantilla no programa nada». Equivocarse hacia 0
 * cuesta un recordatorio que no sale; hacia el otro lado, uno que sale a una
 * hora que nadie eligió.
 */
export function segundosAntesDeLaCita(tiempo: unknown): number {
    const m = /^(seconds|minutes|hours|days)-(\d+)$/.exec(String(tiempo ?? "").trim());
    if (!m) return 0;
    const valor = Number.parseInt(m[2], 10);
    if (!Number.isFinite(valor) || valor <= 0) return 0;
    return valor * SEGUNDOS_POR_UNIDAD[m[1]];
}

export type DatosDelRecordatorio = {
    nombreDelCliente: string;
    inicio: Date;
    /** La zona de la CUENTA. Nunca la del teléfono del cliente. */
    zona: string;
    duracionMinutos: number;
    servicio?: string | null;
    /**
     * El enlace de la reunión de ESTA cita (`@meeting_link`): el fijo de la
     * cuenta, o el de la videollamada con IA si la cuenta está en ese modo.
     * Sin enlace la variable queda vacía, nunca a la vista.
     */
    enlaceDeReunion?: string | null;
};

/** El texto de una plantilla con sus variables, con la hora en la zona de la cuenta. */
export function elTextoDelRecordatorio(plantilla: string, cita: DatosDelRecordatorio): string {
    const zona = laZonaDeLaCuenta(cita.zona);
    return String(plantilla ?? "")
        .replace(/@client_name\b/gi, cita.nombreDelCliente)
        .replace(/@service_name\b/gi, cita.servicio ?? "")
        .replace(/@appointment_datetime\b/gi, laFechaDeLaCita(cita.inicio, zona))
        .replace(/@appointment_duration\b/gi, `${cita.duracionMinutos} min`)
        .replace(/@meeting_link\b/gi, cita.enlaceDeReunion ?? "");
}

export type PlantillaDeAgenda = {
    id: string;
    time: string | null;
    description: string | null;
    title?: string | null;
};

export type RecordatorioProgramado = {
    plantillaId: string;
    /** El instante, en ISO/UTC: lo que el motor lee sin interpretar nada. */
    cuando: string;
    mensaje: string;
};

/**
 * Los recordatorios que le tocan a una cita: uno por plantilla válida, con su
 * instante y su texto. Los que ya pasaron no se programan (una cita agendada
 * con dos horas de margen no recibe el de «en tres horas»).
 */
export function losRecordatoriosDeLaCita(
    plantillas: PlantillaDeAgenda[],
    cita: DatosDelRecordatorio,
    ahora: Date = new Date(),
): RecordatorioProgramado[] {
    const salida: RecordatorioProgramado[] = [];
    for (const p of plantillas) {
        const segundos = segundosAntesDeLaCita(p.time);
        if (!segundos) continue;
        const cuando = new Date(cita.inicio.getTime() - segundos * 1000);
        if (cuando.getTime() <= ahora.getTime()) continue;
        salida.push({
            plantillaId: p.id,
            cuando: cuando.toISOString(),
            mensaje: elTextoDelRecordatorio(p.description ?? p.title ?? "", cita),
        });
    }
    return salida;
}

/**
 * La llave de un recordatorio de cita. `seguimientos.idempotencyKey` es ÚNICA,
 * así que con ella programar dos veces la misma cita —el chat y la página
 * pública llaman a lo mismo que el agente— no duplica nada.
 */
export function laLlaveDelRecordatorio(citaId: string, plantillaId: string): string {
    return `appt-reminder:${citaId}:${plantillaId}`;
}

/** El `idNodo`: el prefijo que el motor reconoce como «sale a su hora». */
export function elNodoDelRecordatorio(plantillaId: string): string {
    return `appt-reminder-${plantillaId}`;
}
