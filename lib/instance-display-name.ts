const CHANNEL_SUFFIXES = ['_wh', '_tg', '_fb', '_ig'];

export function cleanInstanceDisplayName(name?: string | null): string {
  const raw = name?.trim() || '';
  if (!raw) return '';

  const lower = raw.toLowerCase();
  const suffix = CHANNEL_SUFFIXES.find((item) => lower.endsWith(item));
  if (!suffix) return raw;

  return raw.slice(0, -suffix.length);
}

export function getInstanceDisplayName(instanceName?: string | null, displayName?: string | null): string {
  return displayName?.trim() || cleanInstanceDisplayName(instanceName) || instanceName?.trim() || '';
}
