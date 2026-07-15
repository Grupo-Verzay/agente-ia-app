export type DetectedCommitment = {
  kind: "task" | "reminder" | "appointment";
  title: string;
  type: "Seguimiento" | "Llamada" | "Reunión" | "Email" | "Tarea";
  dueDate: Date;
  sourceText: string;
};

const WEEKDAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function normalizeText(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function withTime(date: Date, hour: number, minute = 0) {
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function parseHour(text: string, fallbackHour: number) {
  const match = text.match(/\b(?:a\s+las?\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?\b/i);
  if (!match) return { hour: fallbackHour, minute: 0 };

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = normalizeText(match[3] ?? "");
  if (meridiem.startsWith("p") && hour < 12) hour += 12;
  if (meridiem.startsWith("a") && hour === 12) hour = 0;
  return { hour: Math.min(23, hour), minute: Math.min(59, minute) };
}

function parseDueDate(text: string, now: Date): Date | null {
  const numberWords: Record<string, number> = {
    un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
    siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  };
  const relative = text.match(/\ben\s+(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s*(minuto|minutos|hora|horas|dia|dias)\b/);
  if (relative) {
    const amount = Number(relative[1]) || numberWords[relative[1]];
    const unit = relative[2];
    const millis = unit.startsWith("minuto")
      ? amount * 60_000
      : unit.startsWith("hora")
        ? amount * 3_600_000
        : amount * 86_400_000;
    return new Date(now.getTime() + millis);
  }

  const fallbackHour = text.includes("tarde") ? 16 : text.includes("noche") ? 19 : 9;
  const { hour, minute } = parseHour(text, fallbackHour);

  if (text.includes("manana")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return withTime(tomorrow, hour, minute);
  }
  if (text.includes("hoy") || text.includes("esta tarde") || text.includes("esta noche")) {
    const today = withTime(now, hour, minute);
    if (today <= now) today.setDate(today.getDate() + 1);
    return today;
  }

  const weekday = WEEKDAYS.findIndex((day) => new RegExp(`\\b(?:el\\s+)?${day}\\b`).test(text));
  if (weekday >= 0) {
    const target = new Date(now);
    let daysAhead = (weekday - now.getDay() + 7) % 7;
    if (daysAhead === 0) daysAhead = 7;
    target.setDate(target.getDate() + daysAhead);
    return withTime(target, hour, minute);
  }

  return null;
}

export function detectCommitment(text: string, now = new Date(), context = ""): DetectedCommitment | null {
  const clean = normalizeText(text).replace(/\s+/g, " ").trim();
  if (!clean) return null;

  const rules: Array<{
    pattern: RegExp;
    kind: DetectedCommitment["kind"];
    title: string;
    type: DetectedCommitment["type"];
  }> = [
    { pattern: /\b(?:recuerdame|recordarme)\b.*\b(?:llamar|escribir|contactar|enviar|confirmar)\b/, kind: "reminder", title: "Recordatorio de seguimiento", type: "Seguimiento" },
    { pattern: /\b(?:nos\s+conectamos|nos\s+reunimos|agendamos|tenemos\s+reunion)\b/, kind: "appointment", title: "Reunión con el cliente", type: "Reunión" },
    { pattern: /\b(?:te|le)\s+(?:llamo|llamare|marco)\b/, kind: "task", title: "Compromiso: llamar al cliente", type: "Llamada" },
    { pattern: /\b(?:te|le)\s+(?:envio|enviare|mando|mandare)\b.*\b(propuesta|cotizacion)\b/, kind: "task", title: "Compromiso: enviar propuesta", type: "Seguimiento" },
    { pattern: /\b(?:te|le)\s+(?:envio|enviare|mando|mandare)\b/, kind: "task", title: "Compromiso: enviar información pendiente", type: "Seguimiento" },
    { pattern: /\b(?:te|le)\s+(?:escribo|contacto)\b/, kind: "reminder", title: "Compromiso: contactar nuevamente al cliente", type: "Seguimiento" },
    { pattern: /\b(?:te|le)\s+(?:confirmo|confirmare|aviso|avisare)\b/, kind: "reminder", title: "Compromiso: confirmar al cliente", type: "Seguimiento" },
    { pattern: /\b(?:revisamos|revisare|reviso)\b/, kind: "task", title: "Compromiso: revisar pendiente con el cliente", type: "Tarea" },
  ];

  const rule = rules.find((item) => item.pattern.test(clean));
  if (!rule) return null;

  const contextClean = normalizeText(context).replace(/\s+/g, " ").trim();
  const dueDate = parseDueDate(`${contextClean} ${clean}`.trim(), now);
  if (!dueDate) return null;
  return { kind: rule.kind, title: rule.title, type: rule.type, dueDate, sourceText: text };
}

export function detectClientPromise(text: string, now = new Date()): DetectedCommitment | null {
  const clean = normalizeText(text).replace(/\s+/g, " ").trim();
  const rules = [
    { pattern: /\b(?:pago|pagare|te\s+pago|le\s+pago)\b/, title: "Cliente prometió realizar el pago" },
    { pattern: /\b(?:te|le)\s+(?:confirmo|confirmare)\b/, title: "Cliente prometió confirmar" },
    { pattern: /\b(?:te|le)\s+(?:envio|enviare|mando|mandare)\b.*\b(?:documento|documentos|soporte|comprobante|informacion)\b/, title: "Cliente prometió enviar documentos" },
    { pattern: /\b(?:te|le)\s+(?:llamo|llamare|escribo|escribire)\b/, title: "Cliente prometió volver a contactar" },
  ];
  const rule = rules.find((item) => item.pattern.test(clean));
  if (!rule) return null;
  const dueDate = parseDueDate(clean, now);
  if (!dueDate) return null;
  return {
    kind: "reminder",
    title: `Promesa cliente: ${rule.title.replace(/^Cliente prometió\s*/i, "")}`,
    type: "Seguimiento",
    dueDate,
    sourceText: text,
  };
}
