'use client';

import { useMemo, useState } from 'react';
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

import type { Action } from '@/types/workflow-node';
import { nodeActions, accionActions, automationActions, seguimientoActions } from '@/types/workflow-node';

export function FlowSidebarTrigger() {
    const { toggleSidebar, open, openMobile, isMobile } = useSidebar();
    const isOpen = isMobile ? openMobile : open;

    return (
        <Button size="icon" className="h-9 w-9 rounded-md shadow" onClick={toggleSidebar} title={isOpen ? 'Cerrar menú' : 'Agregar nodo'}>
            {isOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </Button>
    );
}

function SidebarSectionLabel({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-2 px-1 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
            <span className="h-px flex-1 bg-border/60" />
        </div>
    );
}

export function FlowSidebar({ onCreateNode }: { onCreateNode: (action: Action) => void }) {
    const { setOpen, setOpenMobile, isMobile } = useSidebar();
    const closeSidebar = () => (isMobile ? setOpenMobile(false) : setOpen(false));

    const [q, setQ] = useState('');
    const qLower = q.trim().toLowerCase();

    const matches = (a: Action) => !qLower || a.label.toLowerCase().includes(qLower) || a.type.toLowerCase().includes(qLower);
    const filteredNodes = useMemo(() => nodeActions.filter(matches), [qLower]);
    const filteredAcciones = useMemo(() => accionActions.filter(matches), [qLower]);
    const filteredAutomatizaciones = useMemo(() => automationActions.filter(matches), [qLower]);
    const filteredSeguimientos = useMemo(() => seguimientoActions.filter(matches), [qLower]);

    const onDragStart = (evt: React.DragEvent, action: Action) => {
        evt.dataTransfer.setData('application/reactflow', JSON.stringify({ type: 'customNode', label: action.label, nodeTipo: action.type }));
        evt.dataTransfer.effectAllowed = 'move';
    };

    const onClickCreate = (action: Action) => {
        onCreateNode(action);
        closeSidebar();
    };

    const renderTile = (action: Action, seguimiento = false) => {
        const Icon = action.icon;
        return (
            <button
                key={action.type}
                type="button"
                draggable
                onDragStart={(e) => onDragStart(e, action)}
                onClick={() => onClickCreate(action)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-background p-3 text-center transition hover:border-primary/50 hover:bg-accent ${seguimiento ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
            >
                <Icon className={`h-5 w-5 ${action.iconClassName ?? ''}`} />
                <span className="text-[11px] font-medium leading-tight">{action.label}</span>
            </button>
        );
    };

    return (
        <Sidebar side="right" collapsible="offcanvas" className="border-l">
            <SidebarHeader className="p-3">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nodo..." className="h-9" />
            </SidebarHeader>
            <SidebarContent className="px-2">
                <SidebarGroup>
                    <SidebarGroupLabel className="px-1"><SidebarSectionLabel label="Nodos" /></SidebarGroupLabel>
                    <SidebarGroupContent>
                        <div className="grid grid-cols-2 gap-2 px-1 pb-2">{filteredNodes.map((a) => renderTile(a))}</div>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarSeparator />

                <SidebarGroup>
                    <SidebarGroupLabel className="px-1"><SidebarSectionLabel label="Acciones" /></SidebarGroupLabel>
                    <SidebarGroupContent>
                        <div className="grid grid-cols-2 gap-2 px-1 pb-2">{filteredAcciones.map((a) => renderTile(a))}</div>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarSeparator />

                <SidebarGroup>
                    <SidebarGroupLabel className="px-1"><SidebarSectionLabel label="Automatizaciones" /></SidebarGroupLabel>
                    <SidebarGroupContent>
                        <div className="grid grid-cols-2 gap-2 px-1 pb-2">{filteredAutomatizaciones.map((a) => renderTile(a))}</div>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarSeparator />

                <SidebarGroup>
                    <SidebarGroupLabel className="px-1"><SidebarSectionLabel label="Seguimientos" /></SidebarGroupLabel>
                    <SidebarGroupContent>
                        <div className="grid grid-cols-2 gap-2 px-1 pb-2">{filteredSeguimientos.map((a) => renderTile(a, true))}</div>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
}
