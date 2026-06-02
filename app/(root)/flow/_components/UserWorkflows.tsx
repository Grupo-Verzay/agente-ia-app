import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Bot, Brain, GitBranch, HomeIcon, InboxIcon } from 'lucide-react';

import { getWorkFlowByUser } from '@/actions/workflow-actions';
import { IntentTrigger, Workflow } from '@prisma/client';
import CreateWorflowDialog from './CreateWorflowDialog';
import { MetricCard } from '@/components/custom/MetricCard';
import { WorkflowListContent } from './WorkflowListContent';

function hasWorkflow(result: { data?: Workflow[] }): result is { data: Workflow[] } {
    return !!result.data;
}

interface UserWorkflowsProps {
    userId: string;
    isPro: boolean;
    triggers?: IntentTrigger[];
    showSummary?: boolean;
}

export async function UserWorkflows({ userId, isPro, triggers = [], showSummary = false }: UserWorkflowsProps) {
    const resWorkflow = await getWorkFlowByUser(userId);

    if (!hasWorkflow(resWorkflow)) {
        return (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>Algo salio mal. Por favor intenta mas tarde.</AlertDescription>
            </Alert>
        );
    }

    const workflows = resWorkflow.data;
    const visibleWorkflows = workflows.filter(workflow => workflow.isPro === isPro);
    const flowTypeCounts = visibleWorkflows.reduce(
        (counts, workflow) => {
            if (workflow.triggerOnNewSession) {
                counts.start++;
            } else if (triggers.some(trigger => trigger.workflowId === workflow.id)) {
                counts.ai++;
            } else if (workflow.description?.trim()) {
                counts.chatbot++;
            } else {
                counts.flow++;
            }

            return counts;
        },
        { start: 0, ai: 0, flow: 0, chatbot: 0 }
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
            {showSummary && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                        icon={<HomeIcon className="h-4 w-4" />}
                        label="Inicio"
                        value={flowTypeCounts.start}
                        helper="Flujos que se activan en la primera conexion"
                        color="#F97316"
                    />
                    <MetricCard
                        icon={<Brain className="h-4 w-4" />}
                        label="IA"
                        value={flowTypeCounts.ai}
                        helper="Flujos que detectan intenciones mediante IA"
                        color="#3B82F6"
                    />
                    <MetricCard
                        icon={<GitBranch className="h-4 w-4" />}
                        label="Flujo"
                        value={flowTypeCounts.flow}
                        helper="Flujos manuales o encadenados"
                        color="#8B5CF6"
                    />
                    <MetricCard
                        icon={<Bot className="h-4 w-4" />}
                        label="Chatbot"
                        value={flowTypeCounts.chatbot}
                        helper="Flujos activados por palabras clave"
                        color="#10B981"
                    />
                </div>
            )}

            {visibleWorkflows.length === 0 ? (
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <div className="flex h-full flex-col items-center justify-center gap-4">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent">
                            <InboxIcon size={40} className="stroke-primary" />
                        </div>
                        <div className="flex flex-col gap-1 text-center">
                            <p className="font-bold">NO EXISTE NINGUN FLUJO</p>
                            <p className="text-sm text-muted-foreground">Click en boton para crear un nuevo flujo.</p>
                        </div>
                        <CreateWorflowDialog triggerText="CREA TU PRIMER FLUJO" isPro={isPro} />
                    </div>
                </div>
            ) : (
                <WorkflowListContent workflows={visibleWorkflows} userId={userId} isPro={isPro} triggers={triggers} />
            )}
        </div>
    );
}
