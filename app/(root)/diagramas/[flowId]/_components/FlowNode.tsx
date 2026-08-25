'use client';

import { useState } from 'react';
import { Handle, Position, useConnection } from '@xyflow/react';
import { MessageSquareIcon, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { CARD_ACTIONS } from '@/types/workflow-node';
import { SourceDotHandle } from './SourceDotHandle';

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
 * Tarjeta del nodo del diagrama: mismo encabezado (icono + color por tipo) que
 * Workflow, pero con un solo campo de contenido libre en vez de los
 * formularios especializados por tipo -esos se hacen mas adelante, cuando se
 * indique el nuevo diseno de cada nodo. El diagrama no ejecuta nada, asi que
 * editar y mover se guarda en memoria hasta que se le da a "Guardar".
 */
export function FlowNode({ id, data }: { id: string; data: FlowNodeData }) {
    const connection = useConnection();
    const isTarget = connection.inProgress && connection.fromNode?.id !== id;
    const isSourceActive = connection.inProgress && connection.fromNode?.id === id;

    const [content, setContent] = useState(data.content);
    const currentCardAction = CARD_ACTIONS.find((a) => a.type === data.tipo);
    const Icon = currentCardAction?.icon ?? MessageSquareIcon;
    const isIntention = data.tipo === 'intention';

    return (
        <div className="relative min-w-[320px]">
            <Card className="min-w-[320px] max-w-[320px] gap-0 overflow-hidden border-border/70 py-0 shadow-sm">
                <Handle
                    id="in"
                    type="target"
                    position={Position.Left}
                    isConnectable={!connection.inProgress || isTarget}
                    isConnectableStart={false}
                    style={{ width: 16, height: 16, borderRadius: 9999 }}
                />

                <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                        <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${currentCardAction?.bg ?? 'bg-gray-500'}`}
                        >
                            <Icon className={currentCardAction?.iconClassName ?? 'h-4 w-4 text-white'} />
                        </span>
                        <span className="truncate text-sm font-semibold">{data.label}</span>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Eliminar nodo"
                        onClick={() => data.onDelete(id)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </CardHeader>

                <CardContent className="p-3">
                    <Textarea
                        value={content}
                        onChange={(e) => {
                            setContent(e.target.value);
                            data.onChangeContent(id, e.target.value);
                        }}
                        placeholder="Texto o nota de este paso..."
                        className="min-h-[72px] resize-none text-sm nodrag"
                    />
                </CardContent>
            </Card>

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
