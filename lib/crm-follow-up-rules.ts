import type { LeadStatus } from "@/types/session";
import { SERVER_TIME_ZONE } from "./utils";

export type CrmFollowUpRuleConfig = {
  id: string;
  userId: string;
  leadStatus: LeadStatus;
  enabled: boolean;
  delayMinutes: number;
  maxAttempts: number;
  goal: string;
  prompt: string;
  fallbackMessage: string;
  allowedWeekdays: number[];
  sendStartTime: string;
  sendEndTime: string;
  updatedAt: string | null;
};

export const CRM_FOLLOW_UP_RULE_STATUS_ORDER: LeadStatus[] = [
  "FRIO",
  "TIBIO",
  "CALIENTE",
  "FINALIZADO",
  "DESCARTADO",
];

export const CRM_FOLLOW_UP_WEEKDAY_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mie" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
] as const;

const DEFAULT_CRM_FOLLOW_UP_TIMEZONE = SERVER_TIME_ZONE;
const CRM_FOLLOW_UP_WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type CrmFollowUpZonedParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
  second: number;
};

export const CRM_FOLLOW_UP_RULE_DEFAULTS: Record<
  LeadStatus,
  Omit<CrmFollowUpRuleConfig, "id" | "userId" | "leadStatus" | "updatedAt">
> = {
  FRIO: {
    enabled: true,
    delayMinutes: 24 * 60,
    maxAttempts: 3,
    goal: "Reactivar la conversación de forma natural y detectar si sigue habiendo interés real. El foco es reconectar, no vender.",
    prompt:
      "Escribe entre 1 y 3 mensajes cortos (máximo 3 líneas cada uno), cordial y sin insistencia. Llama al lead por su *nombre* y usa *negrita* solo para reforzar algo clave. Menciona algo de valor sin sonar automatizado, usa máximo 1 emoji si aplica, y cierra con una pregunta simple y abierta con dos saltos de línea antes.",
    fallbackMessage:
      "Hola, *[Nombre]* 👋\n\nTe escribo para saber si aún te interesa retomar esta conversación.\n\n¿Sigue siendo algo en lo que puedo ayudarte?.",
    allowedWeekdays: [1, 2, 3, 4, 5],
    sendStartTime: "09:00",
    sendEndTime: "17:00",
  },
  TIBIO: {
    enabled: true,
    delayMinutes: 24 * 120,
    maxAttempts: 4,
    goal: "Avanzar al lead hacia una decisión concreta. Si ya mostró interés previo, hacer una llamada a la acción clara y directa hacia el siguiente paso comercial.",
    prompt:
      "Escribe entre 1 y 3 mensajes cortos (máximo 3 líneas cada uno), con tono consultivo y orientado a resultados. Llama al lead por su *nombre* y usa *negrita* solo para reforzar algo clave. Incluye un micro-valor concreto del contexto (dato, recurso o respuesta pendiente) sin sonar automatizado. No repitas mensajes anteriores ni suenes como recordatorio genérico. Usa máximo 1 emoji si aplica y cierra con una pregunta concreta para avanzar, con dos saltos de línea antes de la pregunta.",
    fallbackMessage:
      "Hola, *[Nombre]* 👋\n\nQuería saber si tu interés sigue vigente y si hay algo específico en lo que pueda ayudarte para avanzar con esto.\n\n¿Qué te parece si coordinamos una llamada para resolver tus dudas?",
    allowedWeekdays: [1, 2, 3, 4, 5],
    sendStartTime: "09:00",
    sendEndTime: "17:00",
  },
  CALIENTE: {
    enabled: true,
    delayMinutes: 24 * 180,
    maxAttempts: 5,
    goal: "Cerrar el siguiente paso comercial de forma directa y con urgencia medida. Este lead ya mostró interés real, por lo que el foco es convertir: agendar una llamada, confirmar la compra o avanzar al cierre.",
    prompt:
      "Escribe entre 1 y 3 mensajes cortos (máximo 3 líneas cada uno), con tono humano y comercial, siendo directo hacia el cierre o agendamiento. Ofrece una sola opción concreta de acción. Llama al lead por su *nombre* y usa *negrita* solo para reforzar algo clave, sin sonar automatizado. Cada mensaje debe ser fresco respecto al contexto previo. Usa máximo 1 emoji si aplica y cierra con una pregunta concreta para avanzar, con dos saltos de línea antes de la pregunta.",
    fallbackMessage: `Hola, *[Nombre]* 👋\n\nSi quieres lo dejamos listo ahora mismo.\n\n¿Te parece si avanzamos con el siguiente paso?`,
    allowedWeekdays: [1, 2, 3, 4, 5],
    sendStartTime: "09:00",
    sendEndTime: "17:00",
  },
  FINALIZADO: {
    enabled: false,
    delayMinutes: 0,
    maxAttempts: 0,
    goal: "",
    prompt: "",
    fallbackMessage: "",
    allowedWeekdays: [1, 2, 3, 4, 5],
    sendStartTime: "09:00",
    sendEndTime: "17:00",
  },
  DESCARTADO: {
    enabled: false,
    delayMinutes: 0,
    maxAttempts: 0,
    goal: "",
    prompt: "",
    fallbackMessage: "",
    allowedWeekdays: [1, 2, 3, 4, 5],
    sendStartTime: "09:00",
    sendEndTime: "17:00",
  },
};

