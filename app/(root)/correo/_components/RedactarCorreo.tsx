"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Loader2, SendIcon, SquarePen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BotonesDeLaDerecha, ZonaDeHerramientas, useBarraCompacta } from "@/components/shared/BarraDeEscribir";
import { AttachmentMenu } from "@/app/(root)/chats/_components/attachment-menu";
import { CAJA_DEL_MANDO, TONO_DEL_MANDO } from "@/lib/mandos-del-correo";
import { cn } from "@/lib/utils";
import { BOTON_DE_ENVIAR, FILA_DE_LA_BARRA, MARCO_DE_LA_BARRA } from "@/lib/barra-de-escribir";
import {
    CABECERA_DEL_PANEL,
    CLASE_HUECO_ENTRE_CONTROLES,
    CONTROL_DE_ICONO,
    FILA_1_DEL_PANEL,
    FILA_2_DEL_PANEL,
    GLIFO_DE_CONTROL,
    LINEA_DEL_ESTADO,
    LINEA_DEL_NOMBRE,
} from "@/lib/cabeceras-de-chats";
import { RECORTE_A_LO_ANCHO, TIPOGRAFIA_DEL_NOMBRE } from "@/lib/nombre-del-contacto";
import { TOPE_DEL_ASUNTO, hayAlgoEnElCorreoNuevo } from "@/lib/correo";
import type { BuzonVisible } from "@/lib/correo-db";
import { enviarCorreoNuevoAction } from "@/actions/correo-actions";
import { AdjuntosParaEnviar, ControlDeLaFirma, useAdjuntosParaEnviar } from "./PiezasDeEscribir";

/**
 * Redactar un correo NUEVO. Va en el MISMO sitio y con la MISMA anatomía que
 * un correo abierto (`LecturaDelCorreo`), para que pasar de leer a escribir no
 * mueva nada:
 *
 *   cabecera del panel (78 px) → los destinatarios → el cuerpo → la barra
 *
 * - La cabecera es `CABECERA_DEL_PANEL`: arriba «Correo nuevo» y el mando de
 *   descartar (con el tono de «eliminar»); abajo DESDE QUÉ buzón sale, que se
 *   elige cuando la persona tiene más de uno.
 * - «Para» y «Asunto» ocupan la franja donde el correo abierto enseña «Para» y
 *   «Cc».
 * - El cuerpo ocupa el hueco del correo abierto: aquí se escribe mucho más que
 *   en una respuesta, así que no es la caja de una línea de la barra.
 * - La barra es la de responder: la firma y el clip con las MISMAS piezas
 *   (`PiezasDeEscribir`), y la flecha azul a la derecha.
 *
 * Qué buzón manda lo decide el servidor igual que al responder: el id viaja y
 * se busca con la persona en el WHERE.
 */
const MANDO = cn(CONTROL_DE_ICONO, CAJA_DEL_MANDO);
const VOLVER = cn(
    CONTROL_DE_ICONO,
    "w-7 shrink-0 rounded-md border border-input bg-background p-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
);

