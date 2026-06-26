// Definición de los campos de la ficha de contacto (panel de chats).
// Es DATA pura (sin React) para poder usarse tanto en server actions como en
// el cliente. Los íconos se guardan como NOMBRE (string) y el componente se
// resuelve en el cliente vía un ICON_MAP. Cada usuario puede personalizar sus
// campos; si no hay config guardada, se usan estos valores por defecto.

export type ContactFieldDef = {
  key: string;        // clave en ExternalClientData.data (JSON)
  label: string;      // etiqueta visible
  section: string;    // sección/grupo
  icon: string;       // nombre del ícono (ver ICON_MAP en el cliente)
  multiline?: boolean;
  enabled: boolean;   // mostrar/ocultar
  order: number;      // orden global
  custom?: boolean;   // true si lo creó el usuario (no es un campo base)
};

export type ContactSectionDef = { title: string; icon: string };

// Orden e íconos de las secciones base.
export const DEFAULT_CONTACT_SECTIONS: ContactSectionDef[] = [
  { title: 'Datos de negocio', icon: 'Building2' },
  { title: 'Contacto', icon: 'Phone' },
  { title: 'Ubicación', icon: 'MapPin' },
  { title: 'Presencia digital', icon: 'Globe' },
  { title: 'Libre', icon: 'FileText' },
];

// Los 14 campos base (equivalentes al SECTIONS_CONFIG hardcodeado original).
export const DEFAULT_CONTACT_FIELDS: ContactFieldDef[] = [
  { key: 'empresa',   label: 'Empresa',   section: 'Datos de negocio',  icon: 'Building2',  enabled: true, order: 0 },
  { key: 'cargo',     label: 'Cargo',     section: 'Datos de negocio',  icon: 'Briefcase',  enabled: true, order: 1 },
  { key: 'documento', label: 'Documento', section: 'Datos de negocio',  icon: 'CreditCard', enabled: true, order: 2 },
  { key: 'telefono',  label: 'Teléfono',  section: 'Contacto',          icon: 'Phone',      enabled: true, order: 3 },
  { key: 'email',     label: 'Email',     section: 'Contacto',          icon: 'Mail',       enabled: true, order: 4 },
  { key: 'fecha',     label: 'Fecha',     section: 'Contacto',          icon: 'Calendar',   enabled: true, order: 5 },
  { key: 'pais',      label: 'País',      section: 'Ubicación',         icon: 'Flag',       enabled: true, order: 6 },
  { key: 'ciudad',    label: 'Ciudad',    section: 'Ubicación',         icon: 'MapPin',     enabled: true, order: 7 },
  { key: 'direccion', label: 'Dirección', section: 'Ubicación',         icon: 'Home',       enabled: true, order: 8 },
  { key: 'sitioWeb',  label: 'Sitio web', section: 'Presencia digital', icon: 'Globe',      enabled: true, order: 9 },
  { key: 'instagram', label: 'Instagram', section: 'Presencia digital', icon: 'AtSign',     enabled: true, order: 10 },
  { key: 'facebook',  label: 'Facebook',  section: 'Presencia digital', icon: 'Share2',     enabled: true, order: 11 },
  { key: 'linkedin',  label: 'LinkedIn',  section: 'Presencia digital', icon: 'Linkedin',   enabled: true, order: 12 },
  { key: 'notas',     label: 'Notas',     section: 'Libre',             icon: 'FileText',   multiline: true, enabled: true, order: 13 },
];

// Nombres de ícono disponibles (deben existir en el ICON_MAP del cliente).
export const CONTACT_ICON_NAMES = [
  'Building2', 'Briefcase', 'CreditCard', 'Phone', 'Mail', 'Calendar', 'Flag',
  'MapPin', 'Home', 'Globe', 'AtSign', 'Share2', 'Linkedin', 'FileText', 'Tag',
] as const;

// Reglas palabra-clave → ícono para auto-asignar según la etiqueta del campo.
const ICON_RULES: [RegExp, string][] = [
  [/correo|email|e-mail|mail/i, 'Mail'],
  [/tel[eé]fono|celular|m[oó]vil|whatsapp|contacto|llamar|n[uú]mero/i, 'Phone'],
  [/empresa|negocio|compa[nñ][ií]a|organizaci[oó]n|raz[oó]n social/i, 'Building2'],
  [/cargo|puesto|rol|profesi[oó]n|ocupaci[oó]n|oficio/i, 'Briefcase'],
  [/documento|c[eé]dula|dni|identificaci[oó]n|nit|rut|pasaporte|p[oó]liza|matr[ií]cula|placa/i, 'CreditCard'],
  [/fecha|cumplea[nñ]os|nacimiento|d[ií]a|vencimiento|registro/i, 'Calendar'],
  [/pa[ií]s/i, 'Flag'],
  [/ciudad|regi[oó]n|zona|barrio|localidad|municipio|estado|provincia/i, 'MapPin'],
  [/direcci[oó]n|domicilio|casa|ubicaci[oó]n/i, 'Home'],
  [/sitio|web|p[aá]gina|url|portal/i, 'Globe'],
  [/instagram|ig\b/i, 'AtSign'],
  [/facebook|fb\b/i, 'Share2'],
  [/linkedin/i, 'Linkedin'],
  [/nota|comentario|observaci[oó]n|detalle|descripci[oó]n|info/i, 'FileText'],
];

// Devuelve el nombre del ícono más apropiado según la etiqueta (auto-asignación).
export function pickIconForLabel(label: string): string {
  const text = (label || '').trim();
  if (!text) return 'Tag';
  for (const [rx, icon] of ICON_RULES) {
    if (rx.test(text)) return icon;
  }
  return 'Tag';
}

// Quita marcas diacríticas combinantes (U+0300–U+036F) sin usar un literal
// regex con esos caracteres (evita problemas de codificación del archivo).
function stripDiacritics(input: string): string {
  let out = '';
  for (const ch of input.normalize('NFD')) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x300 && code <= 0x36f) continue;
    out += ch;
  }
  return out;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// Genera una clave segura a partir de una etiqueta (para campos personalizados).
export function slugifyFieldKey(label: string): string {
  const base = stripDiacritics(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || `campo_${Math.abs(hashString(label))}`;
}

// Valida y normaliza una config arbitraria (de la BD) a ContactFieldDef[].
// Si el valor no es válido o queda vacío, devuelve los defaults.
export function normalizeContactFieldsConfig(raw: unknown): ContactFieldDef[] {
  if (!Array.isArray(raw)) return DEFAULT_CONTACT_FIELDS;

  const seen = new Set<string>();
  const cleaned: ContactFieldDef[] = [];

  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const f = item as Record<string, unknown>;
    const key = typeof f.key === 'string' ? f.key.trim() : '';
    const label = typeof f.label === 'string' ? f.label.trim() : '';
    if (!key || !label || seen.has(key)) return;
    seen.add(key);
    cleaned.push({
      key,
      label,
      section: typeof f.section === 'string' && f.section.trim() ? f.section.trim() : 'Libre',
      icon: typeof f.icon === 'string' && f.icon.trim() ? f.icon.trim() : 'Tag',
      multiline: f.multiline === true,
      enabled: f.enabled !== false,
      order: typeof f.order === 'number' ? f.order : i,
      custom: f.custom === true,
    });
  });

  return cleaned.length ? cleaned : DEFAULT_CONTACT_FIELDS;
}
