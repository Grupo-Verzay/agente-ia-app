'use client';

import { useState } from 'react';
import { Handle, Position, useConnection, useNodeConnections } from '@xyflow/react';
import { MessageSquareIcon, Trash2, Zap } from 'lucide-react';
import { diagramaActions } from './diagrama-node-types';
import { SourceDotHandle } from './SourceDotHandle';

// Color del icono por tipo -el cuadro del nodo es blanco/tarjeta, el color
// va en el icono, igual que en la maqueta aprobada-. Valores fijos (no
// clases de Tailwind) para no depender de que el purgador las detecte.
// Debe cubrir los mismos tipos que diagrama-node-types.ts.
const ICON_COLOR: Record<string, string> = {
    text: '#6b7280',
    image: '#3b82f6',
    video: '#ef4444',
    document: '#eab308',
    audio: '#22c55e',
    intention: '#111827',
    node_pause: '#0ea5e9',
    nota: '#f59e0b',
    sheets_write: '#059669',
    sheets_read: '#059669',
    notificacion: '#8b5cf6',
    solicitud: '#6366f1',
};

export type FlowNodeSize = 'sm' | 'md' | 'lg';

const NEXT_SIZE: Record<FlowNodeSize, FlowNodeSize> = { sm: 'md', md: 'lg', lg: 'sm' };
const SIZE_LABEL: Record<FlowNodeSize, string> = { sm: 'S', md: 'M', lg: 'L' };

const SIZE_TOKENS: Record<FlowNodeSize, {
    wrapper: string;
    box: string;
    iconSvg: string;
    title: string;
    sub: string;
}> = {
    sm: { wrapper: 'w-[92px]', box: 'h-11 w-11 rounded-[10px]', iconSvg: 'h-4 w-4', title: 'text-[10px]', sub: 'text-[9.5px]' },
    md: { wrapper: 'w-[116px]', box: 'h-[58px] w-[58px] rounded-[14px]', iconSvg: 'h-5 w-5', title: 'text-[11.5px]', sub: 'text-[10.5px]' },
    lg: { wrapper: 'w-[148px]', box: 'h-[74px] w-[74px] rounded-[18px]', iconSvg: 'h-6 w-6', title: 'text-[13px]', sub: 'text-xs' },
};

export type FlowNodeData = {
    tipo: string;
    label: string;
    content: string;
    size?: FlowNodeSize;
    totalNodes: number;
    onChangeLabel: (nodeId: string, label: string) => void;
    onChangeContent: (nodeId: string, content: string) => void;
    onChangeSize: (nodeId: string, size: FlowNodeSize) => void;
    onDelete: (nodeId: string) => void;
    // Index signature: React Flow exige que el `data` de un Node cumpla
    // Record<string, unknown>.
    [key: string]: unknown;
};

/**
 * Nodo del diagrama, calcado de la maqueta aprobada: un cuadro con el icono
 * solo, y el nombre + contenido como texto centrado debajo (no dentro de una
 * tarjeta con encabezado). Nombre y contenido se editan ahi mismo -son
 * inputs sin borde que se ven como el texto de la maqueta hasta que se les
 * hace foco-. Eliminar y cambiar de tamano quedan en una mini barra que solo
 * aparece al pasar el mouse, para no ensuciar la vista en reposo.
 */
export function FlowNode({ id, data }: { id: string; data: FlowNodeData }) {
    const connection = useConnection();
    const isTarget = connection.inProgress && connection.fromNode?.id !== id;
    const isSourceActive = connection.inProgress && connection.fromNode?.id === id;
    const incoming = useNodeConnections({ handleType: 'target', handleId: 'in' });
    const isTrigger = incoming.length === 0;

    const [label, setLabel] = useState(data.label);
    const [content, setContent] = useState(data.content);
    const size = data.size ?? 'md';
    const t = SIZE_TOKENS[size];
    const currentCardAction = diagramaActions.find((a) => a.type === data.tipo);
    const Icon = currentCardAction?.icon ?? MessageSquareIcon;
    const isIntention = data.tipo === 'intention';

    return (
        <div className={`group relative ${t.wrapper} text-center`}>
            <div className={`relative mx-auto ${t.box}`}>
                {isTrigger && (
                    <span className="absolute -left-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-md border-2 border-background bg-amber-500 shadow-md">
                        <Zap className="h-2.5 w-2.5 fill-white text-white" />
                    </span>
                )}

                <Handle
                    id="in"
                    type="target"
                    position={Position.Left}
                    isConnectable={!connection.inProgress || isTarget}
                    isConnectableStart={false}
                    style={{
                        width: 14,
                        height: 14,
                        borderRadius: 9999,
                        background: 'hsl(var(--card))',
                        border: '1.8px solid hsl(var(--border))',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                    }}
                />

                <div
                    className={`flex h-full w-full items-center justify-center border border-border/70 bg-card shadow-sm ${t.box}`}
                >
                    <Icon className={t.iconSvg} style={{ color: ICON_COLOR[data.tipo] ?? '#6b7280' }} />
                </div>

                {/* barra de acciones: oculta hasta que se pasa el mouse por el nodo */}
                <div className="nodrag absolute -top-3 right-0 z-20 flex translate-x-1/3 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                        type="button"
                        title={`Tamaño: ${SIZE_LABEL[size]} (clic para cambiar)`}
                        onClick={() => data.onChangeSize(id, NEXT_SIZE[size])}
                        className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-[9px] font-semibold text-muted-foreground shadow-sm hover:border-primary/50 hover:text-primary"
                    >
                        {SIZE_LABEL[size]}
                    </button>
                    <button
                        type="button"
                        title="Eliminar nodo"
                        onClick={() => data.onDelete(id)}
                        className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:border-destructive/50 hover:text-destructive"
                    >
                        <Trash2 className="h-2.5 w-2.5" />
                    </button>
                </div>

                {isIntention ? (
                    <>
                        <SourceDotHandle id="yes" label="Sí" topPct={38} active={!connection.inProgress || isSourceActive} connectableStart={!connection.inProgress} totalNodes={data.totalNodes} />
                        <SourceDotHandle id="no" label="No" topPct={62} active={!connection.inProgress || isSourceActive} connectableStart={!connection.inProgress} totalNodes={data.totalNodes} />
                    </>
                ) : (
                    <SourceDotHandle id="out" label="" topPct={50} active={!connection.inProgress || isSourceActive} connectableStart={!connection.inProgress} totalNodes={data.totalNodes} />
                )}
            </div>

            <input
                value={label}
                onChange={(e) => {
                    setLabel(e.target.value);
                    data.onChangeLabel(id, e.target.value);
                }}
                placeholder="Nombre del paso"
                title="Nombre del paso"
                className={`nodrag mt-2.5 w-full truncate border-0 bg-transparent p-0 text-center font-semibold leading-tight text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/70 focus-visible:ring-0 ${t.title}`}
            />
            <textarea
                value={content}
                onChange={(e) => {
                    setContent(e.target.value);
                    data.onChangeContent(id, e.target.value);
                }}
                placeholder="Sin texto todavía"
                rows={1}
                className={`nodrag mt-0.5 w-full resize-none border-0 bg-transparent p-0 text-center leading-tight text-muted-foreground outline-none placeholder:italic placeholder:text-muted-foreground/70 focus-visible:ring-0 ${t.sub}`}
            />
        </div>
    );
}
