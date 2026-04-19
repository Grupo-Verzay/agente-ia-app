'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { db } from '@/lib/db';
import { Prisma, AiModel, AiProvider, UserAiConfig, User } from '@prisma/client';

/* ============================
   Tipos de respuesta y DTOs
============================ */
export type ResolvedAiClientDTO = {
  provider: string;
  model: string;
  apiKey: string;
};

export type ActionResult<T = undefined> = {
  success: boolean;
  message: string;
  data?: T;
};

export type ProviderWithModels = AiProvider & { models: AiModel[] };

export type UserAiConfigDTO = UserAiConfig & {
  provider: Pick<AiProvider, 'id' | 'name'>;
};

export type UserDefaultsDTO = {
  defaultProviderId: string | null;
  defaultAiModelId: string | null;
  defaultProvider?: Pick<AiProvider, 'id' | 'name'> | null;
  defaultModel?: Pick<AiModel, 'id' | 'name' | 'providerId'> | null;
};

export type UserAiSettingsDTO = {
  providers: ProviderWithModels[];
  configs: UserAiConfigDTO[];
  defaults: UserDefaultsDTO;
};

/* ============================
   Helpers
============================ */
async function ensureUser(userId: string): Promise<User> {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) throw new Error('user_not_found');
  return u;
}

async function ensureProvider(providerId: string): Promise<AiProvider> {
  const p = await db.aiProvider.findUnique({ where: { id: providerId } });
  if (!p) throw new Error('provider_not_found');
  return p;
}

async function ensureModel(modelId: string): Promise<AiModel> {
  const m = await db.aiModel.findUnique({ where: { id: modelId } });
  if (!m) throw new Error('model_not_found');
  return m;
}

function isUniqueError(e: any, fields?: string[]) {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === 'P2002' &&
    (!fields || fields.every((f) => String(e.meta?.target ?? '').includes(f)))
  );
}

/* ============================
   LECTURAS (para tu UI)
============================ */

/** Proveedores con sus modelos */
export async function listAiProvidersWithModels(): Promise<ActionResult<ProviderWithModels[]>> {
  noStore();
  const providers = await db.aiProvider.findMany({
    include: { models: true },
    orderBy: { name: 'asc' },
  });
  return { success: true, message: 'ok', data: providers };
}

/** Un proveedor por id (con modelos) */
export async function getAiProvider(id: string): Promise<ActionResult<ProviderWithModels>> {
  noStore();
  const prov = await db.aiProvider.findUnique({
    where: { id },
    include: { models: true },
  });
  if (!prov) return { success: false, message: 'provider_not_found' };
  return { success: true, message: 'ok', data: prov };
}

/** Modelos (opcional por providerId) */
export async function listAiModels(providerId?: string): Promise<ActionResult<AiModel[]>> {
  noStore();
  const where = providerId ? { providerId } : {};
  const models = await db.aiModel.findMany({
    where,
    orderBy: [{ providerId: 'asc' }, { name: 'asc' }],
  });
  return { success: true, message: 'ok', data: models };
}

