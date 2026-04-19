import type { UserAiSettingsDTO } from "@/actions/userAiconfig-actions";

/**
 * Mantiene SOLO el provider cuyo name sea "openai"
 * - Filtra providers
 * - Filtra configs asociadas
 * - Ajusta defaults a openai y un modelo válido
 */
export function keepOnlyOpenAIProvider(data: UserAiSettingsDTO): UserAiSettingsDTO {
    const openaiProvider = data.providers.find((p) => p.name === "openai");

    // Si no existe openai, devuelve estructura válida vacía
    if (!openaiProvider) {
        return {
            providers: [],
            configs: [],
            defaults: {
                defaultProviderId: null,
                defaultAiModelId: null,
                defaultProvider: null,
                defaultModel: null,
            },
        };
    }

    const providers: UserAiSettingsDTO["providers"] = [openaiProvider];

    const configs: UserAiSettingsDTO["configs"] = data.configs.filter(
        (c) => c.providerId === openaiProvider.id
    );

    // Asegurar que el default model sea válido dentro de openai
    const modelFromDefaults = openaiProvider.models.find(
        (m) => m.id === data.defaults.defaultAiModelId
    );

    const fallbackModel = openaiProvider.models[0] ?? null;
    const selectedModel = modelFromDefaults ?? fallbackModel;

    const defaults: UserAiSettingsDTO["defaults"] = {
        defaultProviderId: openaiProvider.id,
        defaultAiModelId: selectedModel?.id ?? null,
        defaultProvider: { id: openaiProvider.id, name: openaiProvider.name },
        defaultModel: selectedModel
            ? { id: selectedModel.id, name: selectedModel.name, providerId: selectedModel.providerId }
            : null,
    };

    return {
        providers,
        configs,
        defaults,
    };
}