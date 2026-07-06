/**
 * Definición y utilidades del constructor de campos de contactos de finanzas
 * (proveedores/clientes). Cada negocio arma su propia card: reordenar, renombrar,
 * ocultar y agregar campos propios. La configuración se guarda por `userId+kind`.
 */

export type FinanceFieldType =
  | 'text'
  | 'number'
  | 'phone'
  | 'email'
  | 'date'
  | 'textarea'
  | 'select'
  | 'contact'; // vínculo con una Session (contacto de WhatsApp)

export type FinanceFieldDef = {
  key: string; // estable; los de sistema son fijos, los propios son `cf_<id>`
  label: string;
  type: FinanceFieldType;
  system: boolean; // true = mapea a columna real o comportamiento especial (no se elimina)
  required?: boolean;
  hidden?: boolean;
  options?: string[]; // para type 'select'
};

export type FinanceContactKind = 'SUPPLIER' | 'CLIENT';

/** Claves de sistema que mapean a columnas reales de FinanceContact. */
export const SYSTEM_COLUMN_KEYS = [
  'code',
  'name',
  'phone',
  'email',
  'department',
  'city',
  'address',
  'notes',
] as const;

/** Clave especial del vínculo con Session (mapea a sessionId, no a columna de texto). */
export const CONTACT_LINK_KEY = 'sessionLink';

export function isSystemColumnKey(key: string): boolean {
  return (SYSTEM_COLUMN_KEYS as readonly string[]).includes(key);
}

export function isSystemKey(key: string): boolean {
  return isSystemColumnKey(key) || key === CONTACT_LINK_KEY;
}

/** Config por defecto (equivale a la card original). */
export function defaultFields(kind: FinanceContactKind): FinanceFieldDef[] {
  const codeLabel = kind === 'SUPPLIER' ? 'Proveedor' : 'Cliente';
  return [
    { key: 'code', label: codeLabel, type: 'text', system: true },
    { key: 'name', label: 'Nombre y apellido', type: 'text', system: true, required: true },
    { key: 'phone', label: 'Teléfono', type: 'phone', system: true },
    { key: 'email', label: 'Email', type: 'email', system: true },
    { key: 'department', label: 'Departamento', type: 'text', system: true },
    { key: 'city', label: 'Ciudad', type: 'text', system: true },
    { key: 'address', label: 'Dirección de entrega', type: 'text', system: true },
    { key: CONTACT_LINK_KEY, label: 'Contacto de WhatsApp', type: 'contact', system: true },
    { key: 'notes', label: 'Notas', type: 'textarea', system: true },
  ];
}

const VALID_TYPES: FinanceFieldType[] = ['text', 'number', 'phone', 'email', 'date', 'textarea', 'select', 'contact'];

/**
 * Normaliza una config guardada (JSON) contra los defaults:
 * - Garantiza que existan todos los campos de sistema (los que falten se
 *   agregan al final, respetando el orden guardado para el resto).
 * - Fuerza que `name` sea requerido y visible.
 * - Descarta entradas inválidas.
 */
export function normalizeFields(raw: unknown, kind: FinanceContactKind): FinanceFieldDef[] {
  const defs = defaultFields(kind);
  const defByKey = new Map(defs.map((d) => [d.key, d]));

  const parsed: FinanceFieldDef[] = Array.isArray(raw)
    ? (raw as unknown[])
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const o = item as Record<string, unknown>;
          const key = typeof o.key === 'string' ? o.key : '';
          if (!key) return null;
          const sys = isSystemKey(key);
          const type = (VALID_TYPES.includes(o.type as FinanceFieldType) ? o.type : 'text') as FinanceFieldType;
          const def = defByKey.get(key);
          return {
            key,
            label: typeof o.label === 'string' && o.label.trim() ? o.label : def?.label ?? key,
            type: sys ? def?.type ?? type : type,
            system: sys,
            required: key === 'name' ? true : Boolean(o.required),
            hidden: key === 'name' ? false : Boolean(o.hidden),
            options: Array.isArray(o.options) ? (o.options as unknown[]).map(String).filter(Boolean) : undefined,
          } as FinanceFieldDef;
        })
        .filter((x): x is FinanceFieldDef => x !== null)
    : [];

  if (parsed.length === 0) return defs;

  // Dedupe por key (conserva el primero)
  const seen = new Set<string>();
  const result: FinanceFieldDef[] = [];
  for (const f of parsed) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    result.push(f);
  }

  // Asegura que existan todos los campos de sistema
  for (const d of defs) {
    if (!seen.has(d.key)) {
      result.push({ ...d, hidden: d.key === 'name' ? false : true });
      seen.add(d.key);
    }
  }

  return result;
}

/** Genera una key única para un campo personalizado nuevo. */
export function newCustomFieldKey(existing: FinanceFieldDef[]): string {
  const used = new Set(existing.map((f) => f.key));
  let i = existing.length + 1;
  let key = `cf_${i}`;
  while (used.has(key)) {
    i += 1;
    key = `cf_${i}`;
  }
  return key;
}

/** Lee el valor de un campo desde un registro de contacto (columna o customFields). */
export function readContactValue(
  contact: Record<string, unknown> & { customFields?: unknown },
  key: string,
): string {
  if (isSystemColumnKey(key)) {
    const v = contact[key];
    return v == null ? '' : String(v);
  }
  const cf = (contact.customFields ?? {}) as Record<string, unknown>;
  const v = cf?.[key];
  return v == null ? '' : String(v);
}