/** Configs de usuario (apikeys por proveedor) */
export async function getUserAiConfigs(userId: string): Promise<ActionResult<UserAiConfigDTO[]>> {
  noStore();
  await ensureUser(userId);
  const configs = await db.userAiConfig.findMany({
    where: { userId },
    include: { provider: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return { success: true, message: 'ok', data: configs };
}

/** Defaults del usuario, expandidos */
export async function getUserAiDefaults(userId: string): Promise<ActionResult<UserDefaultsDTO>> {
  noStore();
  const u = await ensureUser(userId);

  const [provider, model] = await Promise.all([
    u.defaultProviderId
      ? db.aiProvider.findUnique({
        where: { id: u.defaultProviderId },
        select: { id: true, name: true },
      })
      : Promise.resolve(null),
    u.defaultAiModelId
      ? db.aiModel.findUnique({
        where: { id: u.defaultAiModelId },
        select: { id: true, name: true, providerId: true },
      })
      : Promise.resolve(null),
  ]);

  return {
    success: true,
    message: 'ok',
    data: {
      defaultProviderId: u.defaultProviderId ?? null,
      defaultAiModelId: u.defaultAiModelId ?? null,
      defaultProvider: provider,
      defaultModel: model,
    },
  };
}

/** Vista consolidada para UI (providers + configs + defaults) */
export async function getUserAiSettings(userId: string): Promise<ActionResult<UserAiSettingsDTO>> {
  noStore();
  await ensureUser(userId);
  const [providersRes, configsRes, defaultsRes] = await Promise.all([
    listAiProvidersWithModels(),
    getUserAiConfigs(userId),
    getUserAiDefaults(userId),
  ]);
  if (!providersRes.success) return providersRes as any;
  if (!configsRes.success) return configsRes as any;
  if (!defaultsRes.success) return defaultsRes as any;
  return {
    success: true,
    message: 'ok',
    data: {
      providers: providersRes.data!,
      configs: configsRes.data!,
      defaults: defaultsRes.data!,
    },
  };
}

/* ============================
   CRUD — AiProvider
============================ */

export async function createAiProvider(input: {
  name: string;
  description?: string | null;
  aiModel?: string | null; // campo extra en tu schema
}): Promise<ActionResult<AiProvider>> {
  try {
    const created = await db.aiProvider.create({
      data: {
        name: input.name.trim(),
        description: input.description ?? null,
        aiModel: input.aiModel ?? '',
      },
    });
    return { success: true, message: 'provider_created', data: created };
  } catch (e) {
    if (isUniqueError(e, ['name'])) {
      return { success: false, message: 'provider_name_already_exists' };
    }
    return { success: false, message: 'provider_create_error' };
  }
}

export async function updateAiProvider(
  id: string,
  input: { name?: string; description?: string | null; aiModel?: string | null }
): Promise<ActionResult<AiProvider>> {
  try {
    const updated = await db.aiProvider.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        description: input.description ?? undefined,
        aiModel: input.aiModel ?? undefined,
      },
    });
    return { success: true, message: 'provider_updated', data: updated };
  } catch (e) {
    if (isUniqueError(e, ['name'])) {
      return { success: false, message: 'provider_name_already_exists' };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return { success: false, message: 'provider_not_found' };
    }
    return { success: false, message: 'provider_update_error' };
  }
}

/** Borra provider y deja consistente: limpia defaults, elimina configs y modelos relacionados */
export async function deleteAiProvider(id: string): Promise<ActionResult> {
  try {
    await db.$transaction(async (tx) => {
      // 1) Limpiar defaults de usuarios que apuntan a este provider
      await tx.user.updateMany({
        where: { defaultProviderId: id },
        data: { defaultProviderId: null, defaultAiModelId: null },
      });

      // 2) Eliminar configs de usuario para este provider
      await tx.userAiConfig.deleteMany({ where: { providerId: id } });

      // 3) Eliminar modelos del provider
      await tx.aiModel.deleteMany({ where: { providerId: id } });

      // 4) Finalmente, eliminar el provider
      await tx.aiProvider.delete({ where: { id } });
    });

    return { success: true, message: 'provider_deleted' };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return { success: false, message: 'provider_not_found' };
    }
    return { success: false, message: 'provider_delete_error' };
  }
}

/* ============================
   CRUD — AiModel
============================ */

export async function createAiModel(input: {
  providerId: string;
  name: string;
  description?: string | null;
  costPerToken?: number | null;
  modelName?: string | null; // alias/técnico
}): Promise<ActionResult<AiModel>> {
  try {
    await ensureProvider(input.providerId);
    const created = await db.aiModel.create({
      data: {
        providerId: input.providerId,
        name: input.name.trim(),
        description: input.description ?? null,
        costPerToken: input.costPerToken ?? null,
        modelName: input.modelName ?? null,
      },
    });
    return { success: true, message: 'model_created', data: created };
  } catch (e) {
    if (isUniqueError(e, ['providerId', 'name'])) {
      return { success: false, message: 'model_name_already_exists_for_provider' };
    }
    return { success: false, message: 'model_create_error' };
  }
}

/** Nota: no permitimos cambiar providerId aquí (simplifica unicidad). */
export async function updateAiModel(
  id: string,
  input: { name?: string; description?: string | null; costPerToken?: number | null; modelName?: string | null }
): Promise<ActionResult<AiModel>> {
  try {
    const existing = await ensureModel(id);
    const updated = await db.aiModel.update({
      where: { id },
      data: {
        name: input.name?.trim() ?? undefined,
        description: input.description ?? undefined,
        costPerToken: input.costPerToken ?? undefined,
        modelName: input.modelName ?? undefined,
      },
    });

    // chequeo opcional de unicidad si cambió el nombre
    if (input.name && input.name.trim() !== existing.name) {
      const dup = await db.aiModel.findFirst({
        where: { providerId: existing.providerId, name: input.name.trim(), NOT: { id } },
      });
      if (dup) {
        return { success: false, message: 'model_name_already_exists_for_provider' };
      }
    }

    return { success: true, message: 'model_updated', data: updated };
  } catch (e) {
    if (isUniqueError(e, ['providerId', 'name'])) {
      return { success: false, message: 'model_name_already_exists_for_provider' };
    }
    if (e instanceof Error && e.message === 'model_not_found') {
      return { success: false, message: 'model_not_found' };
    }
    return { success: false, message: 'model_update_error' };
  }
}

