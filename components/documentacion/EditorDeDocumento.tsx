"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

import { cn } from "@/lib/utils";
import {
    NODO_DE_MENCION,
    laArrobaQueSeEscribe,
    loQueOfreceElSelector,
    NOMBRE_DEL_TIPO_DE_MENCION,
    type TipoDeMencion,
} from "@/lib/documentacion";
import {
    loQueSePuedeMencionarAction,
    type Mencionable,
} from "@/actions/documentacion-actions";
import { NodoDeMencion, SENAL_DEL_TIPO } from "./NodoDeMencion";

const EditorDeTexto = dynamic(() => import("@/components/shared/EditorDeTexto"), {
    ssr: false,
    loading: () => (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Cargando editor…
        </div>
    ),
});

/**
 * El editor de un documento: el de la casa, más el nodo de mención y su
 * selector de arroba.
 *
 * **El selector ofrece exactamente lo que el servidor va a guardar como
 * mención.** La arroba tiene que abrir palabra, que es la MISMA condición con
 * la que `laArrobaQueSeEscribe` decide; si las dos no estuvieran de acuerdo, la
 * lista ofrecería algo que luego no se menciona: la pastilla saldría, el
 * retroenlace no aparecería, y no habría ningún error que mirar.
 */

/** Cuánto se espera antes de preguntarle al servidor qué ofrecer. */
const ESPERA_DEL_SELECTOR = 180;

type Props = {
    contenido: unknown;
    editable: boolean;
    alCambiar: (contenido: object) => void;
    /** Al pulsar una pastilla. La pantalla decide a dónde lleva. */
    alPulsarMencion?: (tipo: TipoDeMencion, refId: string) => void;
};

