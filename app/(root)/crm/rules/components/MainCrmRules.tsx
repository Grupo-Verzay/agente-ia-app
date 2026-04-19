"use client";

import { CrmFollowUpRulesPanel } from "./CrmFollowUpRulesPanel";
import type { CrmFeatureFlags } from "@/types/crm-feature-flags";

export const MainCrmRules = ({
    userId,
    features,
}: {
    userId: string;
    features: CrmFeatureFlags;
}) => {
    return <CrmFollowUpRulesPanel userId={userId} features={features} />
};
