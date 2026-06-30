// Editor del Agente de CHAT (WhatsApp). Antes vivía en /ia; ahora /ia es el
// selector de dos tarjetas (Chat / Llamadas) y el editor de chat vive aquí.
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { MainAi } from '../../ai/_components/MainAi';
import { Workflow } from '@prisma/client';
import { getWorkFlowByUser } from '@/actions/workflow-actions';
import { getAgentPromptByUserAndAgentId, getOrCreatePrompt } from '@/actions/system-prompt-actions';
import { AGENT_PROMPT_IDS } from '@/lib/agent-prompt-ids';
import type { SectionsPromptSystem } from '@/types/agentAi';

function hasWorkflow(result: { data?: Workflow[] }): result is { data: Workflow[] } {
    return !!result.data;
}

const ChatAgentPage = async () => {
    const user = await currentUser();
    if (!user) redirect('/login');

    const resWorkflow = await getWorkFlowByUser(user.effectiveId);
    const workflows = hasWorkflow(resWorkflow) ? resWorkflow.data : [];

    const prompt = await getOrCreatePrompt({
        userId: user.effectiveId,
        agentId: AGENT_PROMPT_IDS.systemPromptAI,
    });
    const paymentReceiptPrompt = await getAgentPromptByUserAndAgentId({
        userId: user.effectiveId,
        agentId: AGENT_PROMPT_IDS.paymentReceiptAnalyzer,
    });

    const sections = prompt?.sections ?? {};

    return (
        <MainAi
            flows={workflows}
            user={user}
            promptMeta={{ id: prompt.id, version: prompt.version, businessName: prompt.businessName }}
            sections={sections as unknown as SectionsPromptSystem}
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

export default ChatAgentPage;
