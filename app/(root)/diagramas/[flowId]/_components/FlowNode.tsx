'use client';

import { useState } from 'react';
import { Handle, Position, useConnection, useNodeConnections } from '@xyflow/react';
import { MessageSquareIcon, Trash2, Zap, StickyNote } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { CARD_ACTIONS } from '@/types/workflow-node';
import { SourceDotHandle } from './SourceDotHandle';

const NOTA_CARD_ACTION = { icon: StickyNote, bg: 'bg-amber-500', label: 'Nota' };

export type FlowNodeData = {
    tipo: string;
    label: string;
    content: string;
    totalNodes: number;
    onChangeLabel: (nodeId: string, label: string) => void;
    onChangeContent: (nodeId: string, content: string) => void;
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
    const currentCardAction = data.tipo === 'nota' ? NOTA_CARD_ACTION : CARD_ACTIONS.find((a) => a.type === data.tipo);
    const Icon = currentCardAction?.icon ?? MessageSquareIcon;
    const isIntention = data.tipo === 'intention';

    return (
        <div className="relative w-[224px]">
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
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${currentCardAction?.bg ?? 'bg-gray-500'}`}
                    >
                        <Icon className="h-4 w-4 text-white" />
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
                            className="nodrag w-full truncate border-0 bg-transparent p-0 text-[13.5px] font-semibold leading-tight text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/70 focus-visible:ring-0"
                        />
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {currentCardAction?.label ?? data.tipo}
                        </span>
                    </span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="nodrag h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
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
                        className="nodrag min-h-[40px] resize-none rounded-lg border-0 bg-muted/50 px-2.5 py-2 text-xs leading-relaxed shadow-none placeholder:italic placeholder:text-muted-foreground/70 focus-visible:ring-1 focus-visible:ring-primary/25 focus-visible:ring-offset-0"
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
