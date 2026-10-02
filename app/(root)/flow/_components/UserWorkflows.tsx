import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, InboxIcon } from 'lucide-react';

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
                <AlertDescription>Algo salió mal. Por favor intenta más tarde.</AlertDescription>
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

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
            {visibleWorkflows.length === 0 ? (
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <div className="flex h-full flex-col items-center justify-center gap-4">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent">
                            <InboxIcon size={40} className="stroke-primary" />
                        </div>
                        <div className="flex flex-col gap-1 text-center">
                            <p className="font-bold">Todavía no tienes flujos</p>
                            <p className="text-sm text-muted-foreground">Pulsa el botón para crear el primero.</p>
                        </div>
                        <CreateWorflowDialog triggerText="Crear mi primer flujo" isPro={isPro} />
                    </div>
                </div>
            ) : (
                <WorkflowListContent
                    workflows={visibleWorkflows}
                    userId={userId}
                    isPro={isPro}
                    triggers={triggers}
                    repeticiones={repeticiones}
                    /* Las pastillas de tipo, que filtran la lista: las arma la
                       barra, que es quien sabe qué tipo está puesto. */
                    conPastillas={showSummary}
                />
            )}
        </div>
    );
}
