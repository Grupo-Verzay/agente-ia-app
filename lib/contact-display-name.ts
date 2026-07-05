const BAD_CONTACT_NAMES = new Set(['voce', 'voca', 'you', 'desconocido', '']);

function normalizeContactName(value?: string | null) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function isBadContactDisplayName(name?: string | null) {
  return BAD_CONTACT_NAMES.has(normalizeContactName(name));
}

export function formatContactDisplayName(
  name?: string | null,
  fallback = 'Lead',
) {
  const trimmed = name?.trim();
  return trimmed && !isBadContactDisplayName(trimmed) ? trimmed : fallback;
}
