// Taxonomía compartida de "disposición" (resultado) de una llamada.
// La usan el CRM de llamadas (CallsCrmClient), el diálogo de llamada (CallDialog)
// y el lead scoring. El valor se guarda en chat_messages.raw.call.disposition.

export type CallDisposition =
  | 'interesado'
  | 'agendo'
  | 'volver_llamar'
  | 'no_contesta'
  | 'buzon'
  | 'no_interesado'
  | 'numero_equivocado';

export interface CallDispositionMeta {
  value: CallDisposition;
  label: string;
  /** Clases Tailwind para el badge (borde + fondo + texto, claro y oscuro). */
  badgeClass: string;
  /** Peso para lead scoring: positivo sube, negativo baja. */
  scoreHint: number;
}

export const CALL_DISPOSITIONS: CallDispositionMeta[] = [
  {
    value: 'interesado',
    label: 'Interesado',
    badgeClass:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400',
    scoreHint: 2,
  },
  {
    value: 'agendo',
    label: 'Agendó',
    badgeClass:
      'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-400',
    scoreHint: 3,
  },
  {
    value: 'volver_llamar',
    label: 'Volver a llamar',
    badgeClass:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400',
    scoreHint: 1,
  },
  {
    value: 'no_contesta',
    label: 'No contesta',
    badgeClass:
      'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400',
    scoreHint: 0,
  },
  {
    value: 'buzon',
    label: 'Buzón de voz',
    badgeClass:
      'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400',
    scoreHint: 0,
  },
  {
    value: 'no_interesado',
    label: 'No interesado',
    badgeClass:
      'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400',
    scoreHint: -2,
  },
  {
    value: 'numero_equivocado',
    label: 'Número equivocado',
    badgeClass:
      'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400',
    scoreHint: -1,
  },
];

const BY_VALUE = new Map<string, CallDispositionMeta>(
  CALL_DISPOSITIONS.map((d) => [d.value, d]),
);

export function getDispositionMeta(value: string | null | undefined): CallDispositionMeta | null {
  if (!value) return null;
  return BY_VALUE.get(value) ?? null;
}

export function isCallDisposition(value: string): value is CallDisposition {
  return BY_VALUE.has(value);
}
