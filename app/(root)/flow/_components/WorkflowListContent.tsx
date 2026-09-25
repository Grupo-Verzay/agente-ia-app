'use client';

import { useMemo, useState } from 'react';
import { IntentTrigger, Workflow } from '@prisma/client';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ModuleToolbar } from '@/components/shared/ModuleToolbar';
import { PastillasDeMetricas, type Metrica } from '@/components/shared/PastillasDeMetricas';
import CreateWorflowDialog from './CreateWorflowDialog';
import FollowUpWindowDialog from './FollowUpWindowDialog';
import type { RepeticionesDeFlujo } from '@/lib/repeticiones-de-flujo';
import { SortableWorkflowList } from './SortableWorkflowList';

interface WorkflowListContentProps {
    workflows: Workflow[];
    userId: string;
    isPro: boolean;
    triggers?: IntentTrigger[];
    repeticiones?: Record<string, RepeticionesDeFlujo>;
    /** Las cifras del resumen, que se pintan en la barra. */
    metricas?: Metrica[];
}

export const WorkflowListContent = ({ workflows, userId, isPro, triggers = [], metricas = [], repeticiones = {} }: WorkflowListContentProps) => {
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
            <ModuleToolbar
              buscador={
                <div className="relative w-56 sm:w-72">
                    <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar flujo..."
                        className="pl-8 text-sm"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
              }
              className="shrink-0"
              secundarias={
                  /* La ventana de seguimiento no crea ningún flujo: es una
                     acción secundaria, así que va pegada al azul y no dentro
                     de él. */
                  <FollowUpWindowDialog />
              }
              right={<CreateWorflowDialog triggerText="Crear flujo" isPro={isPro} />}
            >
                {/* Sin filtro por tipo de flujo en esta lista: no son pulsables. */}
                <PastillasDeMetricas metricas={metricas} />
            </ModuleToolbar>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {filteredWorkflows.length === 0 ? (
                    <p className="mt-8 text-center text-sm text-muted-foreground">
                        No se encontraron flujos.
                    </p>
                ) : (
                    <SortableWorkflowList workflows={filteredWorkflows} userId={userId} triggers={triggers} repeticiones={repeticiones} />
                )}
            </div>
        </>
    );
};
