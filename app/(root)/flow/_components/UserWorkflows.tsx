import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Bot, Brain, GitBranch, HomeIcon, InboxIcon } from 'lucide-react';

import { getWorkFlowByUser } from '@/actions/workflow-actions';
import { IntentTrigger, Workflow } from '@prisma/client';
import CreateWorflowDialog from './CreateWorflowDialog';
import { WorkflowListContent } from './WorkflowListContent';
import { leerRepeticionesDeLosFlujosAction } from '@/actions/repeticiones-de-flujo-actions';
import type { RepeticionesDeFlujo } from '@/lib/repeticiones-de-flujo';

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

    // Las repeticiones de cada flujo, en UNA consulta. Si fallan, la lista sale
    // igual (cada tarjeta con lo de siempre) y se dice: el diálogo las vuelve a
    // leer al abrirse, así que nunca se guarda sobre un dato equivocado.
    let repeticiones: Record<string, RepeticionesDeFlujo> = {};
    try {
        repeticiones = await leerRepeticionesDeLosFlujosAction(visibleWorkflows.map(w => w.id));
    } catch (error) {
        console.warn('[flujos] no se pudieron leer las repeticiones de la lista', error);
    }
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
                <WorkflowListContent
                    workflows={visibleWorkflows}
                    userId={userId}
                    isPro={isPro}
                    triggers={triggers}
                    repeticiones={repeticiones}
                    /* El resumen por tipo de flujo, que antes abría la pantalla
                       en tarjetas. Baja a la barra porque es ahí donde vive
                       ahora, y la barra la pinta el hijo. */
                    metricas={showSummary ? [
                        { clave: 'start', icono: <HomeIcon />, etiqueta: 'Inicio', valor: flowTypeCounts.start, color: '#F97316', ayuda: 'Flujos que se activan en la primera conexion' },
                        { clave: 'ai', icono: <Brain />, etiqueta: 'IA', valor: flowTypeCounts.ai, color: '#3B82F6', ayuda: 'Flujos que detectan intenciones mediante IA' },
                        { clave: 'flow', icono: <GitBranch />, etiqueta: 'Flujo', valor: flowTypeCounts.flow, color: '#8B5CF6', ayuda: 'Flujos manuales o encadenados' },
                        { clave: 'chatbot', icono: <Bot />, etiqueta: 'Chatbot', valor: flowTypeCounts.chatbot, color: '#10B981', ayuda: 'Flujos activados por palabras clave' },
                    ] : []}
                />
            )}
        </div>
    );
}
