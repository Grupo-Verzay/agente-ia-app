/**
 * Duración de la prueba gratis y días de sus seguimientos.
 *
 * Estaban fijos en el código: 7 días para todo el mundo y seguimientos en los
 * días 1, 3 y 6. Verzay y Aizen-Bot venden distinto y necesitan pruebas de
 * distinta duración, así que ahora cada marca guarda los suyos y esto es solo
 * el valor por defecto de quien no los ha tocado.
 */
export const DEFAULT_TRIAL_DAYS = 7;
export const DEFAULT_FOLLOW_UP_DAYS: [number, number, number] = [1, 3, 6];

/** Tope alto para que nadie deje la prueba en un año por un dedazo. */
export const MAX_TRIAL_DAYS = 90;

export type TrialDaysConfig = {
  trialDays?: number | null;
  dayOffset1?: number | null;
  dayOffset2?: number | null;
  dayOffset3?: number | null;
};

export function resolveTrialDays(config: TrialDaysConfig | null | undefined): number {
  const dias = Number(config?.trialDays ?? 0);
  return Number.isFinite(dias) && dias > 0 ? Math.floor(dias) : DEFAULT_TRIAL_DAYS;
}

/**
 * Los tres días en que salen los seguimientos, de menor a mayor.
 *
 * El orden importa: el envío se registra por número de día y la lista se
 * recorre buscando el seguimiento más antiguo que ya tocaba. Dos slots en el
 * mismo día chocarían en ese registro, así que los repetidos se descartan.
 */
export function resolveFollowUpDays(config: TrialDaysConfig | null | undefined): number[] {
  const crudos = [
    config?.dayOffset1 ?? DEFAULT_FOLLOW_UP_DAYS[0],
    config?.dayOffset2 ?? DEFAULT_FOLLOW_UP_DAYS[1],
    config?.dayOffset3 ?? DEFAULT_FOLLOW_UP_DAYS[2],
  ];

  const validos = crudos
    .map((d) => Math.floor(Number(d)))
    .filter((d) => Number.isFinite(d) && d >= 1);

  const unicos = Array.from(new Set(validos)).sort((a, b) => a - b);
  return unicos.length ? unicos : [...DEFAULT_FOLLOW_UP_DAYS];
}

/** Valida lo que llega del formulario antes de guardarlo. */
export function validarDiasDeSeguimiento(dias: number[]): { ok: true } | { ok: false; error: string } {
  if (dias.some((d) => !Number.isFinite(d) || d < 1)) {
    return { ok: false, error: "Los días de seguimiento deben ser números de 1 en adelante." };
  }
  if (new Set(dias).size !== dias.length) {
    return { ok: false, error: "No puede haber dos seguimientos el mismo día." };
  }
  return { ok: true };
}
