// app/(root)/profile/page.tsx
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { MainAi } from '../ai/_components/MainAi';
import { Workflow } from '@prisma/client';
import { getWorkFlowByUser } from '@/actions/workflow-actions';
import { getAgentPromptByUserAndAgentId, getOrCreatePrompt } from '@/actions/system-prompt-actions';
import { AGENT_PROMPT_IDS } from '@/lib/agent-prompt-ids';

function hasWorkflow(result: { data?: Workflow[] }): result is { data: Workflow[] } {
    return !!result.data;
}

const ProfilePage = async () => {
    const user = await currentUser();
    if (!user) redirect('/login');

    const resWorkflow = await getWorkFlowByUser(user.id);
    const workflows = hasWorkflow(resWorkflow) ? resWorkflow.data : [];

    const prompt = await getOrCreatePrompt({
        userId: user.id,
        agentId: AGENT_PROMPT_IDS.systemPromptAI,
    });
    const paymentReceiptPrompt = await getAgentPromptByUserAndAgentId({
        userId: user.id,
        agentId: AGENT_PROMPT_IDS.paymentReceiptAnalyzer,
    });

    // // 2) Secciones completas para hidratar tabs (especialmente Business)
    const sections = prompt?.sections ?? {};

    // 3) Pasa meta + sections a MainAi
    return (
        <MainAi
            flows={workflows}
            user={user}
            promptMeta={{ id: prompt.id, version: prompt.version }}
            sections={sections as any}
            paymentReceiptPrompt={paymentReceiptPrompt
                ? {
                    id: paymentReceiptPrompt.id,
                    version: paymentReceiptPrompt.version,
                    promptText: paymentReceiptPrompt.promptText,
                }
                : null}
        />
    );
};

export default ProfilePage;