/** Eliminar modelo: limpia defaultAiModelId en usuarios que lo tengan */
export async function deleteAiModel(id: string): Promise<ActionResult> {
  try {
    await db.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { defaultAiModelId: id },
        data: { defaultAiModelId: null },
      });
      await tx.aiModel.delete({ where: { id } });
    });
    return { success: true, message: 'model_deleted' };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return { success: false, message: 'model_not_found' };
    }
    return { success: false, message: 'model_delete_error' };
  }
}

/* ============================
   USER CONFIG — API KEY por proveedor
============================ */

export type UpsertUserAiConfigInput = {
  userId: string;
  providerId: string;
  apiKey: string;
  isActive?: boolean;            // default true
  makeDefaultProvider?: boolean; // opcional: fija defaultProviderId y limpia model si no coincide
};

export async function upsertUserAiConfig(input: UpsertUserAiConfigInput): Promise<ActionResult<UserAiConfigDTO>> {
  const { userId, providerId, apiKey, isActive = true, makeDefaultProvider } = input;

  try {
    await ensureUser(userId);
    await ensureProvider(providerId);

    const cfg = await db.userAiConfig.upsert({
      where: { userId_providerId: { userId, providerId } },
      update: { apiKey, isActive },
      create: { userId, providerId, apiKey, isActive },
      include: { provider: { select: { id: true, name: true } } },
    });

    if (makeDefaultProvider) {
      await db.user.update({
        where: { id: userId },
        data: { defaultProviderId: providerId },
      });

      // si el defaultModel actual no pertenece a este provider, limpiar
      const u = await db.user.findUnique({ where: { id: userId } });
      if (u?.defaultAiModelId) {
        const m = await db.aiModel.findUnique({ where: { id: u.defaultAiModelId } });
        if (m && m.providerId !== providerId) {
          await db.user.update({ where: { id: userId }, data: { defaultAiModelId: null } });
        }
      }
    }

    return { success: true, message: 'user_config_upsert_ok', data: cfg };
  } catch (e) {
    if (isUniqueError(e, ['userId', 'providerId'])) {
      // No debería pasar con upsert, pero por si acaso
      return { success: false, message: 'user_config_unique_violation' };
    }
    if (e instanceof Error && ['user_not_found', 'provider_not_found'].includes(e.message)) {
      return { success: false, message: e.message };
    }
    return { success: false, message: 'user_config_upsert_error' };
  }
}

export async function updateUserAiConfig(input: {
  userId: string;
  providerId: string;
  apiKey?: string;
  isActive?: boolean;
}): Promise<ActionResult<UserAiConfigDTO>> {
  const { userId, providerId, apiKey, isActive } = input;

  try {
    await ensureUser(userId);
    await ensureProvider(providerId);

    const exists = await db.userAiConfig.findUnique({
      where: { userId_providerId: { userId, providerId } },
    });
    if (!exists) return { success: false, message: 'user_config_not_found' };

    const cfg = await db.userAiConfig.update({
      where: { userId_providerId: { userId, providerId } },
      data: {
        apiKey: apiKey ?? exists.apiKey,
        isActive: typeof isActive === 'boolean' ? isActive : exists.isActive,
      },
      include: { provider: { select: { id: true, name: true } } },
    });

    return { success: true, message: 'user_config_update_ok', data: cfg };
  } catch {
    return { success: false, message: 'user_config_update_error' };
  }
}

export async function toggleUserAiConfigActive(
  userId: string,
  providerId: string,
  next: boolean
): Promise<ActionResult<UserAiConfigDTO>> {
  try {
    await ensureUser(userId);
    await ensureProvider(providerId);

    const cfg = await db.userAiConfig.update({
      where: { userId_providerId: { userId, providerId } },
      data: { isActive: next },
      include: { provider: { select: { id: true, name: true } } },
    });

    return { success: true, message: 'user_config_toggle_ok', data: cfg };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return { success: false, message: 'user_config_not_found' };
    }
    return { success: false, message: 'user_config_toggle_error' };
  }
}

