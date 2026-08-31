'use client';

import { useEffect, useRef, useState } from 'react';
import { Handle, NodeResizeControl, Position, useConnection } from '@xyflow/react';
import { Bold, Copy, GripHorizontal, Pencil, Trash2 } from 'lucide-react';

import {
    IDEA_ALTO_MIN,
    IDEA_ANCHO_MIN,
    IDEA_COLORES,
    IDEA_EMOJIS,
    IDEA_POR_DEFECTO,
} from './diagrama-node-types';
import { SourceDotHandle } from './SourceDotHandle';
import type { FlowNodeData } from './FlowNode';

/**
 * Parte el texto en trozos normales y en negrita. La negrita se marca con
 * `**asi**`, la misma convencion de WhatsApp y Markdown, para poder resaltar
 * una palabra suelta en vez de la nota entera.
 */
function trozos(texto: string): { texto: string; negrita: boolean }[] {
    const partes = texto.split(/\*\*([\s\S]+?)\*\*/g);
    // split con grupo devuelve: [normal, negrita, normal, negrita, ...]
    return partes.map((parte, i) => ({ texto: parte, negrita: i % 2 === 1 })).filter((p) => p.texto !== '');
}

/** Lo que el nodo Idea guarda ademas del texto. */
export type IdeaAjustes = {
    color: string;
    negrita: boolean;
    ancho: number;
    alto: number;
};

/**
 * Nodo Idea: la nota suelta del lienzo.
 *
 * A diferencia del resto de nodos -que son pasos del proceso, con su nombre
 * encima, su icono fijo y su texto en un modal-, aqui se escribe DENTRO de la
 * caja, se estira desde la esquina de abajo a la derecha y se pinta de un
 * color. Sirve para apuntar lo que todavia no es un paso: una idea, un
 * pendiente, una advertencia.
 *
 * La barra de arriba solo aparece al pasar el mouse o mientras se escribe,
 * para que en reposo el lienzo se vea limpio.
 */
