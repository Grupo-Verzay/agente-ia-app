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

// Los dos campos FIJOS de arriba. No son datos de la ficha: son el mismo
// nombre y el mismo número que la plataforma ya guarda de cada contacto (la
// columna de chats, la cabecera, el CRM). Se editan donde aparezcan y el cambio
// sale en todos lados porque es el MISMO dato. Por eso no viven en la lista
// editable: no se ocultan, no se renombran, no se mueven y no se borran. Su
// sección es la REAL, «Contacto», y el diálogo la enseña igual que la de
// cualquier otro campo.
export type CampoFijo = { key: string; label: string; icon: string; section: string; multiline?: boolean };
export const SECCION_DE_LOS_FIJOS: string = 'Contacto';
export const CAMPOS_FIJOS: CampoFijo[] = [
  { key: 'nombre', label: 'Nombre', icon: 'User', section: SECCION_DE_LOS_FIJOS },
  { key: 'telefono', label: 'Teléfono', icon: 'Phone', section: SECCION_DE_LOS_FIJOS },
];

// Notas: texto libre que TODA ficha trae, y siempre el ÚLTIMO campo, se
// agreguen o se reordenen los que se agreguen. Tampoco vive en la lista
// editable: si viviera, arrastrar otro campo debajo lo dejaría de último. Su
// dato sigue en `ExternalClientData.data.notas`, la misma clave que el campo
// «Notas» de fábrica de antes, así que lo que ya estaba escrito no se pierde.
export const SECCION_DE_LAS_NOTAS: string = 'Libre';
export const CAMPO_NOTAS: CampoFijo = {
  key: 'notas', label: 'Notas', icon: 'FileText', section: SECCION_DE_LAS_NOTAS, multiline: true,
};

export const CLAVES_FIJAS = new Set([...CAMPOS_FIJOS, CAMPO_NOTAS].map((c) => c.key));

// Una cuenta que nunca tocó la ficha arranca SIN campos: solo los dos fijos y
// el botón de agregar. No hay campos prellenados.
export const DEFAULT_CONTACT_FIELDS: ContactFieldDef[] = [];

