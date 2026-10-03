/**
 * Lo que la pantalla de Follow-ups IA (`/crm/rules`) y su guía pública
 * (`/guia/follow-ups`) tienen que decir IGUAL. Puro: lo leen los componentes,
 * la guía y el banco.
 *
 * Con los nombres escritos en dos sitios, una pestaña o un campo renombrado
 * seguiría saliendo con el nombre viejo en la guía y nadie lo notaría.
 */

/** Las tres pestañas, en el orden en que salen. */
export const PESTANAS_DE_FOLLOW_UPS = [
    { valor: "leadFunnel", nombre: "Sintetizador" },
    { valor: "leadStatus", nombre: "Clasificación de leads" },
    { valor: "followUps", nombre: "Follow-ups" },
] as const;

export type PestanaDeFollowUps = (typeof PESTANAS_DE_FOLLOW_UPS)[number]["valor"];

export function elNombreDeLaPestana(valor: PestanaDeFollowUps): string {
    return PESTANAS_DE_FOLLOW_UPS.find((p) => p.valor === valor)?.nombre ?? valor;
}

/**
 * Los campos de la regla de UN estado, con su `data-zona`, en el orden en que
 * se ven. El banco los compara con `CrmFollowUpWizard.tsx`.
 */
export const CAMPOS_DE_LA_REGLA = [
    { nombre: "Espera antes de escribir", zona: "espera" },
    { nombre: "Máx. intentos", zona: "intentos" },
    { nombre: "Desde", zona: "desde" },
    { nombre: "Hasta", zona: "hasta" },
    { nombre: "Días habilitados", zona: "dias" },
    { nombre: "Objetivo", zona: "objetivo" },
    { nombre: "Prompt interno", zona: "prompt" },
    { nombre: "Mensaje de respaldo", zona: "respaldo" },
] as const;

export const ROTULO_DE_LA_ESPERA = CAMPOS_DE_LA_REGLA[0].nombre;

export function elRotuloDe(zona: (typeof CAMPOS_DE_LA_REGLA)[number]["zona"]): string {
    return CAMPOS_DE_LA_REGLA.find((c) => c.zona === zona)?.nombre ?? zona;
}

/**
 * Cuánto espera una regla, como se dice: «1 día», «2 h», «30 min». El
 * resumen enseñaba «1440 min», que nadie lee como un día. Se usa la unidad
 * más grande que la divide entera; 0 es «Sin espera».
 */
export function laEsperaQueSeLee(minutos: number): string {
    const m = Math.max(0, Math.floor(Number(minutos) || 0));
    if (m === 0) return "Sin espera";
    if (m % (24 * 60) === 0) {
        const d = m / (24 * 60);
        return d === 1 ? "1 día" : `${d} días`;
    }
    if (m % 60 === 0) return `${m / 60} h`;
    return `${m} min`;
}

/** «1 intento» y «3 intentos»: el número manda el plural. */
export function losIntentosQueSeLeen(n: number): string {
    const k = Math.max(0, Math.floor(Number(n) || 0));
    return k === 1 ? "1 intento" : `${k} intentos`;
}

/** La línea de un estado en el Resumen. */
export function laLineaDelResumen(regla: {
    enabled: boolean;
    delayMinutes: number;
    maxAttempts: number;
    sendStartTime: string;
    sendEndTime: string;
}): string {
    if (!regla.enabled) return "Regla desactivada";
    return `${laEsperaQueSeLee(regla.delayMinutes)} · ${losIntentosQueSeLeen(regla.maxAttempts)} · ${regla.sendStartTime} - ${regla.sendEndTime}`;
}
