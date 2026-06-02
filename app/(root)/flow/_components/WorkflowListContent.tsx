'use client';

import { useMemo, useState } from 'react';
import { IntentTrigger, Workflow } from '@prisma/client';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import CreateWorflowDialog from './CreateWorflowDialog';
import { SortableWorkflowList } from './SortableWorkflowList';

interface WorkflowListContentProps {
    workflows: Workflow[];
    userId: string;
    isPro: boolean;
    triggers?: IntentTrigger[];
}

export const WorkflowListContent = ({ workflows, userId, isPro, triggers = [] }: WorkflowListContentProps) => {
    const [search, setSearch] = useState('');
    const filteredWorkflows = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return workflows;

        return workflows.filter(workflow =>
            `${workflow.name} ${workflow.description ?? ''}`.toLowerCase().includes(query)
        );
    }, [search, workflows]);

    return (
        <>
            <div className="flex shrink-0 flex-col gap-3 p-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-64 shrink-0">
                    <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar flujo..."
                        className="pl-8 text-sm"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
                <CreateWorflowDialog triggerText="+ Crear" isPro={isPro} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {filteredWorkflows.length === 0 ? (
                    <p className="mt-8 text-center text-sm text-muted-foreground">
                        No se encontraron flujos.
                    </p>
                ) : (
                    <SortableWorkflowList workflows={filteredWorkflows} userId={userId} triggers={triggers} />
                )}
            </div>
        </>
    );
};
