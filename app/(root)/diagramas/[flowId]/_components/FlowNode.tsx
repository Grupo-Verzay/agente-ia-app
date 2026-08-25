'use client';

import { useState } from 'react';
import { Handle, Position, useConnection, useNodeConnections } from '@xyflow/react';
import { MessageSquareIcon, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { diagramaActions } from './diagrama-node-types';
import { SourceDotHandle } from './SourceDotHandle';

// Color del icono por tipo -el cuadro del nodo es blanco/tarjeta, el color
// va en el icono, igual que en la maqueta aprobada-. Valores fijos (no
// clases de Tailwind) para no depender de que el purgador las detecte.
// Debe cubrir los mismos tipos que diagrama-node-types.ts.
const ICON_COLOR: Record<string, string> = {
    inicio: '#10b981',
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

// Que se le pide escribir al usuario en cada tipo de nodo. El texto del nodo
// es siempre el mismo campo (`content`); lo unico que cambia es como se le
// explica, para que no tenga que adivinar si ahi va un mensaje, un enlace o
// una nota interna.
const CONTENT_HINT: Record<string, { label: string; placeholder: string }> = {
    inicio: { label: 'Cómo arranca la conversación', placeholder: 'Ej: el cliente escribe por primera vez al WhatsApp' },
    text: { label: 'Mensaje que recibe el cliente', placeholder: 'Ej: ¡Hola! Bienvenido, ¿en qué te puedo ayudar hoy?' },
    image: { label: 'Imagen que se envía', placeholder: 'Describe la imagen o pega el enlace' },
    video: { label: 'Video que se envía', placeholder: 'Describe el video o pega el enlace' },
    document: { label: 'Documento que se envía', placeholder: 'Ej: catálogo en PDF' },
    audio: { label: 'Audio que se envía', placeholder: 'Describe el audio o pega el enlace' },
    intention: { label: 'Qué se pregunta para decidir', placeholder: 'Ej: ¿el cliente quiere comprar o solo está preguntando?' },
    node_pause: { label: 'Por qué se pausa', placeholder: 'Ej: espera a que un asesor conteste' },
    nota: { label: 'Nota interna', placeholder: 'Solo para el equipo, el cliente no la ve' },
    sheets_write: { label: 'Qué se registra', placeholder: 'Ej: nombre, teléfono y producto de interés' },
    sheets_read: { label: 'Qué se consulta', placeholder: 'Ej: si el cliente ya está en la base' },
    notificacion: { label: 'Aviso que se manda', placeholder: 'Ej: avisar al asesor que hay un cliente nuevo' },
    solicitud: { label: 'Datos que se piden', placeholder: 'Ej: nombre, ciudad y fecha del evento' },
};

const DEFAULT_HINT = { label: 'Texto de este paso', placeholder: 'Escribe aquí lo que pasa en este paso' };

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
    sm: { wrapper: 'w-[92px]', box: 'h-11 w-11 rounded-[10px]', iconSvg: 'h-[18px] w-[18px]', title: 'text-[10px]', sub: 'text-[9.5px]' },
    md: { wrapper: 'w-[116px]', box: 'h-[58px] w-[58px] rounded-[14px]', iconSvg: 'h-[23px] w-[23px]', title: 'text-[11.5px]', sub: 'text-[10.5px]' },
    lg: { wrapper: 'w-[148px]', box: 'h-[74px] w-[74px] rounded-[18px]', iconSvg: 'h-[29px] w-[29px]', title: 'text-[13px]', sub: 'text-xs' },
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
 * tarjeta con encabezado). El texto ya no se escribe encima del lienzo
 * -teclear dentro de un cuadrito de 116 px, con el lienzo moviendose debajo,
 * era incomodo-: al hacer clic en el nodo se abre un modal con el nombre del
 * paso y el texto que ve el cliente. Eliminar y cambiar de tamano quedan en
 * una mini barra que solo aparece al pasar el mouse, para no ensuciar la
 * vista en reposo.
 */
export function FlowNode({ id, data }: { id: string; data: FlowNodeData }) {
    const connection = useConnection();
    const isTarget = connection.inProgress && connection.fromNode?.id !== id;
    const isSourceActive = connection.inProgress && connection.fromNode?.id === id;
    const incoming = useNodeConnections({ handleType: 'target', handleId: 'in' });
    const isTrigger = incoming.length === 0;

    const [open, setOpen] = useState(false);
    // Borrador del modal: lo escrito solo entra al diagrama al darle a Listo,
    // para poder cerrar sin haber ensuciado el nodo.
    const [draftLabel, setDraftLabel] = useState(data.label);
    const [draftContent, setDraftContent] = useState(data.content);

    const size = data.size ?? 'md';
    const t = SIZE_TOKENS[size];
    const currentCardAction = diagramaActions.find((a) => a.type === data.tipo);
    const Icon = currentCardAction?.icon ?? MessageSquareIcon;
    const isIntention = data.tipo === 'intention';
    // El nodo de arranque no recibe nada: ni la chincheta roja de "aqui entra
    // la conversacion" -el arranque ya es el- ni el conector de entrada.
    const isInicio = data.tipo === 'inicio';
    const hint = CONTENT_HINT[data.tipo] ?? DEFAULT_HINT;

    const abrir = () => {
        setDraftLabel(data.label);
        setDraftContent(data.content);
        setOpen(true);
    };

    const guardar = () => {
        data.onChangeLabel(id, draftLabel.trim() || currentCardAction?.label || 'Paso');
        data.onChangeContent(id, draftContent);
        setOpen(false);
    };

    return (
        <div className={`group relative ${t.wrapper} text-center`}>
            {/* El nombre va ARRIBA del cuadro y se edita ahi mismo: es un input
                sin borde que se ve como texto hasta que se le hace foco. */}
            <input
                value={data.label}
                onChange={(e) => data.onChangeLabel(id, e.target.value)}
                placeholder={currentCardAction?.label ?? 'Nombre del paso'}
                title="Nombre del paso (se puede editar aquí)"
                className={`nodrag mb-1.5 w-full truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-center font-semibold leading-tight text-foreground outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground/70 hover:border-border focus:border-primary focus-visible:ring-0 ${t.title}`}
            />

            <div className={`relative mx-auto ${t.box}`}>
                {isTrigger && !isInicio && (
                    <span
                        className="absolute -left-2.5 top-1/2 z-10 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full border-2 border-background bg-red-500"
                        style={{ boxShadow: '0 2px 6px rgba(20,24,29,0.2)' }}
                    >
                        <Zap className="h-2 w-2 fill-white text-white" />
                    </span>
                )}

                {!isInicio && (
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
                )}

                <div
                    role="button"
                    tabIndex={0}
                    title="Clic para escribir el texto de este paso"
                    onClick={abrir}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            abrir();
                        }
                    }}
                    className={`flex h-full w-full cursor-pointer items-center justify-center border border-border/70 bg-card outline-none transition-colors hover:border-primary/60 focus-visible:border-primary ${t.box}`}
                    style={{ boxShadow: '0 3px 12px rgba(20,24,29,0.14)' }}
                >
                    <Icon className={t.iconSvg} strokeWidth={1.8} style={{ color: ICON_COLOR[data.tipo] ?? '#6b7280' }} />
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

            {/* Debajo del cuadro solo se asoma el texto cuando lo hay: un nodo
                vacio no lleva ningun aviso, para no llenar el lienzo de ruido. */}
            {data.content && (
                <p
                    onClick={abrir}
                    title="Clic para editar el texto de este paso"
                    className={`nodrag mt-1.5 line-clamp-2 w-full cursor-pointer leading-tight text-muted-foreground ${t.sub}`}
                >
                    {data.content}
                </p>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="nodrag nowheel sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Icon className="h-4 w-4" strokeWidth={1.8} style={{ color: ICON_COLOR[data.tipo] ?? '#6b7280' }} />
                            {data.label || currentCardAction?.label || 'Paso'}
                        </DialogTitle>
                        <DialogDescription>
                            Escribe lo que pasa en este paso: es lo que verá el cliente cuando lea el diagrama.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-1">
                        <div className="space-y-1.5">
                            <Label htmlFor={`nombre-${id}`}>Nombre del paso</Label>
                            <Input
                                id={`nombre-${id}`}
                                value={draftLabel}
                                onChange={(e) => setDraftLabel(e.target.value)}
                                placeholder={currentCardAction?.label ?? 'Nombre del paso'}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor={`texto-${id}`}>{hint.label}</Label>
                            <Textarea
                                id={`texto-${id}`}
                                value={draftContent}
                                onChange={(e) => setDraftContent(e.target.value)}
                                placeholder={hint.placeholder}
                                rows={6}
                                autoFocus
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="button" onClick={guardar}>
                            Listo
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
