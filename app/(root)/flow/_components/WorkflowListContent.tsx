'use client';

import { useMemo, useState } from 'react';
import { IntentTrigger, Workflow } from '@prisma/client';
import { Bot, Brain, GitBranch, HomeIcon, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ModuleToolbar } from '@/components/shared/ModuleToolbar';
import { PastillasDeMetricas, type Metrica } from '@/components/shared/PastillasDeMetricas';
import CreateWorflowDialog from './CreateWorflowDialog';
import FollowUpWindowDialog from './FollowUpWindowDialog';
import type { RepeticionesDeFlujo } from '@/lib/repeticiones-de-flujo';
import {
    TIPOS_DE_FLUJO,
    alPulsarUnTipo,
    losConteosPorTipo,
    pasaElFiltro,
    porQueNoSePuedeOrdenar,
    type TipoDeFlujo,
} from '@/lib/flujos-de-la-lista';
import { SortableWorkflowList } from './SortableWorkflowList';

interface WorkflowListContentProps {
    workflows: Workflow[];
    userId: string;
    isPro: boolean;
    triggers?: IntentTrigger[];
    repeticiones?: Record<string, RepeticionesDeFlujo>;
    /** Si la barra lleva las cuatro pastillas de tipo (que filtran la lista). */
    conPastillas?: boolean;
}

const ICONO_DEL_TIPO: Record<TipoDeFlujo, JSX.Element> = {
    inicio: <HomeIcon />,
    ia: <Brain />,
    flujo: <GitBranch />,
    chatbot: <Bot />,
};

export const WorkflowListContent = ({ workflows, userId, isPro, triggers = [], conPastillas = false, repeticiones = {} }: WorkflowListContentProps) => {
    const [search, setSearch] = useState('');
    const [tipo, setTipo] = useState<TipoDeFlujo | null>(null);

    const conDisparadorDeIa = useMemo(() => new Set(triggers.map(t => t.workflowId)), [triggers]);
    const conteos = useMemo(() => losConteosPorTipo(workflows, conDisparadorDeIa), [workflows, conDisparadorDeIa]);

    const filteredWorkflows = useMemo(
        () => workflows.filter(workflow => pasaElFiltro(workflow, search, tipo, conDisparadorDeIa)),
        [search, tipo, workflows, conDisparadorDeIa],
    );

    // Las pastillas SON el filtro por tipo: pulsarla deja solo ese tipo, y
    // pulsarla otra vez lo quita. Una cifra que no filtra nada no se pinta.
    const metricas: Metrica[] = conPastillas
        ? TIPOS_DE_FLUJO.map(t => ({
              clave: t.clave,
              icono: ICONO_DEL_TIPO[t.clave],
              etiqueta: t.nombre,
              valor: conteos[t.clave],
              color: t.color,
              ayuda: t.ayuda,
              activa: tipo === t.clave,
              alPulsar: () => setTipo(actual => alPulsarUnTipo(actual, t.clave)),
          }))
        : [];

    const motivoSinOrdenar = porQueNoSePuedeOrdenar(search, tipo);

    return (
        <>
            <ModuleToolbar
              buscador={
                <div className="relative w-56 sm:w-72">
                    <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar flujo o palabra clave..."
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
              right={<CreateWorflowDialog triggerText="Nuevo" isPro={isPro} />}
            >
                <span data-pastillas-de-flujos className="contents">
                    <PastillasDeMetricas metricas={metricas} />
                </span>
            </ModuleToolbar>

            <div data-lista-de-flujos className="min-h-0 flex-1 overflow-y-auto pr-1">
                {filteredWorkflows.length === 0 ? (
                    <p className="mt-8 text-center text-sm text-muted-foreground">
                        No se encontraron flujos.
                    </p>
                ) : (
                    <SortableWorkflowList
                        workflows={filteredWorkflows}
                        userId={userId}
                        triggers={triggers}
                        repeticiones={repeticiones}
                        motivoSinOrdenar={motivoSinOrdenar}
                    />
                )}
                {motivoSinOrdenar && filteredWorkflows.length > 0 && (
                    <p data-aviso-de-orden className="mt-3 text-center text-xs text-muted-foreground">
                        {motivoSinOrdenar}
                    </p>
                )}
            </div>
        </>
    );
};
