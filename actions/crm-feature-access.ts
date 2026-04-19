"use server";

import { assertUserCanUseApp } from "@/actions/billing/helpers/app-access-guard";
import { db } from "@/lib/db";
import {
  type CrmFeatureFlags,
  type CrmFeatureKey,
  getCrmFeatureDisabledMessage,
  isCrmFeatureEnabled,
} from "@/types/crm-feature-flags";

const CRM_FEATURE_FLAGS_SELECT = {
  enabledSynthesizer: true,
  enabledLeadStatusClassifier: true,
  enabledCrmFollowUps: true,
} as const;

export async function getAuthorizedCrmFeatureFlags(
  userId: string
): Promise<CrmFeatureFlags> {
  await assertUserCanUseApp(userId);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: CRM_FEATURE_FLAGS_SELECT,
  });

  if (!user) {
    throw new Error("Usuario no encontrado.");
  }

  return {
    enabledSynthesizer: user.enabledSynthesizer ?? false,
    enabledLeadStatusClassifier: user.enabledLeadStatusClassifier ?? false,
    enabledCrmFollowUps: user.enabledCrmFollowUps ?? false,
  };
}

export async function assertAuthorizedCrmFeatureEnabled(
  userId: string,
  feature: CrmFeatureKey
) {
  const flags = await getAuthorizedCrmFeatureFlags(userId);

  if (!isCrmFeatureEnabled(flags, feature)) {
    throw new Error(getCrmFeatureDisabledMessage(feature));
  }

  return flags;
}
