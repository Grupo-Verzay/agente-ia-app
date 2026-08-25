'use client';

import { useState } from 'react';
import { Handle, Position, useConnection, useNodeConnections } from '@xyflow/react';
import { MessageSquareIcon, Trash2, ChevronDown, Zap } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { CARD_ACTIONS } from '@/types/workflow-node';
import { SourceDotHandle } from './SourceDotHandle';
import { cn } from '@/lib/utils';

export type FlowNodeData = {
    tipo: string;
    label: string;
    content: string;
    totalNodes: number;
    onChangeContent: (nodeId: string, content: string) => void;
    onDelete: (nodeId: string) => void;
    // Index signature: React Flow exige que el `data` de un Node cumpla
    // Record<string, unknown>.
    [key: string]: unknown;
};

/**
 * Nodo del diagrama, estilo n8n: icono grande a la izquierda y
 * titulo/subtitulo dentro, en vez del encabezado angosto de antes. El
 * contenido de texto se edita en un panel que se despliega al hacer clic -
 * asi el nodo se ve compacto cuando no se esta editando. El nodo sin
 * conexion entrante se marca como disparador (rayo), igual que en n8n.
 */
export function FlowNode({ id, data }: { id: string; data: FlowNodeData }) {
    const connection = useConnection();
    const isTarget = connection.inProgress && connection.fromNode?.id !== id;
    const isSourceActive = connection.inProgress && connection.fromNode?.id === id;
    const incoming = useNodeConnections({ handleType: 'target', handleId: 'in' });
    const isTrigger = incoming.length === 0;

    const [content, setContent] = useState(data.content);
    const [open, setOpen] = useState(false);
    const currentCardAction = CARD_ACTIONS.find((a) => a.type === data.tipo);
    const Icon = currentCardAction?.icon ?? MessageSquareIcon;
    const isIntention = data.tipo === 'intention';
    const preview = content.trim() || 'Sin texto todavía';

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
                    <button
                        type="button"
                        onClick={() => setOpen((o) => !o)}
                        className="nodrag flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                        <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] ${currentCardAction?.bg ?? 'bg-gray-500'}`}
                        >
                            <Icon className="h-5 w-5 text-white" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold leading-tight text-foreground">
                                {data.label}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{preview}</span>
                        </span>
                        <ChevronDown
                            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
                        />
                    </button>
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

                {open && (
                    <div className="border-t border-border/60 p-3 pt-2.5">
                        <Textarea
                            value={content}
                            onChange={(e) => {
                                setContent(e.target.value);
                                data.onChangeContent(id, e.target.value);
                            }}
                            placeholder="Texto o nota de este paso..."
                            className="min-h-[72px] resize-none text-sm nodrag"
                            autoFocus
                        />
                    </div>
                )}
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
