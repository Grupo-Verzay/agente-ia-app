// app/(dashboard)/crm/dashboard/page.tsx
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MainCrmRules } from "./components";

const CrmRulesPage = async () => {
    const user = await currentUser();
    if (!user) redirect("/login");

    return (
        <MainCrmRules
            userId={user.id}
            features={{
                enabledSynthesizer: user.enabledSynthesizer ?? false,
                enabledLeadStatusClassifier: user.enabledLeadStatusClassifier ?? false,
                enabledCrmFollowUps: user.enabledCrmFollowUps ?? false,
            }}
        />
    );
};

export default CrmRulesPage;
