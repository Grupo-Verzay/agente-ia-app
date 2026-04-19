export type ExternalClientDataRecord = Record<string, unknown>;

export interface ExternalClientData {
  id: string;
  userId: string;
  remoteJid: string;
  data: ExternalClientDataRecord;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExternalClientDataImportRow {
  remoteJid: string;
  data: ExternalClientDataRecord;
}

export interface ExternalClientDataImportResult {
  created: number;
  updated: number;
  errors: number;
  parseErrors?: string[];
}

export interface GoogleSheetImportOptions {
  /** Nombre de la columna que contiene el número de WhatsApp. Por defecto: "WHATSAPP" */
  remoteJidColumn?: string;
  /** Etiqueta de origen para auditoría. Por defecto: "google_sheets" */
  source?: string;
}

export interface ExternalClientDataListResult {
  items: ExternalClientData[];
  total: number;
}

// ─── Tool Configs ─────────────────────────────────────────────────────────────

/**
 * Categoría que determina si el backend tiene implementación fija (builtin)
 * o si el comportamiento es 100% dinámico desde la config (data_query).
 */
export type ExternalDataToolCategory = 'builtin' | 'data_query';

/**
 * Builtin: implementación NestJS fija — solo nombre/descripción/enabled son editables.
 * Data query: comportamiento completamente driven por config.
 */
export type ExternalDataBuiltinToolType =
  | 'notificacion_asesor'
  | 'ejecutar_flujos'
  | 'listar_workflows'
  | 'consultar_datos_cliente'
  | 'buscar_cliente_por_dato';

export type ExternalDataQueryToolType = 'auto_inject' | 'search_by_field';

export type ExternalDataToolType = ExternalDataBuiltinToolType | ExternalDataQueryToolType;

/** toolTypes críticos: deshabilitarlos rompe funcionalidades core del agente */
export const CRITICAL_TOOL_TYPES: ExternalDataBuiltinToolType[] = [
  'notificacion_asesor',
  'ejecutar_flujos',
];

export interface ExternalDataToolConfig {
  id: string;
  userId: string;
  /** Nombre que el agente IA usa al invocar la herramienta (editable) */
  toolKey: string;
  displayName: string;
  toolDescription: string;
  toolCategory: ExternalDataToolCategory;
  toolType: ExternalDataToolType;
  searchField: string | null;
  promptTemplate: string | null;
  isEnabled: boolean;
  /** true = sembrado automáticamente como configuración por defecto del sistema */
  isDefault: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExternalDataToolConfigInput {
  toolKey: string;
  displayName: string;
  toolDescription: string;
  toolCategory: ExternalDataToolCategory;
  toolType: ExternalDataToolType;
  searchField?: string | null;
  promptTemplate?: string | null;
  isEnabled?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
}
