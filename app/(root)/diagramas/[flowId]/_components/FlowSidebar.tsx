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

import type { DiagramaAction } from './diagrama-node-types';
import { diagramaContentActions, diagramaLogicActions } from './diagrama-node-types';

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

export function FlowSidebar({ onCreateNode }: { onCreateNode: (action: DiagramaAction) => void }) {
    const { setOpen, setOpenMobile, isMobile } = useSidebar();
    const closeSidebar = () => (isMobile ? setOpenMobile(false) : setOpen(false));

    const [q, setQ] = useState('');
    const qLower = q.trim().toLowerCase();

    const matches = (a: DiagramaAction) => !qLower || a.label.toLowerCase().includes(qLower) || a.type.toLowerCase().includes(qLower);
    const filteredNodes = useMemo(() => diagramaContentActions.filter(matches), [qLower]);
    const filteredAcciones = useMemo(() => diagramaLogicActions.filter(matches), [qLower]);

    const onDragStart = (evt: React.DragEvent, action: DiagramaAction) => {
        evt.dataTransfer.setData('application/reactflow', JSON.stringify({ type: 'customNode', label: action.label, nodeTipo: action.type }));
        evt.dataTransfer.effectAllowed = 'move';
    };

    const onClickCreate = (action: DiagramaAction) => {
        onCreateNode(action);
        closeSidebar();
    };

    const renderRow = (action: DiagramaAction) => {
        const Icon = action.icon;
        return (
            <button
                key={action.type}
                type="button"
                draggable
                onDragStart={(e) => onDragStart(e, action)}
                onClick={() => onClickCreate(action)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-accent"
            >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${action.bg ?? 'bg-gray-500'}`}>
                    <Icon className="h-3.5 w-3.5 text-white" />
                </span>
                <span className="truncate text-[12.5px] font-medium">{action.label}</span>
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
                        <div className="flex flex-col gap-0.5 px-1 pb-2">{filteredNodes.map((a) => renderRow(a))}</div>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarSeparator />

                <SidebarGroup>
                    <SidebarGroupLabel className="px-1"><SidebarSectionLabel label="Acciones" /></SidebarGroupLabel>
                    <SidebarGroupContent>
                        <div className="flex flex-col gap-0.5 px-1 pb-2">{filteredAcciones.map((a) => renderRow(a))}</div>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
}