export function IdeaNode({ id, data }: { id: string; data: FlowNodeData }) {
    const connection = useConnection();
    const isTarget = connection.inProgress && connection.fromNode?.id !== id;
    const isSourceActive = connection.inProgress && connection.fromNode?.id === id;

    const areaRef = useRef<HTMLTextAreaElement | null>(null);
    // Mientras se escribe se ve el texto crudo, con sus `**`; al soltar el foco
    // se ve ya formateado. Es la unica forma de tener negrita por palabra en
    // una caja de texto: un textarea no sabe pintar parte de su contenido.
    const [escribiendo, setEscribiendo] = useState(false);

    useEffect(() => {
        if (escribiendo) areaRef.current?.focus();
    }, [escribiendo]);

    const ajustes: IdeaAjustes = {
        color: data.color ?? IDEA_POR_DEFECTO.color,
        negrita: data.negrita ?? IDEA_POR_DEFECTO.negrita,
        ancho: data.ancho ?? IDEA_POR_DEFECTO.ancho,
        alto: data.alto ?? IDEA_POR_DEFECTO.alto,
    };

    const cambiar = (parcial: Partial<IdeaAjustes>) =>
        data.onChangeIdea(id, { ...ajustes, ...parcial });

    /** El emoji entra donde este el cursor, no al final: una idea puede
     *  empezar con el emoji o llevarlo en medio de la frase. */
    const ponerEmoji = (emoji: string) => {
        const texto = data.content ?? '';
        const corte = areaRef.current?.selectionStart ?? texto.length;
        data.onChangeContent(id, `${texto.slice(0, corte)}${emoji}${texto.slice(corte)}`);

        const siguiente = corte + emoji.length;
        requestAnimationFrame(() => {
            areaRef.current?.focus();
            areaRef.current?.setSelectionRange(siguiente, siguiente);
        });
    };

    /** Envuelve en `**` lo que este seleccionado. Sin seleccion, deja las dos
     *  marcas puestas y el cursor en medio, listo para escribir dentro. */
    const ponerNegrita = () => {
        const texto = data.content ?? '';
        const area = areaRef.current;
        const desde = area?.selectionStart ?? texto.length;
        const hasta = area?.selectionEnd ?? desde;
        const dentro = texto.slice(desde, hasta);

        data.onChangeContent(id, `${texto.slice(0, desde)}**${dentro}**${texto.slice(hasta)}`);
        setEscribiendo(true);

        // El cursor queda rodeando lo marcado, o entre las marcas si no habia
        // nada seleccionado.
        const inicio = desde + 2;
        requestAnimationFrame(() => {
            areaRef.current?.focus();
            areaRef.current?.setSelectionRange(inicio, inicio + dentro.length);
        });
    };

    return (
        <div className="group relative" style={{ width: ajustes.ancho, height: ajustes.alto }}>
            {/* Barra de herramientas, flotando encima de la nota */}
            <div className="nodrag absolute -top-2 left-1/2 z-30 flex -translate-x-1/2 -translate-y-full flex-col gap-1.5 rounded-xl border border-border/70 bg-background px-2 py-1.5 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <div className="flex items-center gap-0.5">
                    {IDEA_EMOJIS.map((emoji) => (
                        <button
                            key={emoji}
                            type="button"
                            title={`Poner ${emoji}`}
                            onClick={() => ponerEmoji(emoji)}
                            className="flex h-6 w-6 items-center justify-center rounded text-[15px] leading-none transition-colors hover:bg-muted"
                        >
                            {emoji}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        title="Escribir en la nota"
                        onClick={() => setEscribiendo(true)}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        title="Negrita: marca la palabra con **"
                        onClick={ponerNegrita}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <Bold className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        title="Duplicar la nota"
                        onClick={() => data.onDuplicate(id)}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        title="Eliminar la nota"
                        onClick={() => data.onDelete(id)}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>

                    <span className="mx-1 h-4 w-px bg-border" />

                    {IDEA_COLORES.map((color) => (
                        <button
                            key={color}
                            type="button"
                            title="Color de la nota"
                            onClick={() => cambiar({ color })}
                            style={{ background: color }}
                            className={`h-4 w-4 rounded-full border transition-transform hover:scale-110 ${ajustes.color === color ? 'border-foreground/60 ring-1 ring-foreground/30' : 'border-border'
                                }`}
                        />
                    ))}
                </div>
            </div>

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

            {/* La caja: el color va aqui y el texto encima, transparente. La
                franja de arriba es de donde se agarra para mover la nota -el
                textarea ocupa todo lo demas y lleva `nodrag`, asi que sin ella
                no habria por donde arrastrarla-. */}
            <div
                className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border/70"
                style={{ background: ajustes.color, boxShadow: '0 3px 12px rgba(20,24,29,0.14)' }}
            >
                <div
                    title="Arrastrar la nota"
                    className="flex h-3 shrink-0 cursor-grab items-center justify-center text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
                >
                    <GripHorizontal className="h-2.5 w-2.5" />
                </div>

                {escribiendo ? (
                    <textarea
                        ref={areaRef}
                        value={data.content}
                        onChange={(e) => data.onChangeContent(id, e.target.value)}
                        onBlur={() => setEscribiendo(false)}
                        placeholder="Escribe acá…"
                        className="nodrag nowheel min-h-0 w-full flex-1 resize-none border-0 bg-transparent px-2 pb-1.5 text-[13px] leading-snug text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
                        style={{ fontWeight: ajustes.negrita ? 700 : 400 }}
                    />
                ) : (
                    <div
                        onClick={() => setEscribiendo(true)}
                        title="Clic para escribir"
                        className="nodrag nowheel min-h-0 w-full flex-1 cursor-text overflow-auto whitespace-pre-wrap break-words px-2 pb-1.5 text-[13px] leading-snug text-foreground"
                        style={{ fontWeight: ajustes.negrita ? 700 : 400 }}
                    >
                        {data.content
                            ? trozos(data.content).map((trozo, i) =>
                                trozo.negrita ? <strong key={i}>{trozo.texto}</strong> : <span key={i}>{trozo.texto}</span>
                            )
                            : <span className="text-muted-foreground/60">Escribe acá…</span>}
                    </div>
                )}
            </div>

            <SourceDotHandle
                id="out"
                label=""
                topPct={50}
                active={!connection.inProgress || isSourceActive}
                connectableStart={!connection.inProgress}
            />

            {/* Tirador de la esquina de abajo a la derecha. El tamano se guarda
                en el nodo, asi que la nota vuelve a abrirse como se dejo. */}
            <NodeResizeControl
                position="bottom-right"
                minWidth={IDEA_ANCHO_MIN}
                minHeight={IDEA_ALTO_MIN}
                onResize={(_, params) => cambiar({ ancho: Math.round(params.width), alto: Math.round(params.height) })}
                style={{ background: 'transparent', border: 'none' }}
            >
                <span className="absolute -bottom-1 -right-1 block h-3 w-3 cursor-nwse-resize rounded-full border-2 border-background bg-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100" />
            </NodeResizeControl>
        </div>
    );
}
