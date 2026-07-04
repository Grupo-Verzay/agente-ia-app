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
    const { setOpen, setOpenMobile, isMobile } = useSidebar();
    const closeSidebar = () => (isMobile ? setOpenMobile(false) : setOpen(false));

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
        closeSidebar(); // se esconde al seleccionar para no ocupar espacio
    };

    const renderTile = (action: Action, disabled: boolean, seguimiento = false) => {
        const Icon = action.icon;

        return (
            <Button
                key={action.type}
                type="button"
                variant={'outline'}
                disabled={disabled}
                draggable={!disabled}
                onDragStart={(evt) => onDragStart(evt, action)}
                onDragEnd={() => closeSidebar()}
                onClick={() => onClickCreate(action)}
                className={`flex justify-start w-full ${
                    seguimiento
                        ? 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-950/50'
                        : ''
                }`}
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
            <SidebarHeader className="p-4 pb-3">
                <p className="text-sm font-bold text-foreground">Selecciona una acción</p>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>{`Nodos: ${totalNodes}/${MAX_NODES_PER_WORKFLOW}`}</span>
                    <span>{`Seguimientos: ${seguimientoNodes}/${MAX_SEGUIMIENTOS_PER_WORKFLOW}`}</span>
                </div>
            </SidebarHeader>

            <SidebarContent className="px-2 pb-2 pt-0 gap-0">
                <SidebarGroup className="p-0">
                    <SidebarGroupContent className="flex flex-col gap-1">
                        {filteredBase.map((action) => renderTile(action, reachedTotalLimit))}
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup className="p-0">
                    <div className="flex items-center gap-2 px-1 py-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Seguimientos
                        </span>
                        <span className="h-px flex-1 bg-border/60" />
                    </div>
                    <SidebarGroupContent className="flex flex-col gap-1">
                        {filteredSeguimientos.map((action) =>
                            renderTile(action, reachedTotalLimit || reachedSeguimientoLimit, true)
                        )}
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
}