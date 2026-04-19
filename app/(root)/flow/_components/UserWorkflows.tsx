import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, InboxIcon } from 'lucide-react';

import { getWorkFlowByUser } from '@/actions/workflow-actions';
import { Workflow } from '@prisma/client';
import CreateWorflowDialog from './CreateWorflowDialog';
import { WorkflowCard, SortableWorkflowList } from '.';

function hasWorkflow(result: { data?: Workflow[] }): result is { data: Workflow[] } {
    return !!result.data;
};

interface UserWorkflowsProps {
    userId: string;
    isPro: boolean;
};

export async function UserWorkflows({ userId, isPro }: UserWorkflowsProps) {
    const resWorkflow = await getWorkFlowByUser(userId);
    const workflows = hasWorkflow(resWorkflow) ? resWorkflow.data : [];
    const basicWorkflows = workflows.filter(w => w.isPro === false);
    const proWorkflows = workflows.filter(w => w.isPro === true);
    const wichKindWorkflow = isPro ? proWorkflows : basicWorkflows;

    if (!wichKindWorkflow) {
        return (
            <Alert variant={'destructive'}>
                <AlertCircle className='w-4 h-4' />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>Algo salió mal. Por favor intenta más tarde</AlertDescription>
            </Alert>
        );
    }

    if (wichKindWorkflow.length === 0) {
        return (
            <div className="flex flex-col gap-4 h-full items-center justify-center">
                <div className='rounded-full bg-accent w-20 h-20 flex items-center justify-center'>
                    <InboxIcon size={40} className='stroke-primary' />
                </div>
                <div className='flex flex-col gap-1 text-center'>
                    <p className="font-bold">NO EXISTE NINGUN FLUJO</p>
                    <p className="text-sm text-muted-foreground">Click en botón para crear un nuevo Flujo</p>
                </div>
                <CreateWorflowDialog triggerText="CREA TU PRIMER FLUJO" isPro={isPro} />
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto">
            <SortableWorkflowList workflows={wichKindWorkflow} userId={userId} />
        </div>
    );
}