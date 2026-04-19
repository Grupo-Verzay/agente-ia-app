'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
    Sidebar,
    SidebarHeader,
    SidebarContent,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
    SidebarSeparator,
    useSidebar,
} from '@/components/ui/sidebar';

import { MAX_NODES_PER_WORKFLOW, MAX_SEGUIMIENTOS_PER_WORKFLOW } from '@/types/workflow';
import type { Action, PropsWorkflowSidebar } from '@/types/workflow-node';
import { baseActions, seguimientoActions } from '@/types/workflow-node';

export function WorkflowSidebarTrigger() {
    const { toggleSidebar, open, openMobile, isMobile } = useSidebar();
    const isOpen = isMobile ? openMobile : open;

    return (
        <Button
            size="icon"
            className="h-10 w-10 rounded-full shadow"
            onClick={toggleSidebar}
            title={isOpen ? 'Cerrar menú' : 'Agregar nodo'}
        >
            {isOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </Button>
    );
}

export function WorkflowSidebar({ totalNodes, seguimientoNodes, onCreateNode }: PropsWorkflowSidebar) {
    const [q, setQ] = useState('');
    const qLower = q.trim().toLowerCase();

    const reachedTotalLimit = totalNodes >= MAX_NODES_PER_WORKFLOW;
    const reachedSeguimientoLimit = seguimientoNodes >= MAX_SEGUIMIENTOS_PER_WORKFLOW;

    const filteredBase = useMemo(() => {
        if (!qLower) return baseActions;
        return baseActions.filter(
            (a) => a.label.toLowerCase().includes(qLower) || a.type.toLowerCase().includes(qLower)
        );
    }, [qLower]);

    const filteredSeguimientos = useMemo(() => {
        if (!qLower) return seguimientoActions;
        return seguimientoActions.filter(
            (a) => a.label.toLowerCase().includes(qLower) || a.type.toLowerCase().includes(qLower)
        );
    }, [qLower]);

    const validateCanCreate = (action: Action) => {
        if (reachedTotalLimit) {
            toast.error(`Este flujo ya alcanzó el límite de ${MAX_NODES_PER_WORKFLOW} nodos.`, {
                id: 'sidebar-create-limit',
            });
            return false;
        }

        const isSeguimiento = action.type.startsWith('seguimiento-') || action.type === 'seguimiento';
        if (isSeguimiento && reachedSeguimientoLimit) {
            toast.error(`Este flujo ya tiene el máximo de ${MAX_SEGUIMIENTOS_PER_WORKFLOW} seguimientos.`, {
                id: 'sidebar-create-limit',
            });
            return false;
        }

        return true;
    };

    const onDragStart = (evt: React.DragEvent, action: Action) => {
        if (!validateCanCreate(action)) {
            evt.preventDefault();
            return;
        }

        evt.dataTransfer.setData(
            'application/reactflow',
            JSON.stringify({
                type: 'customNode',
                label: action.label,
                nodeTipo: action.type,
            })
        );
        evt.dataTransfer.effectAllowed = 'move';
    };

    const onClickCreate = (action: Action) => {
        if (!validateCanCreate(action)) return;
        onCreateNode(action);
    };

    const renderTile = (action: Action, disabled: boolean) => {
        const Icon = action.icon;

        return (
            <Button
                key={action.type}
                type="button"
                variant={'outline'}
                disabled={disabled}
                draggable={!disabled}
                onDragStart={(evt) => onDragStart(evt, action)}
                onClick={() => onClickCreate(action)}
                className="flex justify-start w-full"
            >
                <Icon className={`h-4 w-4 ${action.iconClassName ?? ''}`} />
                <span className="truncate">{action.label}</span>
            </Button>
        );
    };

    return (
        <Sidebar
            side="right"
            variant="sidebar"
            collapsible="offcanvas"
            className="bg-white dark:bg-gray-900 text-gray-800 dark:text-zinc-100 border-l border-zinc-200 dark:border-gray-800"
        >
            <SidebarHeader className="p-2">
                <Input placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} />
            </SidebarHeader>

            <SidebarSeparator />

            <SidebarContent className="p-2 gap-2">
                <SidebarGroup>
                    <SidebarGroupLabel>Base</SidebarGroupLabel>
                    <SidebarGroupContent className="flex flex-col gap-1">
                        {filteredBase.map((action) => renderTile(action, reachedTotalLimit))}
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Seguimientos</SidebarGroupLabel>
                    <SidebarGroupContent className="flex flex-col gap-1">
                        {filteredSeguimientos.map((action) =>
                            renderTile(action, reachedTotalLimit || reachedSeguimientoLimit)
                        )}
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
}