export async function deleteUserAiConfig(userId: string, providerId: string): Promise<ActionResult> {
  try {
    await db.$transaction(async (tx) => {
      // Si el defaultProviderId del usuario es este, limpiarlo (y el modelo por seguridad)
      const u = await tx.user.findUnique({ where: { id: userId } });
      if (u?.defaultProviderId === providerId) {
        await tx.user.update({
          where: { id: userId },
          data: { defaultProviderId: null, defaultAiModelId: null },
        });
      }
      await tx.userAiConfig.delete({ where: { userId_providerId: { userId, providerId } } });
    });

    return { success: true, message: 'user_config_deleted' };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return { success: false, message: 'user_config_not_found' };
    }
    return { success: false, message: 'user_config_delete_error' };
  }
}

/* ============================
   DEFAULTS del usuario
============================ */

export async function setUserDefaults(input: {
  userId: string;
  providerId?: string | null;
  modelId?: string | null;
}): Promise<ActionResult<UserDefaultsDTO>> {
  let { userId, providerId, modelId } = input;

  try {
    await ensureUser(userId);

    // Si pasa un modelId, deducir providerId de ese modelo
    if (modelId) {
      const m = await ensureModel(modelId);
      providerId = m.providerId;
    }

    if (providerId) await ensureProvider(providerId);

    // Coherencia: si hay provider y el modelo no pertenece, anular modelId
    if (providerId && modelId) {
      const m = await ensureModel(modelId);
      if (m.providerId !== providerId) modelId = null;
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: {
        defaultProviderId: providerId ?? null,
        defaultAiModelId: modelId ?? null,
      },
    });

    const [prov, mod] = await Promise.all([
      updated.defaultProviderId
        ? db.aiProvider.findUnique({
          where: { id: updated.defaultProviderId },
          select: { id: true, name: true },
        })
        : Promise.resolve(null),
      updated.defaultAiModelId
        ? db.aiModel.findUnique({
          where: { id: updated.defaultAiModelId },
          select: { id: true, name: true, providerId: true },
        })
        : Promise.resolve(null),
    ]);

    return {
      success: true,
      message: 'defaults_ok',
      data: {
        defaultProviderId: updated.defaultProviderId,
        defaultAiModelId: updated.defaultAiModelId,
        defaultProvider: prov,
        defaultModel: mod,
      },
    };
  } catch (e) {
    if (
      e instanceof Error &&
      ['user_not_found', 'provider_not_found', 'model_not_found'].includes(e.message)
    ) {
      return { success: false, message: e.message };
    }
    return { success: false, message: 'defaults_set_error' };
  }
}

/**
 * Configura automáticamente la API key de OpenAI para un usuario recién creado.
 * Busca el provider "openai", hace upsert de UserAiConfig y establece defaults.
 */
export async function autoConfigureUserAi(
  userId: string,
  apiKey: string
): Promise<ActionResult> {
  if (!apiKey) return { success: false, message: 'api_key_required' };

  try {
    await ensureUser(userId);

    const openaiProvider = await db.aiProvider.findFirst({
      where: { name: 'openai' },
      include: { models: { orderBy: { name: 'asc' }, take: 1 } },
    });

    if (!openaiProvider) return { success: false, message: 'openai_provider_not_found' };

    await db.userAiConfig.upsert({
      where: { userId_providerId: { userId, providerId: openaiProvider.id } },
      update: { apiKey, isActive: true },
      create: { userId, providerId: openaiProvider.id, apiKey, isActive: true },
    });

    await db.user.update({
      where: { id: userId },
      data: {
        defaultProviderId: openaiProvider.id,
        defaultAiModelId: openaiProvider.models[0]?.id ?? null,
      },
    });

    return { success: true, message: 'ai_configured' };
  } catch {
    return { success: false, message: 'ai_configure_error' };
  }
}

export async function resolveUserAiClient(userId: string): Promise<ActionResult<ResolvedAiClientDTO>> {
  noStore();
  try {
    const u = await ensureUser(userId);

    if (!u.defaultProviderId || !u.defaultAiModelId) {
      return { success: false, message: "user_missing_defaults" };
    }

    const cfg = await db.userAiConfig.findFirst({
      where: { userId, isActive: true, providerId: u.defaultProviderId },
      select: { apiKey: true },
    });

    if (!cfg?.apiKey) return { success: false, message: "user_missing_active_apikey" };

    const provider = await db.aiProvider.findUnique({
      where: { id: u.defaultProviderId },
      select: { name: true },
    });

    const model = await db.aiModel.findUnique({
      where: { id: u.defaultAiModelId },
      select: { name: true },
    });

    if (!provider?.name || !model?.name) {
      return { success: false, message: "provider_or_model_invalid" };
    }

    return {
      success: true,
      message: "ok",
      data: { provider: provider.name, model: model.name, apiKey: cfg.apiKey },
    };
  } catch (e) {
    return { success: false, message: "resolve_ai_client_error" };
  }
}