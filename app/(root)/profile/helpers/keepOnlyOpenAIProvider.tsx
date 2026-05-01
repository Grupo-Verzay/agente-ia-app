import type { UserAiSettingsDTO } from "@/actions/userAiconfig-actions";

/** Filtra a los proveedores soportados en la UI: openai y google */
const SUPPORTED_PROVIDERS = ["openai", "google"];

export function keepSupportedProviders(data: UserAiSettingsDTO): UserAiSettingsDTO {
    const providers = data.providers.filter((p) =>
        SUPPORTED_PROVIDERS.includes(p.name.toLowerCase())
    );

    if (providers.length === 0) {
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

    const providerIds = new Set(providers.map((p) => p.id));
    const configs = data.configs.filter((c) => providerIds.has(c.providerId));

    // Mantener defaults si son válidos dentro de los providers soportados
    const defaultProvider = providers.find(
        (p) => p.id === data.defaults.defaultProviderId
    ) ?? providers[0];

    const defaultModel =
        defaultProvider.models.find((m) => m.id === data.defaults.defaultAiModelId) ??
        defaultProvider.models[0] ??
        null;

    return {
        providers,
        configs,
        defaults: {
            defaultProviderId: defaultProvider.id,
            defaultAiModelId: defaultModel?.id ?? null,
            defaultProvider: { id: defaultProvider.id, name: defaultProvider.name },
            defaultModel: defaultModel
                ? { id: defaultModel.id, name: defaultModel.name, providerId: defaultModel.providerId }
                : null,
        },
    };
}

/** @deprecated use keepSupportedProviders */
export const keepOnlyOpenAIProvider = keepSupportedProviders;
