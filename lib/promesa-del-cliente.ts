/**
 * Cuando el CLIENTE promete algo, se le abre un seguimiento.
 *
 * Esto era la mitad de `lib/commitment-detection.ts`, que murió con la ventana
 * de «Compromiso detectado». Lo que se quitó era lo contrario de esto: miraba
 * lo que escribía el ASESOR y le abría una ventana encima para que confirmara
 * una tarea. Esto no abre ninguna ventana: mira un mensaje ENTRANTE, y si
 * promete algo con fecha, deja el seguimiento hecho y lo dice con un aviso.
 *
 * Son dos cosas y por eso viven en dos sitios: si volvieran a compartir
 * fichero, quitar una se llevaría la otra por delante.
 */

/** Una promesa del cliente con su fecha, que es lo único que hace falta. */
export type PromesaDetectada = {
    title: string;
    dueDate: Date;
};

const DIAS_DE_LA_SEMANA = [
    "domingo",
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
];

function sinAcentos(text: string) {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function conHora(date: Date, hour: number, minute = 0) {
    const result = new Date(date);
    result.setHours(hour, minute, 0, 0);
    return result;
}

function leerLaHora(text: string, fallbackHour: number) {
    const match = text.match(/\b(?:a\s+las?\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?\b/i);
    if (!match) return { hour: fallbackHour, minute: 0 };

    let hour = Number(match[1]);
    const minute = Number(match[2] ?? 0);
    const meridiem = sinAcentos(match[3] ?? "");
    if (meridiem.startsWith("p") && hour < 12) hour += 12;
    if (meridiem.startsWith("a") && hour === 12) hour = 0;
    return { hour: Math.min(23, hour), minute: Math.min(59, minute) };
}

/**
 * La fecha que dice el texto, o nada.
 *
 * **Sin fecha no hay promesa**: un «te confirmo» suelto no se puede agendar, y
 * un seguimiento sin día es una tarea que nadie sabe cuándo hacer.
 */
function laFechaQueDice(text: string, now: Date): Date | null {
    const enNumeros: Record<string, number> = {
        un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
        siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
    };
    const relativa = text.match(/\ben\s+(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s*(minuto|minutos|hora|horas|dia|dias)\b/);
    if (relativa) {
        const cuantos = Number(relativa[1]) || enNumeros[relativa[1]];
        const unidad = relativa[2];
        const millis = unidad.startsWith("minuto")
            ? cuantos * 60_000
            : unidad.startsWith("hora")
                ? cuantos * 3_600_000
                : cuantos * 86_400_000;
        return new Date(now.getTime() + millis);
    }

    const horaPorDefecto = text.includes("tarde") ? 16 : text.includes("noche") ? 19 : 9;
    const { hour, minute } = leerLaHora(text, horaPorDefecto);

    if (text.includes("manana")) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return conHora(tomorrow, hour, minute);
    }
    if (text.includes("hoy") || text.includes("esta tarde") || text.includes("esta noche")) {
        const today = conHora(now, hour, minute);
        if (today <= now) today.setDate(today.getDate() + 1);
        return today;
    }

    const dia = DIAS_DE_LA_SEMANA.findIndex((nombre) => new RegExp(`\\b(?:el\\s+)?${nombre}\\b`).test(text));
    if (dia >= 0) {
        const objetivo = new Date(now);
        let faltan = (dia - now.getDay() + 7) % 7;
        if (faltan === 0) faltan = 7;
        objetivo.setDate(objetivo.getDate() + faltan);
        return conHora(objetivo, hour, minute);
    }

    return null;
}

const REGLAS_PROMESA_CLIENTE = [
    { pattern: /\b(?:pago|pagare|te\s+pago|le\s+pago)\b/, title: "Cliente prometió realizar el pago" },
    { pattern: /\b(?:te|le)\s+(?:confirmo|confirmare)\b/, title: "Cliente prometió confirmar" },
    { pattern: /\b(?:te|le)\s+(?:envio|enviare|mando|mandare)\b.*\b(?:documento|documentos|soporte|comprobante|informacion)\b/, title: "Cliente prometió enviar documentos" },
    { pattern: /\b(?:te|le)\s+(?:llamo|llamare|escribo|escribire)\b/, title: "Cliente prometió volver a contactar" },
];

/**
 * Solo mira si el texto SUENA a una promesa, sin fechas ni relojes.
 *
 * Es el filtro barato que corre en el navegador antes de llamar al servidor:
 * de cada tanda de mensajes que entra, la inmensa mayoria no promete nada, y
 * hasta ahora cada uno de ellos gastaba dos consultas a la base para acabar
 * descubriendolo. Deliberadamente NO parsea la fecha: eso depende del reloj y
 * de la zona horaria de quien mire, y esa parte se deja al servidor, que es
 * quien decide de verdad si se crea la tarea.
 */
export function mencionaUnaPromesa(text: string): boolean {
    const clean = sinAcentos(text).replace(/\s+/g, " ").trim();
    if (!clean) return false;
    return REGLAS_PROMESA_CLIENTE.some((item) => item.pattern.test(clean));
}

/** La promesa del cliente con su fecha, o nada si no hay una de las dos. */
export function detectClientPromise(text: string, now = new Date()): PromesaDetectada | null {
    const clean = sinAcentos(text).replace(/\s+/g, " ").trim();
    const regla = REGLAS_PROMESA_CLIENTE.find((item) => item.pattern.test(clean));
    if (!regla) return null;
    const dueDate = laFechaQueDice(clean, now);
    if (!dueDate) return null;
    return {
        title: `Promesa cliente: ${regla.title.replace(/^Cliente prometió\s*/i, "")}`,
        dueDate,
    };
}
