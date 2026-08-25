'use client';

import { useState } from 'react';
import { Handle, Position, useConnection, useNodeConnections } from '@xyflow/react';
import { MessageSquareIcon, Trash2, Zap, StickyNote } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { CARD_ACTIONS } from '@/types/workflow-node';
import { SourceDotHandle } from './SourceDotHandle';

const NOTA_CARD_ACTION = { icon: StickyNote, bg: 'bg-amber-500', label: 'Nota' };

export type FlowNodeSize = 'sm' | 'md' | 'lg';

const NEXT_SIZE: Record<FlowNodeSize, FlowNodeSize> = { sm: 'md', md: 'lg', lg: 'sm' };
const SIZE_LABEL: Record<FlowNodeSize, string> = { sm: 'S', md: 'M', lg: 'L' };

const SIZE_TOKENS: Record<FlowNodeSize, {
    wrapper: string;
    icon: string;
    iconSvg: string;
    title: string;
    sub: string;
    content: string;
    button: string;
}> = {
    sm: {
        wrapper: 'w-[180px]',
        icon: 'h-7 w-7 rounded-lg',
        iconSvg: 'h-3.5 w-3.5',
        title: 'text-xs',
        sub: 'text-[10px]',
        content: 'min-h-[32px] px-2 py-1.5 text-[11px]',
        button: 'h-6 w-6',
    },
    md: {
        wrapper: 'w-[224px]',
        icon: 'h-9 w-9 rounded-[10px]',
        iconSvg: 'h-4 w-4',
        title: 'text-[13.5px]',
        sub: 'text-[11px]',
        content: 'min-h-[40px] px-2.5 py-2 text-xs',
        button: 'h-7 w-7',
    },
    lg: {
        wrapper: 'w-[280px]',
        icon: 'h-11 w-11 rounded-xl',
        iconSvg: 'h-5 w-5',
        title: 'text-base',
        sub: 'text-xs',
        content: 'min-h-[56px] px-3 py-2.5 text-sm',
        button: 'h-8 w-8',
    },
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
 * Nodo del diagrama, estilo n8n: icono grande a la izquierda y
 * titulo/subtitulo dentro, en vez del encabezado angosto de antes. El
 * contenido del paso queda siempre a la vista debajo del encabezado -no se
 * esconde detras de un clic-, igual que en los nodos que ya existian. El
 * nodo sin conexion entrante se marca como disparador (rayo), igual que en
 * n8n.
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
    const currentCardAction = data.tipo === 'nota' ? NOTA_CARD_ACTION : CARD_ACTIONS.find((a) => a.type === data.tipo);
    const Icon = currentCardAction?.icon ?? MessageSquareIcon;
    const isIntention = data.tipo === 'intention';

    return (
        <div className={`relative ${t.wrapper}`}>
            {isTrigger && (
                <span className="absolute -left-2.5 -top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-lg border-2 border-background bg-amber-500 shadow-md">
                    <Zap className="h-3.5 w-3.5 fill-white text-white" />
                </span>
            )}

            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                <Handle
                    id="in"
                    type="target"
                    position={Position.Left}
                    isConnectable={!connection.inProgress || isTarget}
                    isConnectableStart={false}
                    style={{ width: 16, height: 16, borderRadius: 9999 }}
                />

                <div className="flex items-center gap-2 p-3">
                    <span
                        className={`flex shrink-0 items-center justify-center ${t.icon} ${currentCardAction?.bg ?? 'bg-gray-500'}`}
                    >
                        <Icon className={`${t.iconSvg} text-white`} />
                    </span>
                    <span className="min-w-0 flex-1">
                        <input
                            value={label}
                            onChange={(e) => {
                                setLabel(e.target.value);
                                data.onChangeLabel(id, e.target.value);
                            }}
                            placeholder="Nombre del paso"
                            title="Nombre del paso"
                            className={`nodrag w-full truncate border-0 bg-transparent p-0 font-semibold leading-tight text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/70 focus-visible:ring-0 ${t.title}`}
                        />
                        <span className={`mt-0.5 block truncate text-muted-foreground ${t.sub}`}>
                            {currentCardAction?.label ?? data.tipo}
                        </span>
                    </span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={`nodrag shrink-0 p-0 text-[10px] font-semibold text-muted-foreground hover:text-primary ${t.button}`}
                        title={`Tamaño: ${SIZE_LABEL[size]} (clic para cambiar)`}
                        onClick={() => data.onChangeSize(id, NEXT_SIZE[size])}
                    >
                        {SIZE_LABEL[size]}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={`nodrag shrink-0 text-muted-foreground hover:text-destructive ${t.button}`}
                        title="Eliminar nodo"
                        onClick={() => data.onDelete(id)}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>

                <div className="px-3 pb-3">
                    <Textarea
                        value={content}
                        onChange={(e) => {
                            setContent(e.target.value);
                            data.onChangeContent(id, e.target.value);
                        }}
                        placeholder="Texto o nota de este paso..."
                        className={`nodrag resize-none rounded-lg border-0 bg-muted/50 leading-relaxed shadow-none placeholder:italic placeholder:text-muted-foreground/70 focus-visible:ring-1 focus-visible:ring-primary/25 focus-visible:ring-offset-0 ${t.content}`}
                    />
                </div>
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
    );
}
