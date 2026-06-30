// Editor de entrenamiento del canal seleccionado (tab). Canales de chat usan el
// editor completo (MainAi) sobre el AgentPrompt del canal; 'llamadas' usa el
// editor de voz. Si el canal no tiene entrenamiento propio, se crea como copia
// del de WhatsApp QR (base).
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Workflow } from '@prisma/client';
import { MainAi } from '../../ai/_components/MainAi';
import { CallAgentEditor } from '../_components/CallAgentEditor';
import { getWorkFlowByUser } from '@/actions/workflow-actions';
import {
    getOrCreateChannelPrompt,
    getAgentPromptByUserAndAgentId,
} from '@/actions/system-prompt-actions';
import { AGENT_PROMPT_IDS } from '@/lib/agent-prompt-ids';
import { getTrainingChannel, DEFAULT_TRAINING_CHANNEL } from '@/lib/channel-training';
import type { SectionsPromptSystem } from '@/types/agentAi';

export const dynamic = 'force-dynamic';

function hasWorkflow(result: { data?: Workflow[] }): result is { data: Workflow[] } {
    return !!result.data;
}

export default async function ChannelTrainingPage({ params }: { params: { channel: string } }) {
    const user = await currentUser();
    if (!user) redirect('/login');

    const channel = getTrainingChannel(params.channel);
    if (!channel) redirect(`/ia/${DEFAULT_TRAINING_CHANNEL}`);

    // Canal de voz → editor del prompt de llamadas.
    if (channel.kind === 'voice') {
        return <CallAgentEditor />;
    }

    // Canal de chat → editor completo sobre el AgentPrompt del canal.
    const resWorkflow = await getWorkFlowByUser(user.effectiveId);
    const workflows = hasWorkflow(resWorkflow) ? resWorkflow.data : [];

    const prompt = await getOrCreateChannelPrompt({
        userId: user.effectiveId,
        agentId: channel.agentId!,
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
}
