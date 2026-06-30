// Editor del PROMPT del Agente de Llamadas (voz). Separado del agente de chat:
// aquí defines, claro y corto, cómo debe comportarse el bot EN LLAMADAS.
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { CallAgentEditor } from './_components/CallAgentEditor';

export const dynamic = 'force-dynamic';

const CallAgentPromptPage = async () => {
    const user = await currentUser();
    if (!user) redirect('/login');
    return <CallAgentEditor />;
};

export default CallAgentPromptPage;
