// Editor de entrenamiento del canal seleccionado (tab). Canales de chat usan el
// editor completo (MainAi) sobre el AgentPrompt del canal; 'llamadas' usa el
// editor de voz. Si el canal no tiene entrenamiento propio, se crea como copia
// del de WhatsApp QR (base).
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Workflow } from '@prisma/client';
import { MainAi } from '../../ai/_components/MainAi';
import { CallAgentEditor } from '../_components/CallAgentEditor';
import { GuionVideollamadaEditor } from '../_components/GuionVideollamadaEditor';
import { elGuionQueSeUsa } from '@/lib/guion-videollamada';
import { leerElGuionDeVideollamada } from '@/lib/guion-videollamada-db';
import { canManageWorkspace } from '@/lib/workspace-roles';
import { getWorkFlowByUser } from '@/actions/workflow-actions';
import {
    getOrCreateChannelPrompt,
    getAgentPromptByUserAndAgentId,
} from '@/actions/system-prompt-actions';
import { AGENT_PROMPT_IDS } from '@/lib/agent-prompt-ids';
import { getTrainingChannel, DEFAULT_TRAINING_CHANNEL, isChannelEnabled } from '@/lib/channel-training';
import { getUserChannelFlags } from '@/lib/channel-access';
import { ChannelLockedNotice } from '../_components/ChannelLockedNotice';
import type { SectionsPromptSystem } from '@/types/agentAi';
import { leerAjustesDeCotizacion } from '@/lib/cotizacion-ia-db';
import { AJUSTES_POR_DEFECTO } from '@/lib/cotizacion-ia';

export const dynamic = 'force-dynamic';

function hasWorkflow(result: { data?: Workflow[] }): result is { data: Workflow[] } {
    return !!result.data;
}

export default async function ChannelTrainingPage({ params }: { params: { channel: string } }) {
    const user = await currentUser();
    if (!user) redirect('/login');

    const channel = getTrainingChannel(params.channel);
    if (!channel) redirect(`/ia/${DEFAULT_TRAINING_CHANNEL}`);

    // Canal no habilitado para la cuenta → aviso (no crea entrenamiento fantasma).
    const channelFlags = await getUserChannelFlags(user.effectiveId);
    if (!isChannelEnabled(channel, channelFlags)) {
        return <ChannelLockedNotice label={channel.label} />;
    }

    // Canal de voz → editor del prompt de llamadas.
    if (channel.kind === 'voice') {
        return <CallAgentEditor />;
    }

    // Videollamadas → el guion de Verzy de esta cuenta. Que no se pueda leer
    // no deja la pantalla sin abrir: sale el de fábrica, y se dice.
    if (channel.kind === 'video') {
        const guardado = await leerElGuionDeVideollamada(user.effectiveId).catch((error) => {
            console.error('[guion-videollamada] no se pudo leer al abrir la pantalla', String(error));
            return null;
        });
        return (
            <GuionVideollamadaEditor
                cuentaId={user.effectiveId}
                guionInicial={elGuionQueSeUsa(guardado)}
                puedeEditar={canManageWorkspace(user)}
            />
        );
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
    // Que no se puedan leer no deja la pantalla sin abrir: sale apagada, que
    // es como nace toda cuenta. Mudo no.
    const cotizaciones = await leerAjustesDeCotizacion(user.effectiveId).catch((error) => {
        console.error('[cotizacion-ia] no se pudieron leer los ajustes al abrir el entrenamiento', String(error));
        return AJUSTES_POR_DEFECTO;
    });

    return (
        <MainAi
            flows={workflows}
            user={user}
            promptMeta={{ id: prompt.id, version: prompt.version, businessName: prompt.businessName }}
            sections={sections as unknown as SectionsPromptSystem}
            cotizaciones={cotizaciones}
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
