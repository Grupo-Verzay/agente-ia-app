// Taxonomía compartida de "disposición" (resultado) de una llamada.
// La usan el CRM de llamadas (CallsCrmClient), el diálogo de llamada (CallDialog)
// y el lead scoring. El valor se guarda en chat_messages.raw.call.disposition.
//
// Son CINCO y en este orden, que es el del embudo: Interesado → Link enviado
// (el estado más avanzado: además de interés, se le mandó el enlace de agenda)
// → Volver a llamar → No contesta → No interesado. «Buzón de voz» y «Número
// equivocado» se fueron porque no aplican; «Agendó» pasó a llamarse «Link
// enviado», que es lo que de verdad se sabe desde la llamada.
//
// Las filas viejas NO se reescriben: `getDispositionMeta` las traduce al leer
// (`agendo` → Link enviado, `buzon` → No contesta). Un `numero_equivocado`
// guardado no tiene equivalente y vuelve a salir como «Marcar resultado».

export type CallDisposition =
  | 'interesado'
  | 'link_enviado'
  | 'volver_llamar'
  | 'no_contesta'
  | 'no_interesado';

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
    value: 'link_enviado',
    label: 'Link enviado',
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
    value: 'no_interesado',
    label: 'No interesado',
    badgeClass:
      'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400',
    scoreHint: -2,
  },
];

const BY_VALUE = new Map<string, CallDispositionMeta>(
  CALL_DISPOSITIONS.map((d) => [d.value, d]),
);

/** Los valores de antes, leídos como el de ahora que les corresponde. */
const DE_ANTES: Record<string, CallDisposition> = {
  agendo: 'link_enviado',
  buzon: 'no_contesta',
};

/** El valor vigente de lo guardado (traduce los viejos), o null. */
export function comoResultadoVigente(value: string | null | undefined): CallDisposition | null {
  if (!value) return null;
  if (BY_VALUE.has(value)) return value as CallDisposition;
  return DE_ANTES[value] ?? null;
}

export function getDispositionMeta(value: string | null | undefined): CallDispositionMeta | null {
  const vigente = comoResultadoVigente(value);
  return vigente ? BY_VALUE.get(vigente) ?? null : null;
}

export function isCallDisposition(value: string): value is CallDisposition {
  return BY_VALUE.has(value);
}