export function EditorDeDocumento({ contenido, editable, alCambiar, alPulsarMencion }: Props) {
    const [editor, setEditor] = useState<Editor | null>(null);
    const [candidatos, setCandidatos] = useState<Mencionable[]>([]);
    const [abierto, setAbierto] = useState(false);
    const [elegido, setElegido] = useState(0);
    const [consulta, setConsulta] = useState("");

    // La posicion de la arroba dentro del documento, por referencia: entra en
    // el manejador de teclas y no puede reengancharlo en cada pulsacion.
    const arrobaRef = useRef<{ desde: number; hasta: number } | null>(null);
    // La arroba que se quiso callar con Escape. Se guarda **la posicion**: una
    // marca suelta se levantaria con el caracter siguiente.
    const calladaRef = useRef<number | null>(null);

    const ofrecidos = loQueOfreceElSelector(candidatos, consulta);

    /* ── Dónde está la arroba ────────────────────────────────────────────── */

    const mirarLaArroba = useCallback((ed: Editor) => {
        const { from, empty } = ed.state.selection;
        if (!empty) {
            setAbierto(false);
            return;
        }

        const inicio = ed.state.selection.$from.start();
        // `￼` ocupa UN caracter, igual que un nodo atomo: asi las
        // posiciones del texto y las del documento siguen alineadas y la
        // arroba se borra por donde es.
        const antes = ed.state.doc.textBetween(inicio, from, "\n", "￼");

        const arroba = laArrobaQueSeEscribe(antes, antes.length);
        if (!arroba) {
            arrobaRef.current = null;
            calladaRef.current = null;
            setAbierto(false);
            return;
        }

        const desde = inicio + arroba.desde;
        if (calladaRef.current === desde) {
            setAbierto(false);
            return;
        }

        arrobaRef.current = { desde, hasta: from };
        setConsulta(arroba.consulta);
        setAbierto(true);
        setElegido(0);
    }, []);

    useEffect(() => {
        if (!editor) return;
        const alActualizar = () => mirarLaArroba(editor);
        editor.on("selectionUpdate", alActualizar);
        editor.on("update", alActualizar);
        return () => {
            editor.off("selectionUpdate", alActualizar);
            editor.off("update", alActualizar);
        };
    }, [editor, mirarLaArroba]);

    /* ── Qué se ofrece ───────────────────────────────────────────────────── */

    useEffect(() => {
        if (!abierto) return;
        let vivo = true;
        const reloj = setTimeout(async () => {
            try {
                const salida = await loQueSePuedeMencionarAction({ texto: consulta });
                if (vivo && salida.success) setCandidatos(salida.data);
            } catch (error) {
                // Un selector que no ofrece nada se lee como que mencionar no
                // funciona, asi que el fallo no puede ser mudo.
                console.warn("[documentacion] no se pudo leer lo mencionable", error);
            }
        }, ESPERA_DEL_SELECTOR);
        return () => {
            vivo = false;
            clearTimeout(reloj);
        };
    }, [abierto, consulta]);

    /* ── Elegir ──────────────────────────────────────────────────────────── */

    const meter = useCallback(
        (quien: Mencionable) => {
            const donde = arrobaRef.current;
            if (!editor || !donde) return;

            editor
                .chain()
                .focus()
                .insertContentAt(
                    { from: donde.desde, to: donde.hasta },
                    [
                        {
                            type: NODO_DE_MENCION,
                            attrs: {
                                tipo: quien.tipo,
                                refId: quien.refId,
                                etiqueta: quien.etiqueta,
                            },
                        },
                        // El espacio detras va a proposito: sin el, lo siguiente
                        // que se teclee se pega a la pastilla.
                        { type: "text", text: " " },
                    ],
                )
                .run();

            arrobaRef.current = null;
            setAbierto(false);
        },
        [editor],
    );

    /* ── El teclado ──────────────────────────────────────────────────────── */

    useEffect(() => {
        if (!abierto) return;
        const alTeclear = (evento: KeyboardEvent) => {
            // **Con la lista abierta manda la lista.** Al reves, elegir a
            // alguien mandaria el documento a medio escribir — aqui, meteria un
            // salto de linea en mitad de la mencion.
            if (evento.key === "ArrowDown") {
                evento.preventDefault();
                setElegido((n) => Math.min(n + 1, Math.max(ofrecidos.length - 1, 0)));
                return;
            }
            if (evento.key === "ArrowUp") {
                evento.preventDefault();
                setElegido((n) => Math.max(n - 1, 0));
                return;
            }
            if (evento.key === "Enter" || evento.key === "Tab") {
                if (ofrecidos[elegido]) {
                    evento.preventDefault();
                    meter(ofrecidos[elegido]);
                }
                return;
            }
            if (evento.key === "Escape") {
                evento.preventDefault();
                calladaRef.current = arrobaRef.current?.desde ?? null;
                setAbierto(false);
            }
        };
        document.addEventListener("keydown", alTeclear, true);
        return () => document.removeEventListener("keydown", alTeclear, true);
    }, [abierto, ofrecidos, elegido, meter]);

    /* ── Pulsar una pastilla ─────────────────────────────────────────────── */

    const alPulsar = useCallback(
        (evento: React.MouseEvent<HTMLDivElement>) => {
            if (!alPulsarMencion) return;
            const pastilla = (evento.target as HTMLElement).closest?.("[data-mencion]");
            if (!pastilla) return;
            const tipo = pastilla.getAttribute("data-tipo") as TipoDeMencion | null;
            const refId = pastilla.getAttribute("data-ref-id");
            if (tipo && refId) alPulsarMencion(tipo, refId);
        },
        [alPulsarMencion],
    );

    return (
        <div className="relative flex min-h-0 flex-1 flex-col" onClick={alPulsar}>
            <EditorDeTexto
                initialContent={(contenido as object) ?? undefined}
                onChange={alCambiar}
                editable={editable}
                extensiones={[NodoDeMencion]}
                alMontar={setEditor}
                placeholder="Escribe aquí. Con @ mencionas un cliente, una tarea, un ticket u otro documento."
            />

            {abierto && ofrecidos.length > 0 && (
                <div
                    className="absolute bottom-4 left-4 z-30 w-72 overflow-hidden rounded-lg border bg-popover shadow-lg"
                    // La lista se pinta POR ENCIMA de donde se escribe: debajo
                    // esta el borde de la ventana y no hay sitio para desplegar
                    // nada hacia abajo.
                >
                    <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
                        Mencionar…
                    </p>
                    <ul className="max-h-64 overflow-y-auto py-1">
                        {ofrecidos.map((quien, i) => (
                            <li key={`${quien.tipo}-${quien.refId}`}>
                                <button
                                    type="button"
                                    // **`onMouseDown`, nunca `onClick`.** El
                                    // `blur` del editor cierra la lista y llega
                                    // ANTES que el `click`: con `onClick` el
                                    // boton desaparece justo antes de que su
                                    // pulsacion llegue, y elegir con el raton no
                                    // hace nada.
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        meter(quien);
                                    }}
                                    onMouseEnter={() => setElegido(i)}
                                    className={cn(
                                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                                        i === elegido ? "bg-muted" : "hover:bg-muted/60",
                                    )}
                                >
                                    <span className="text-primary">{SENAL_DEL_TIPO[quien.tipo]}</span>
                                    <span className="min-w-0 flex-1 truncate">{quien.etiqueta}</span>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {NOMBRE_DEL_TIPO_DE_MENCION[quien.tipo]}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
