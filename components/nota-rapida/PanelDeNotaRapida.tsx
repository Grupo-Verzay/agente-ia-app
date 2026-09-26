"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NotebookPen, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PanelLateral } from "@/components/shared/PanelLateral";
import { PANEL_DE_LA_NOTA_RAPIDA } from "@/lib/panel-lateral";
import { sePuedeMandarAlModulo } from "@/lib/nota-rapida";
import { useNotaRapida } from "@/hooks/useNotaRapida";
import { cn } from "@/lib/utils";

/**
 * El panel de la nota rápida: un papel, y nada más.
 *
 * # Por qué es un `<textarea>` y no el editor de la casa
 *
 * Porque lo que se apunta aquí se apunta con el cliente hablando al otro lado.
 * El editor de Notas trae su barra de formato, sus listas y sus bloques: en una
 * franja de 18 rem eso es la mitad del alto ocupado por mandos que nadie va a
 * usar para escribir «llamar el martes, pide factura a nombre de la esposa». El
 * texto plano además es lo que hace barato el guardado automático — ver
 * `lib/nota-rapida.ts`.
 *
 * Cuando lo apuntado deja de ser un recado, el botón del pie lo manda a Notas y
 * ahí sí tiene su editor, su carpeta y su título.
 *
 * # El pie es del PANEL y sale siempre
 *
 * Con la nota vacía, cargando o con un fallo encima. El botón de enviar se
 * APAGA cuando no hay nada que mandar, no se esconde: un mando que aparece y
 * desaparece mueve de sitio al de al lado justo cuando se va a pulsar.
 */
export function PanelDeNotaRapida({
    abierto,
    onCerrar,
}: {
    abierto: boolean;
    onCerrar: () => void;
}) {
    const { texto, escribir, estado, cargando, aviso, recortada, mandarAlModulo } =
        useNotaRapida(abierto);
    const router = useRouter();
    // En ESTADO y no en una referencia: un botón que no cambia hasta que vuelve
    // la respuesta es un botón que se pulsa cinco veces. Es la regla de
    // «que se vea que se pulsó».
    const [mandando, ponerMandando] = useState(false);

    const puedeMandar = sePuedeMandarAlModulo(texto) && !cargando && !mandando;

    const mandar = async () => {
        if (mandando) return;
        ponerMandando(true);
        try {
            const r = await mandarAlModulo();
            if (!r.success) {
                toast.error(r.message ?? "No se pudo guardar en Notas.");
                return;
            }
            // Lo que se dice no es «listo»: es qué se guardó y dónde. El papel
            // se acaba de vaciar, así que sin eso parece que se perdió.
            toast.success(`Se guardó en Notas: ${r.titulo}`, {
                // Con el enrutador y no con `location.assign`: recargar la
                // plataforma entera para ir a una pantalla se lleva por delante
                // lo que hubiera abierto —una reunión plegada, una llamada—.
                action: { label: "Ver en Notas", onClick: () => router.push("/notas") },
            });
        } finally {
            ponerMandando(false);
        }
    };

    return (
        <PanelLateral
            id={PANEL_DE_LA_NOTA_RAPIDA}
            abierto={abierto}
            onCerrar={onCerrar}
            titulo="Nota rápida"
            etiquetaDeCerrar="Cerrar la nota rápida"
            icono={<NotebookPen className="h-4 w-4" />}
            subtitulo={<LoQuePasa estado={estado} cargando={cargando} aviso={aviso} />}
            cuerpoPropio
            pie={
                <>
                    <Link
                        href="/notas"
                        className="min-w-0 truncate pl-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        data-enlace-a-notas
                    >
                        Ver todas mis notas
                    </Link>
                    <Button
                        type="button"
                        size="sm"
                        className="shrink-0"
                        disabled={!puedeMandar}
                        onClick={mandar}
                        data-mandar-a-notas
                    >
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                        {mandando ? "Enviando…" : "Enviar a Notas"}
                    </Button>
                </>
            }
        >
            <textarea
                value={texto}
                onChange={(e) => escribir(e.target.value)}
                disabled={cargando}
                spellCheck
                placeholder="Apunta lo que no se te puede olvidar. Se guarda sola."
                aria-label="Nota rápida"
                data-caja-de-la-nota
                className={cn(
                    // Llena el panel y se desplaza por dentro: el pie se queda
                    // abajo pase lo que pase, que es para lo que existe.
                    "min-h-0 flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-relaxed",
                    "outline-none placeholder:text-muted-foreground",
                    "disabled:cursor-progress disabled:opacity-60",
                )}
            />
            {recortada && (
                <p className="shrink-0 px-3 pb-2 text-xs text-amber-600" data-aviso-de-recorte>
                    La nota llegó a su tope y se recortó. Lo que no cabe va mejor en Notas.
                </p>
            )}
        </PanelLateral>
    );
}

/**
 * En qué anda el guardado, en el subtítulo de la cabecera.
 *
 * Va ahí y no en un aviso que se va: quien vuelve un minuto después tiene que
 * poder saber si lo que escribió quedó guardado. Y un fallo se queda puesto —es
 * lo único de esta pantalla que hay que leer— con lo que hay que hacer al lado:
 * seguir escribiendo lo reintenta.
 */
function LoQuePasa({
    estado,
    cargando,
    aviso,
}: {
    estado: string;
    cargando: boolean;
    aviso: string | null;
}) {
    if (cargando) return <span data-estado="cargando">Abriendo la nota…</span>;
    if (estado === "fallo") {
        return (
            <span className="text-destructive" data-estado="fallo">
                {aviso ?? "No se pudo guardar."} Sigue escribiendo para reintentarlo.
            </span>
        );
    }
    if (estado === "guardando") return <span data-estado="guardando">Guardando…</span>;
    if (estado === "guardado") return <span data-estado="guardado">Guardada</span>;
    return <span data-estado="inactivo">Solo tú la ves. Se guarda sola.</span>;
}