export function RedactarCorreo({
    buzones,
    buzonInicial,
    alCerrar,
    alCambiarFirma,
}: {
    /** Los buzones de la persona, para elegir desde cuál sale. */
    buzones: BuzonVisible[];
    buzonInicial: string;
    alCerrar: () => void;
    alCambiarFirma: (buzonId: string, firma: string | null, activa: boolean) => void;
}) {
    const [buzonId, setBuzonId] = useState(buzonInicial);
    const buzon = buzones.find((b) => b.id === buzonId) ?? buzones[0];
    const [para, setPara] = useState("");
    const [asunto, setAsunto] = useState("");
    const [texto, setTexto] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [herramientas, setHerramientas] = useState(false);
    const { compacta, medir } = useBarraCompacta();
    const caja = useRef<HTMLTextAreaElement>(null);
    const cerrarHerramientas = useCallback(() => setHerramientas(false), []);
    const { adjuntos, adjuntar, pegar, quitar, paraEnviar } = useAdjuntosParaEnviar(cerrarHerramientas);

    const hayAlgoQueEnviar = hayAlgoEnElCorreoNuevo({ para, asunto, texto, adjuntos: adjuntos.length });

    async function enviar() {
        if (!buzon || !hayAlgoQueEnviar || enviando) return;
        setEnviando(true);
        try {
            const r = await enviarCorreoNuevoAction(buzon.id, para, asunto, texto, paraEnviar());
            if (!r.success) {
                toast.error(r.message);
                return;
            }
            toast.success(r.para.length > 1 ? `Correo enviado a ${r.para.length} destinatarios.` : `Correo enviado a ${r.para[0]}.`);
            alCerrar();
        } catch {
            toast.error("No se pudo enviar. Revisa la conexión.");
        } finally {
            setEnviando(false);
        }
    }

    const alTeclear = (e: React.KeyboardEvent) => {
        // Como al responder: Enter es un salto de línea; se manda con Ctrl+Enter.
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void enviar();
        }
    };

    if (!buzon) return null;
    const conectables = buzones.filter((b) => b.estado !== "reconectar");

    return (
        <div data-redactar-correo className="flex h-full min-h-0 w-full flex-col">
            <div data-cabecera-del-correo className={CABECERA_DEL_PANEL}>
                <div className={FILA_1_DEL_PANEL}>
                    <Button variant="ghost" size="icon" className={cn(VOLVER, "md:hidden")} aria-label="Volver" onClick={alCerrar}>
                        <ArrowLeft className={GLIFO_DE_CONTROL} />
                    </Button>
                    <span
                        aria-hidden
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                    >
                        <SquarePen className={GLIFO_DE_CONTROL} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col justify-center">
                        <span className={cn(TIPOGRAFIA_DEL_NOMBRE, RECORTE_A_LO_ANCHO, LINEA_DEL_NOMBRE, "!normal-case text-sm")}>Correo nuevo</span>
                        <span className={cn(RECORTE_A_LO_ANCHO, LINEA_DEL_ESTADO, "text-muted-foreground")} title={buzon.direccion}>
                            Desde {buzon.direccion}
                        </span>
                    </div>
                    <div data-mandos-del-correo className={cn("flex shrink-0 items-center", CLASE_HUECO_ENTRE_CONTROLES)}>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Descartar el correo"
                            title="Descartar"
                            onClick={alCerrar}
                            disabled={enviando}
                            data-mando-del-correo="eliminar"
                            className={cn(MANDO, TONO_DEL_MANDO.eliminar)}
                        >
                            <Trash2 className={GLIFO_DE_CONTROL} />
                        </Button>
                    </div>
                </div>
                <div className={FILA_2_DEL_PANEL}>
                    <span className="shrink-0 text-xs text-muted-foreground">De:</span>
                    {buzones.length > 1 ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    data-desde-que-buzon
                                    aria-label="Desde qué correo se envía"
                                    className="flex min-w-0 items-center gap-1 rounded-md px-1 text-sm font-semibold hover:bg-muted"
                                >
                                    <span className="truncate">{buzon.direccion}</span>
                                    <ChevronDown className="h-3 w-3 shrink-0" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                {conectables.map((b) => (
                                    <DropdownMenuItem key={b.id} data-buzon={b.id} onSelect={() => setBuzonId(b.id)}>
                                        {b.direccion}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <span className="min-w-0 truncate text-sm font-semibold">{buzon.direccion}</span>
                    )}
                </div>
            </div>
            <div data-destinatarios className="shrink-0 border-b border-border px-3 text-sm">
                <label className="flex items-center gap-2 border-b border-border/60">
                    <span className="w-14 shrink-0 text-xs text-muted-foreground">Para</span>
                    <Input
                        value={para}
                        onChange={(e) => setPara(e.target.value)}
                        onKeyDown={alTeclear}
                        placeholder="correo@ejemplo.com, otro@ejemplo.com"
                        aria-label="Para"
                        className="h-9 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
                        autoFocus
                        disabled={enviando}
                    />
                </label>
                <label className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-xs text-muted-foreground">Asunto</span>
                    <Input
                        value={asunto}
                        onChange={(e) => setAsunto(e.target.value)}
                        onKeyDown={alTeclear}
                        maxLength={TOPE_DEL_ASUNTO}
                        placeholder="Asunto"
                        aria-label="Asunto"
                        className="h-9 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
                        disabled={enviando}
                    />
                </label>
            </div>
            <div className="min-h-0 flex-1">
                <Textarea
                    ref={caja}
                    data-cuerpo-del-correo-nuevo
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onPaste={(e) => void pegar(e)}
                    onKeyDown={alTeclear}
                    placeholder="Escribe tu mensaje"
                    aria-label="Mensaje"
                    disabled={enviando}
                    className="h-full w-full resize-none rounded-none border-0 bg-white px-4 py-3 text-base leading-relaxed shadow-none focus-visible:ring-0 dark:bg-gray-950 sm:text-sm"
                />
            </div>
            <div ref={medir} data-barra="escribir" data-barra-del-correo className={cn(MARCO_DE_LA_BARRA, "bg-gray-50 dark:bg-gray-900")}>
                <AdjuntosParaEnviar adjuntos={adjuntos} alQuitar={quitar} />
                <div className={FILA_DE_LA_BARRA}>
                    <ZonaDeHerramientas
                        compacta={compacta}
                        abierta={herramientas}
                        alAlternar={() => setHerramientas((v) => !v)}
                        fijo={<ControlDeLaFirma key="firma" buzon={buzon} alCambiarFirma={(f, a) => alCambiarFirma(buzon.id, f, a)} />}
                    >
                        <div className={cn(compacta ? "block" : "sm:hidden")}>
                            <ControlDeLaFirma buzon={buzon} alCambiarFirma={(f, a) => alCambiarFirma(buzon.id, f, a)} />
                        </div>
                        <AttachmentMenu onComposeMediaChange={adjuntar} maxBase64MB={25} />
                    </ZonaDeHerramientas>
                    {/* Mide lo que la caja de una respuesta con una línea: 44 px en un teléfono
                        (su letra es mayor) y 40 desde `sm`. */}
                    <p className="min-h-11 min-w-0 flex-1 truncate pr-10 text-xs leading-[2.75rem] text-muted-foreground sm:min-h-10 sm:leading-10">
                        Ctrl+Enter para enviar
                    </p>
                    <BotonesDeLaDerecha
                        compacta={compacta}
                        conVoz={false}
                        conNota={false}
                        hayDictado={false}
                        dictando={false}
                        grabando={false}
                        hayAlgoQueEnviar={hayAlgoQueEnviar}
                        menuAbierto={false}
                        alAlternarMenu={() => {}}
                        dictado={null}
                        enviar={{
                            alPulsar: () => void enviar(),
                            deshabilitado: !hayAlgoQueEnviar || enviando,
                            etiqueta: "Enviar correo",
                            titulo: "Enviar correo (Ctrl+Enter)",
                            clase: cn(BOTON_DE_ENVIAR, "disabled:opacity-100"),
                            icono: enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white" /> : <SendIcon className="h-3.5 w-3.5 text-white" />,
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
