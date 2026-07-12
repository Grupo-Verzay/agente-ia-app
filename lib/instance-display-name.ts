const CHANNEL_SUFFIXES = ['_wh', '_tg', '_fb', '_ig'];

const WORD_REPLACEMENTS: Record<string, string> = {
  atencion: 'Atención',
  notificaciones: 'Notificaciones',
  ventas: 'Ventas',
  asistencia: 'Asistencia',
};

function prettifyWord(word: string): string {
  const cleaned = word.trim();
  if (!cleaned) return '';

  const lower = cleaned.toLowerCase();
  return WORD_REPLACEMENTS[lower] ?? lower.charAt(0).toUpperCase() + lower.slice(1);
}

function prettifyTechnicalName(name: string): string {
  const value = cleanInstanceDisplayName(name).trim();
  if (!value) return '';
  if (value.includes('|')) return value;

  const looksTechnical = value === value.toUpperCase() || /[_-]/.test(value);
  if (!looksTechnical) return value;

  if (value.includes('_')) {
    const parts = value.split('_').filter(Boolean).map(prettifyWord);
    if (parts.length >= 2) return `${parts[0]} | ${parts.slice(1).join(' ')}`;
    return parts[0] ?? value;
  }

  if (value.includes('-')) {
    return value.split('-').filter(Boolean).map(prettifyWord).join('-');
  }

  return prettifyWord(value);
}

export function cleanInstanceDisplayName(name?: string | null): string {
  const raw = name?.trim() || '';
  if (!raw) return '';

  const lower = raw.toLowerCase();
  const suffix = CHANNEL_SUFFIXES.find((item) => lower.endsWith(item));
  if (!suffix) return raw;

  return raw.slice(0, -suffix.length);
}

export function getInstanceDisplayName(instanceName?: string | null, displayName?: string | null): string {
  const visible = displayName?.trim();
  if (visible) return prettifyTechnicalName(visible);

  return prettifyTechnicalName(instanceName?.trim() || '') || instanceName?.trim() || '';
}

export function isMetaWhatsAppInstance(instanceType?: string | null, metaChannel?: string | null): boolean {
  const type = instanceType?.trim().toLowerCase();
  const channel = metaChannel?.trim().toLowerCase();
  return type === 'meta' && (!channel || channel === 'whatsapp');
}

export function getInstanceUiDisplayName(args: {
  instanceName?: string | null;
  displayName?: string | null;
  company?: string | null;
  instanceType?: string | null;
  metaChannel?: string | null;
  includeApiSuffix?: boolean;
}): string {
  const technicalFallback = getInstanceDisplayName(args.instanceName, args.displayName);
  const company = args.company?.trim();
  const displayName = args.displayName?.trim();
  const displayNameLooksTechnical = Boolean(
    displayName &&
      !displayName.includes('|') &&
      (displayName === displayName.toUpperCase() || /[_-]/.test(displayName)),
  );
  const base = company && (!displayName || displayNameLooksTechnical)
    ? prettifyTechnicalName(company)
    : technicalFallback;

  if (args.includeApiSuffix && isMetaWhatsAppInstance(args.instanceType, args.metaChannel)) {
    return `${base} (API)`;
  }

  return base;
}
