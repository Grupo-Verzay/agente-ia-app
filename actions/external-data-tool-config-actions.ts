'use server';

import { db } from '@/lib/db';
import { BUILTIN_TOOL_CATALOG } from '@/lib/external-data-tool-catalog';
import type {
  ExternalDataBuiltinToolType,
  ExternalDataToolConfig,
  ExternalDataToolConfigInput,
} from '@/types/external-client-data';

// Conjunto de toolTypes válidos para validación en servidor
const VALID_BUILTIN_TOOL_TYPES = new Set(BUILTIN_TOOL_CATALOG.map((c) => c.toolType));
const VALID_DATA_QUERY_TOOL_TYPES = new Set(['auto_inject', 'search_by_field']);

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listToolConfigs(userId: string): Promise<ExternalDataToolConfig[]> {
  if (!userId) return [];

  const rows = await db.externalDataToolConfig.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return rows as ExternalDataToolConfig[];
}

// ─── Add builtin tool from catalog ───────────────────────────────────────────

/**
 * Agrega una herramienta builtin al usuario desde el catálogo del sistema.
 * El toolKey siempre viene del catálogo (no editable por el usuario).
 * Solo se personalizan displayName y toolDescription.
 */
export async function addBuiltinTool(
  userId: string,
  toolType: ExternalDataBuiltinToolType,
  overrides: { displayName?: string; toolDescription?: string },
): Promise<{ success: boolean; error?: string }> {
  if (!userId) return { success: false, error: 'userId requerido' };

  if (!VALID_BUILTIN_TOOL_TYPES.has(toolType)) {
    return { success: false, error: `toolType "${toolType}" no existe en el catálogo del sistema` };
  }

  const catalogEntry = BUILTIN_TOOL_CATALOG.find((c) => c.toolType === toolType)!;

  const finalDisplayName = overrides.displayName?.trim() || catalogEntry.defaultDisplayName;
  const finalDescription = overrides.toolDescription?.trim() || catalogEntry.defaultDescription;

  if (!finalDisplayName) return { success: false, error: 'El nombre visible es requerido' };
  if (!finalDescription) return { success: false, error: 'La descripción para el agente es requerida' };

  try {
    const existingByType = await db.externalDataToolConfig.findFirst({
      where: { userId, toolType },
    });
    if (existingByType) {
      return {
        success: false,
        error: `La herramienta "${catalogEntry.defaultDisplayName}" ya está agregada para este cliente`,
      };
    }

    await db.externalDataToolConfig.create({
      data: {
        userId,
        toolKey: catalogEntry.defaultKey,
        displayName: finalDisplayName,
        toolDescription: finalDescription,
        toolCategory: 'builtin',
        toolType,
        searchField: null,
        promptTemplate: null,
        isEnabled: true,
        isDefault: false,
        sortOrder: catalogEntry.sortOrder,
      },
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message ?? 'Error desconocido' };
  }
}

// ─── Update builtin tool (solo displayName y toolDescription) ────────────────

/**
 * Actualiza solo displayName y toolDescription de una herramienta builtin.
 * toolKey, toolCategory y toolType son inmutables.
 */
export async function updateBuiltinTool(
  userId: string,
  toolKey: string,
  updates: { displayName: string; toolDescription: string },
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !toolKey) return { success: false, error: 'Parámetros inválidos' };

  const newDisplayName = updates.displayName.trim();
  const newDescription = updates.toolDescription.trim();

  if (!newDisplayName) return { success: false, error: 'El nombre visible es requerido' };
  if (!newDescription) return { success: false, error: 'La descripción para el agente es requerida' };

  try {
    await db.externalDataToolConfig.update({
      where: { userId_toolKey: { userId, toolKey } },
      data: { displayName: newDisplayName, toolDescription: newDescription },
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message ?? 'Error desconocido' };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Genera un toolKey válido a partir del displayName.
 * Ejemplo: "Buscar por Cédula y RIF" → "buscar_por_cedula_y_rif"
 */
function slugifyToolKey(displayName: string): string {
  return displayName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // eliminar acentos
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

// ─── Upsert data_query tool ───────────────────────────────────────────────────

/**
 * Crea o actualiza una herramienta de tipo data_query (search_by_field / auto_inject).
 * El toolKey se genera automáticamente del displayName — el usuario no lo edita.
 * En edición el toolKey no cambia (el identificador es inmutable).
 */
export async function upsertDataQueryTool(
  userId: string,
  input: ExternalDataToolConfigInput,
  editingKey?: string,
): Promise<{ success: boolean; error?: string; warning?: string }> {
  if (!userId) return { success: false, error: 'userId requerido' };

  if (input.toolCategory !== 'data_query') {
    return { success: false, error: 'Solo se pueden gestionar herramientas de tipo data_query desde este formulario' };
  }

  if (!VALID_DATA_QUERY_TOOL_TYPES.has(input.toolType)) {
    return { success: false, error: `toolType "${input.toolType}" no es válido para herramientas dinámicas` };
  }

  const displayName = input.displayName?.trim() ?? '';
  if (!displayName) return { success: false, error: 'El nombre visible es requerido' };

  const toolDescription = input.toolDescription?.trim() ?? '';
  if (!toolDescription) return { success: false, error: 'La descripción para el agente es requerida' };

  if (input.toolType === 'search_by_field') {
    const sf = input.searchField?.trim() ?? '';
    if (!sf) return { success: false, error: 'El campo de búsqueda es requerido' };
  }

  let warning: string | undefined;

  try {
    const isEditing = !!editingKey;

    // En creación: generar toolKey desde displayName y resolver colisiones
    // En edición: el toolKey es inmutable (no cambia)
    let finalKey: string;
    if (isEditing) {
      finalKey = editingKey;
    } else {
      const baseKey = slugifyToolKey(displayName);
      // Resolver colisión añadiendo sufijo numérico si es necesario
      let candidate = baseKey;
      let suffix = 2;
      while (await db.externalDataToolConfig.findFirst({ where: { userId, toolKey: candidate } })) {
        candidate = `${baseKey}_${suffix++}`;
      }
      finalKey = candidate;
    }

    // Advertir si ya existe un auto_inject (no bloqueante)
    if (input.toolType === 'auto_inject' && !isEditing) {
      const existingAutoInject = await db.externalDataToolConfig.findFirst({
        where: { userId, toolType: 'auto_inject' },
      });
      if (existingAutoInject) {
        warning = 'Ya existe una herramienta de inyección automática. Tener más de una puede duplicar datos en el contexto del agente.';
      }
    }

    if (isEditing) {
      await db.externalDataToolConfig.update({
        where: { userId_toolKey: { userId, toolKey: finalKey } },
        data: {
          displayName,
          toolDescription,
          searchField: input.searchField?.trim() || null,
          promptTemplate: input.promptTemplate?.trim() || null,
          isEnabled: input.isEnabled ?? true,
        },
      });
    } else {
      await db.externalDataToolConfig.create({
        data: {
          userId,
          toolKey: finalKey,
          displayName,
          toolDescription,
          toolCategory: 'data_query',
          toolType: input.toolType,
          searchField: input.searchField?.trim() || null,
          promptTemplate: input.promptTemplate?.trim() || null,
          isEnabled: input.isEnabled ?? true,
          isDefault: false,
          sortOrder: input.sortOrder ?? 10,
        },
      });
    }

    return { success: true, warning };
  } catch (error: any) {
    return { success: false, error: error?.message ?? 'Error desconocido' };
  }
}

// ─── Apply all defaults (seed) ────────────────────────────────────────────────

/**
 * Siembra todo el catálogo builtin para un usuario.
 * Solo crea las que no existen (por toolType). Nunca sobreescribe.
 */
export async function applyDefaultToolConfigs(
  userId: string,
): Promise<{ success: boolean; created: number; skipped: number; error?: string }> {
  if (!userId) return { success: false, created: 0, skipped: 0, error: 'userId requerido' };

  try {
    const existing = await db.externalDataToolConfig.findMany({
      where: { userId, toolCategory: 'builtin' },
      select: { toolType: true },
    });

    const existingTypes = new Set(existing.map((r) => r.toolType));
    let created = 0;
    let skipped = 0;

    for (const entry of BUILTIN_TOOL_CATALOG) {
      if (existingTypes.has(entry.toolType)) {
        skipped++;
        continue;
      }

      // Verificar que el toolKey por defecto no colisione con data_query existentes
      const keyInUse = await db.externalDataToolConfig.findFirst({
        where: { userId, toolKey: entry.defaultKey },
      });

      await db.externalDataToolConfig.create({
        data: {
          userId,
          toolKey: keyInUse ? `${entry.defaultKey}_${Date.now()}` : entry.defaultKey,
          displayName: entry.defaultDisplayName,
          toolDescription: entry.defaultDescription,
          toolCategory: 'builtin',
          toolType: entry.toolType,
          searchField: null,
          promptTemplate: null,
          isEnabled: true,
          isDefault: true,
          sortOrder: entry.sortOrder,
        },
      });

      created++;
    }

    return { success: true, created, skipped };
  } catch (error: any) {
    return { success: false, created: 0, skipped: 0, error: error?.message ?? 'Error desconocido' };
  }
}

// ─── Restore single builtin to catalog defaults ───────────────────────────────

export async function restoreToolConfigDefault(
  userId: string,
  toolKey: string,
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !toolKey) return { success: false, error: 'Parámetros inválidos' };

  const record = await db.externalDataToolConfig.findFirst({
    where: { userId, toolKey },
    select: { toolType: true },
  });
  if (!record) return { success: false, error: 'Herramienta no encontrada' };

  const catalogEntry = BUILTIN_TOOL_CATALOG.find((c) => c.toolType === record.toolType);
  if (!catalogEntry) return { success: false, error: 'No existe configuración por defecto para esta herramienta' };

  try {
    await db.externalDataToolConfig.update({
      where: { userId_toolKey: { userId, toolKey } },
      data: {
        displayName: catalogEntry.defaultDisplayName,
        toolDescription: catalogEntry.defaultDescription,
      },
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message ?? 'Error desconocido' };
  }
}

// ─── Toggle enabled ───────────────────────────────────────────────────────────

export async function toggleToolConfig(
  userId: string,
  toolKey: string,
  isEnabled: boolean,
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !toolKey) return { success: false, error: 'Parámetros inválidos' };

  try {
    await db.externalDataToolConfig.update({
      where: { userId_toolKey: { userId, toolKey } },
      data: { isEnabled },
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message ?? 'Error desconocido' };
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteToolConfig(
  userId: string,
  toolKey: string,
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !toolKey) return { success: false, error: 'Parámetros inválidos' };

  try {
    await db.externalDataToolConfig.delete({
      where: { userId_toolKey: { userId, toolKey } },
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message ?? 'Error desconocido' };
  }
}