// Los 14 campos que la ficha traía de fábrica antes de la versión 2. Ya no se
// ofrecen: se conservan solo para saber qué era «de fábrica» al migrar una
// lista vieja (los apagados de fábrica se quitan, los encendidos se quedan).
export const CAMPOS_DE_FABRICA_DE_ANTES: ContactFieldDef[] = [
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
  'MapPin', 'Home', 'Globe', 'AtSign', 'Share2', 'Linkedin', 'FileText', 'Tag', 'User',
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

// Cómo se guarda la ficha desde la versión 2. La lista vieja era un arreglo a
// secas; la nueva lleva su versión, y eso es lo que distingue «ya migrada»
// (con sus campos apagados a propósito) de «lista de antes» (a migrar).
export const VERSION_DE_LA_FICHA = 2;
export type FichaGuardada = { version: 2; campos: ContactFieldDef[] };

// Limpia una lista: claves y etiquetas válidas, sin repetidos y SIN las claves
// fijas (esas no son de la lista). Una lista vacía se queda vacía.
function limpiar(raw: unknown[]): ContactFieldDef[] {
  const seen = new Set<string>();
  const cleaned: ContactFieldDef[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const f = item as Record<string, unknown>;
    const key = typeof f.key === 'string' ? f.key.trim() : '';
    const label = typeof f.label === 'string' ? f.label.trim() : '';
    if (!key || !label || seen.has(key) || CLAVES_FIJAS.has(key)) return;
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
  return cleaned.sort((a, b) => a.order - b.order).map((f, i) => ({ ...f, order: i }));
}

/** ¿Es la forma de la versión 2? */
export function esFichaVersion2(raw: unknown): raw is FichaGuardada {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw)
    && (raw as { version?: unknown }).version === VERSION_DE_LA_FICHA
    && Array.isArray((raw as { campos?: unknown }).campos);
}

/**
 * Migra una lista de ANTES (un arreglo a secas): se quitan los campos que la
 * cuenta tenía apagados, se conservan los encendidos y TODOS los que creó ella
 * (aunque los tuviera ocultos), y el Teléfono de fábrica se va porque ahora es
 * uno de los dos fijos. Lo que queda pasa a ser editable y borrable como un
 * campo propio. Es determinista: migrar dos veces da lo mismo.
 */
export function migrarLaListaDeAntes(raw: unknown[]): ContactFieldDef[] {
  return limpiar(raw)
    .filter((f) => f.custom || f.enabled)
    .map((f, i) => ({ ...f, custom: true, order: i }));
}

// Valida y normaliza la config guardada (de la BD) a la lista editable. Sin
// nada guardado —o con algo que no se entiende— la lista es VACÍA: una cuenta
// nueva no recibe campos prellenados.
export function normalizeContactFieldsConfig(raw: unknown): ContactFieldDef[] {
  if (esFichaVersion2(raw)) return limpiar(raw.campos);
  if (Array.isArray(raw)) return migrarLaListaDeAntes(raw);
  return [];
}

/** Lo que se escribe en la columna: siempre la forma de la versión 2. */
export function comoSeGuardaLaFicha(campos: unknown): FichaGuardada {
  return { version: VERSION_DE_LA_FICHA, campos: Array.isArray(campos) ? limpiar(campos) : [] };
}

/** Una fila de la ficha abierta: un fijo de arriba, un campo de la cuenta o Notas. */
export type FilaDeLaFicha =
  | { tipo: 'fijo'; campo: CampoFijo }
  | { tipo: 'campo'; campo: ContactFieldDef }
  | { tipo: 'notas'; campo: CampoFijo };
export type SeccionDeLaFicha = { title: string; filas: FilaDeLaFicha[] };

/**
 * Las secciones de la ficha abierta, en el MISMO orden que el diálogo de
 * configuración: Nombre y Teléfono primero (su sección, «Contacto», va la
 * primera), después los campos encendidos de la cuenta agrupados por sección
 * en orden de primera aparición, y Notas el ÚLTIMO (su sección, «Libre», va
 * la última y Notas cierra la sección). Nunca hay dos secciones con el mismo
 * título: un campo de la cuenta en «Contacto» o en «Libre» cae en la misma.
 */
export function lasSeccionesDeLaFicha(defs: ContactFieldDef[]): SeccionDeLaFicha[] {
  const campos = limpiar(Array.isArray(defs) ? defs : []).filter((f) => f.enabled);
  const orden: string[] = [];
  const porSeccion = new Map<string, FilaDeLaFicha[]>();
  const meter = (title: string, fila: FilaDeLaFicha, alPrincipio = false) => {
    if (!porSeccion.has(title)) {
      porSeccion.set(title, []);
      if (alPrincipio) orden.unshift(title); else orden.push(title);
    }
    porSeccion.get(title)!.push(fila);
  };
  for (const f of campos) meter(f.section, { tipo: 'campo', campo: f });

  // Los fijos, delante de todo: su sección pasa a ser la primera.
  const deLosFijos = porSeccion.get(SECCION_DE_LOS_FIJOS) ?? [];
  porSeccion.set(SECCION_DE_LOS_FIJOS, [
    ...CAMPOS_FIJOS.map((c) => ({ tipo: 'fijo', campo: c }) as FilaDeLaFicha),
    ...deLosFijos,
  ]);
  const i = orden.indexOf(SECCION_DE_LOS_FIJOS);
  if (i >= 0) orden.splice(i, 1);
  orden.unshift(SECCION_DE_LOS_FIJOS);

  // Notas, detrás de todo: su sección pasa a ser la última.
  const j = orden.indexOf(SECCION_DE_LAS_NOTAS);
  if (j >= 0) orden.splice(j, 1);
  if (!orden.includes(SECCION_DE_LAS_NOTAS)) orden.push(SECCION_DE_LAS_NOTAS);
  if (!porSeccion.has(SECCION_DE_LAS_NOTAS)) porSeccion.set(SECCION_DE_LAS_NOTAS, []);
  porSeccion.get(SECCION_DE_LAS_NOTAS)!.push({ tipo: 'notas', campo: CAMPO_NOTAS });

  return orden.map((title) => ({ title, filas: porSeccion.get(title)! }));
}

/**
 * Los campos que se exportan (Google Sheets), después de Teléfono y Nombre:
 * los encendidos de la cuenta en su orden y Notas el último. Notas ya no vive
 * en la lista, así que sin esto la columna se perdería de la hoja.
 */
export function losCamposQueSeExportan(defs: ContactFieldDef[]): { key: string; label: string }[] {
  const campos = limpiar(Array.isArray(defs) ? defs : []).filter((f) => f.enabled);
  return [...campos.map((f) => ({ key: f.key, label: f.label })), { key: CAMPO_NOTAS.key, label: CAMPO_NOTAS.label }];
}