export function generateCrmFollowUpTimeOptions() {
  const values: string[] = [];

  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 30) {
      values.push(
        `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
      );
    }
  }

  return values;
}

export function sanitizeCrmFollowUpWeekdays(value?: number[] | null) {
  const normalized = Array.from(
    new Set(
      (value ?? []).filter(
        (item): item is number =>
          Number.isInteger(item) && item >= 0 && item <= 6
      )
    )
  ).sort((a, b) => a - b);

  return normalized.length ? normalized : [1, 2, 3, 4, 5];
}

export function sanitizeCrmFollowUpTimeValue(
  value: string | null | undefined,
  fallback: string
) {
  const clean = String(value ?? "").trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(clean) ? clean : fallback;
}

export function sanitizeCrmFollowUpTimezone(timezone?: string | null) {
  const clean = String(timezone ?? "").trim();
  return clean || DEFAULT_CRM_FOLLOW_UP_TIMEZONE;
}

function parseCrmFollowUpTimeToMinutes(value: string) {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return 0;
  }

  return hour * 60 + minute;
}

function getCrmFollowUpZonedParts(date: Date, timeZone: string): CrmFollowUpZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    weekday: CRM_FOLLOW_UP_WEEKDAY_MAP[read("weekday")] ?? 0,
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    second: Number(read("second")),
  };
}

function getCrmFollowUpTimezoneOffsetMs(date: Date, timeZone: string) {
  const zoned = getCrmFollowUpZonedParts(date, timeZone);
  const utcFromLocal = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second
  );

  return utcFromLocal - date.getTime();
}

function crmFollowUpZonedDateTimeToUtc(args: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
  timeZone: string;
}) {
  const guess = new Date(
    Date.UTC(args.year, args.month - 1, args.day, args.hour, args.minute, args.second ?? 0)
  );
  const initialOffset = getCrmFollowUpTimezoneOffsetMs(guess, args.timeZone);
  const firstPass = new Date(guess.getTime() - initialOffset);
  const correctedOffset = getCrmFollowUpTimezoneOffsetMs(firstPass, args.timeZone);

  if (correctedOffset === initialOffset) {
    return firstPass;
  }

  return new Date(guess.getTime() - correctedOffset);
}

export function isWithinCrmFollowUpWindow(args: {
  date: Date;
  timeZone?: string | null;
  allowedWeekdays?: number[] | null;
  sendStartTime?: string | null;
  sendEndTime?: string | null;
}) {
  const timeZone = sanitizeCrmFollowUpTimezone(args.timeZone);
  const allowedWeekdays = sanitizeCrmFollowUpWeekdays(args.allowedWeekdays);
  const sendStartTime = sanitizeCrmFollowUpTimeValue(args.sendStartTime, "09:00");
  const sendEndTime = sanitizeCrmFollowUpTimeValue(args.sendEndTime, "18:00");

  const zoned = getCrmFollowUpZonedParts(args.date, timeZone);
  const localMinutes = zoned.hour * 60 + zoned.minute;
  const startMinutes = parseCrmFollowUpTimeToMinutes(sendStartTime);
  const endMinutes = parseCrmFollowUpTimeToMinutes(sendEndTime);

  return (
    allowedWeekdays.includes(zoned.weekday) &&
    localMinutes >= startMinutes &&
    localMinutes <= endMinutes
  );
}

export function computeNextCrmFollowUpDate(args: {
  baseDate: Date;
  timeZone?: string | null;
  allowedWeekdays?: number[] | null;
  sendStartTime?: string | null;
  sendEndTime?: string | null;
}) {
  const timeZone = sanitizeCrmFollowUpTimezone(args.timeZone);
  const allowedWeekdays = sanitizeCrmFollowUpWeekdays(args.allowedWeekdays);
  const sendStartTime = sanitizeCrmFollowUpTimeValue(args.sendStartTime, "09:00");
  const sendEndTime = sanitizeCrmFollowUpTimeValue(args.sendEndTime, "18:00");

  if (
    isWithinCrmFollowUpWindow({
      date: args.baseDate,
      timeZone,
      allowedWeekdays,
      sendStartTime,
      sendEndTime,
    })
  ) {
    return args.baseDate;
  }

  const [startHourText, startMinuteText] = sendStartTime.split(":");
  const startHour = Number(startHourText);
  const startMinute = Number(startMinuteText);
  const baseZoned = getCrmFollowUpZonedParts(args.baseDate, timeZone);
  const calendarBase = new Date(Date.UTC(baseZoned.year, baseZoned.month - 1, baseZoned.day));

  for (let offset = 0; offset < 21; offset += 1) {
    const localDate = new Date(calendarBase.getTime() + offset * 24 * 60 * 60 * 1000);
    const weekday = localDate.getUTCDay();

    if (!allowedWeekdays.includes(weekday)) {
      continue;
    }

    const candidate = crmFollowUpZonedDateTimeToUtc({
      year: localDate.getUTCFullYear(),
      month: localDate.getUTCMonth() + 1,
      day: localDate.getUTCDate(),
      hour: startHour,
      minute: startMinute,
      timeZone,
    });

    if (candidate.getTime() >= args.baseDate.getTime()) {
      return candidate;
    }
  }

  return args.baseDate;
}

export function computeCrmFollowUpScheduledFor(args: {
  delayMinutes: number;
  timeZone?: string | null;
  allowedWeekdays?: number[] | null;
  sendStartTime?: string | null;
  sendEndTime?: string | null;
  from?: Date;
}) {
  const delayMinutes = Math.max(Number(args.delayMinutes) || 0, 0);
  const from = args.from ?? new Date();
  const baseDate = new Date(from.getTime() + delayMinutes * 60_000);

  return computeNextCrmFollowUpDate({
    baseDate,
    timeZone: args.timeZone,
    allowedWeekdays: args.allowedWeekdays,
    sendStartTime: args.sendStartTime,
    sendEndTime: args.sendEndTime,
  });
}

export function normalizeCrmFollowUpRule(input: {
  id?: string | null;
  userId: string;
  leadStatus: LeadStatus;
  enabled?: boolean;
  delayMinutes?: number;
  maxAttempts?: number;
  goal?: string | null;
  prompt?: string | null;
  fallbackMessage?: string | null;
  allowedWeekdays?: number[] | null;
  sendStartTime?: string | null;
  sendEndTime?: string | null;
  updatedAt?: string | null;
}): CrmFollowUpRuleConfig {
  const defaults = CRM_FOLLOW_UP_RULE_DEFAULTS[input.leadStatus];

  return {
    id: String(input.id ?? ""),
    userId: String(input.userId ?? "").trim(),
    leadStatus: input.leadStatus,
    enabled: input.enabled ?? defaults.enabled,
    delayMinutes: Math.min(
      Math.max(Number(input.delayMinutes ?? defaults.delayMinutes) || 0, 0),
      60 * 24 * 30
    ),
    maxAttempts: Math.min(
      Math.max(Number(input.maxAttempts ?? defaults.maxAttempts) || 0, 0),
      10
    ),
    goal: String(input.goal ?? defaults.goal).trim(),
    prompt: String(input.prompt ?? defaults.prompt).trim(),
    fallbackMessage: String(
      input.fallbackMessage ?? defaults.fallbackMessage
    ).trim(),
    allowedWeekdays: sanitizeCrmFollowUpWeekdays(
      input.allowedWeekdays ?? defaults.allowedWeekdays
    ),
    sendStartTime: sanitizeCrmFollowUpTimeValue(
      input.sendStartTime,
      defaults.sendStartTime
    ),
    sendEndTime: sanitizeCrmFollowUpTimeValue(
      input.sendEndTime,
      defaults.sendEndTime
    ),
    updatedAt: input.updatedAt ?? null,
  };
}
