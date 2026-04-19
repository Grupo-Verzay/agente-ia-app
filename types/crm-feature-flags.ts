export type CrmFeatureKey = "leadFunnel" | "leadStatus" | "crmFollowUps";

export type CrmFeatureFlags = {
  enabledSynthesizer: boolean;
  enabledLeadStatusClassifier: boolean;
  enabledCrmFollowUps: boolean;
};

export function isCrmFeatureEnabled(
  flags: CrmFeatureFlags,
  feature: CrmFeatureKey
) {
  if (feature === "leadFunnel") return flags.enabledSynthesizer;
  if (feature === "leadStatus") return flags.enabledLeadStatusClassifier;
  return flags.enabledCrmFollowUps;
}

export function getCrmFeatureDisabledMessage(feature: CrmFeatureKey) {
  if (feature === "leadFunnel") {
    return "El sintetizador CRM no esta habilitado para este usuario.";
  }

  if (feature === "leadStatus") {
    return "La clasificacion de lead no esta habilitada para este usuario.";
  }

  return "Los follow-ups inteligentes no estan habilitados para este usuario.";
}
