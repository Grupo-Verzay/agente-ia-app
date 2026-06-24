import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { SystemMessage } from '@prisma/client';
import { getPromptAiByUserId } from '@/actions/ai-actions';
import { getActivePaymentMethodConfigs } from '@/actions/payment-method-config-actions';
import { getAgentPromptByUserAndAgentId } from '@/actions/system-prompt-actions';
import { AGENT_PROMPT_IDS } from '@/lib/agent-prompt-ids';
import { MessagesSkeleton } from './_components/OldPromptAi';
import { MainAi } from './_components/OldPromptAi/MainAi';

interface PageProps {
    params: { id?: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

function hasAiPrompt(result: { data?: unknown }): result is { data: SystemMessage[] } {
  return Array.isArray(result.data);
}

const AiPage = async ({ params, searchParams }: PageProps) => {
    const user = await currentUser();

    if (!user) {
        redirect('/login');
    };

    const effectiveId = user.effectiveId;

    const resPromptAi = await getPromptAiByUserId(effectiveId);
    const promptAi = Array.isArray(resPromptAi.data) ? resPromptAi.data : [];
    const [paymentReceiptPrompt, paymentMethodsRes] = await Promise.all([
        getAgentPromptByUserAndAgentId({
            userId: effectiveId,
            agentId: AGENT_PROMPT_IDS.paymentReceiptAnalyzer,
        }),
        getActivePaymentMethodConfigs(),
    ]);

    return (
        <Suspense fallback={<MessagesSkeleton />}>
            <MainAi
                promptAi={promptAi}
                userId={effectiveId}
                paymentReceiptPrompt={paymentReceiptPrompt
                    ? {
                        id: paymentReceiptPrompt.id,
                        version: paymentReceiptPrompt.version,
                        promptText: paymentReceiptPrompt.promptText,
                    }
                    : null}
                paymentMethods={paymentMethodsRes.data}
            />
        </Suspense>
    );
};

export default AiPage;
