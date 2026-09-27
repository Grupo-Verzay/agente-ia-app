"use client";

import { memo } from "react";
import { Archive, Check, Download, Mail, MailOpen, MoreVertical, Paperclip, Pin, PinOff, Star, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InsigniaDeLinea } from "@/components/shared/InsigniaDeLinea";
// La hora de la fila es LA de Chats: la hora si es de hoy, «Ayer», el día de
// la semana dentro de la semana y la fecha en adelante.
import { formatTimeFromEpoch } from "@/app/(root)/chats/_components/chat-sidebar.utils";
import { TIPOGRAFIA_DEL_NOMBRE } from "@/lib/nombre-del-contacto";
import { cn } from "@/lib/utils";
import { esCorreoNuevo, lasInicialesDelRemitente, type CorreoDeLaBandeja } from "@/lib/correo";

/**
 * Una fila de la bandeja, con la anatomía de la fila de un chat
 * (`ChatContactItem`): el círculo con las iniciales —que al pasar el ratón se
 * vuelve la casilla de seleccionar, y en modo selección es la casilla—, el
 * contenido, y a la derecha lo que se hace sobre la fila.
 *
 * # Lo de la derecha va EN EL FLUJO, nunca encima
 *
 * Archivar y eliminar salían en una caja `absolute` en la esquina, y al pasar
 * el ratón **tapaban la hora y la marca de la cuenta**: justo lo que se mira
 * para decidir si abrir el correo. Ahora son como la estrella de Chats: miden
 * cero mientras no se pasa el ratón y, al pasarlo, **ocupan su sitio**, así que
 * el contenido se estrecha —el remitente se recorta con «…»— y la hora y la
 * marca siguen a la vista, porque son `shrink-0`. El «⋯» se ve siempre, como
 * en Chats.
 *
 * # Debajo del asunto, las marcas de la fila
 *
 * «Nuevo» (sin leer y del último día, `esCorreoNuevo`) y, en la bandeja
 * unificada, la marca del buzón del que llegó —la MISMA de Chats,
 * `InsigniaDeLinea`—. «Nuevo» tiene la misma caja que la insignia (relleno,
 * interlineado y letra de 9 px), así que las dos miden lo mismo de alto.
 */

/** El chip «Nuevo»: la caja de `InsigniaDeLinea` con el color del «sin leer». */
export const CHIP_NUEVO =
    "flex shrink-0 items-center rounded bg-primary/10 px-1 py-0.5 text-[9px] font-semibold leading-3 text-primary";

/**
 * Los botones que aparecen al pasar el ratón: miden CERO y no reservan sitio
 * (el `-ml-2` anula el hueco de la fila), y al pasar el ratón ocupan el suyo.
 * La receta de la estrella de Chats.
 */
const APARECE_AL_PASAR =
    "w-0 -ml-2 opacity-0 group-hover:ml-0 group-hover:w-7 group-hover:opacity-100 group-focus-within:ml-0 group-focus-within:w-7 group-focus-within:opacity-100";

export type AccionesDeLaFila = {
    alAbrir: (c: CorreoDeLaBandeja) => void;
    alAlternarSeleccion: (c: CorreoDeLaBandeja) => void;
    alArchivar: (c: CorreoDeLaBandeja) => void;
    alEliminar: (c: CorreoDeLaBandeja) => void;
    alAnclar: (c: CorreoDeLaBandeja, valor: boolean) => void;
    alDestacar: (c: CorreoDeLaBandeja, valor: boolean) => void;
    alMarcarNoLeido: (c: CorreoDeLaBandeja) => void;
    alExportar: (c: CorreoDeLaBandeja) => void;
};

export const FilaDeCorreo = memo(function FilaDeCorreo({
    correo: c,
    llave,
    abierto,
    anclado,
    seleccionado,
    modoSeleccion,
    enArchivo,
    buzon,
    ahora,
    acciones,
}: {
    correo: CorreoDeLaBandeja;
    llave: string;
    abierto: boolean;
    anclado: boolean;
    seleccionado: boolean;
    modoSeleccion: boolean;
    /** Se mira la carpeta de archivo: no hay «Archivar» que ofrecer. */
    enArchivo: boolean;
    /** El buzón del que llegó, SOLO en la bandeja unificada (con uno solo sería repetir su nombre). */
    buzon: { clave: string; nombre: string; palabra: string } | null;
    ahora: number;
    acciones: AccionesDeLaFila;
}) {
    const nuevo = esCorreoNuevo(c, ahora);
    const remitente = c.de || c.deDireccion || "(sin remitente)";
    const hora = c.fecha ? formatTimeFromEpoch(Date.parse(c.fecha)) : "";
    const hayChips = nuevo || Boolean(buzon);
    return (
        <div
            role="listitem"
            data-correo-fila={c.id}
            data-llave={llave}
            data-buzon={c.buzonId}
            data-anclado={anclado ? "" : undefined}
            data-destacado={c.destacado ? "" : undefined}
            data-seleccionado={seleccionado ? "" : undefined}
            className={cn(
                "group rounded-xl border p-2 transition hover:bg-accent hover:text-accent-foreground",
                abierto && !modoSeleccion ? "border-primary bg-primary/10" : "border-transparent",
                modoSeleccion && seleccionado && "border-primary/40 bg-primary/5",
            )}
        >
            <div className="flex items-start gap-2">
                {/* El círculo y la casilla, en UN botón, como en Chats. */}
                <button
                    type="button"
                    data-casilla-de-la-fila
                    aria-pressed={seleccionado}
                    aria-label={seleccionado ? "Quitar de la selección" : "Seleccionar este correo"}
                    onClick={(e) => {
                        e.stopPropagation();
                        acciones.alAlternarSeleccion(c);
                    }}
                    className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    <Avatar
                        className={cn(
                            "h-10 w-10 ring-2 ring-background transition-opacity group-hover:ring-accent",
                            modoSeleccion ? "opacity-30" : "group-hover:opacity-30",
                        )}
                    >
                        <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                            {lasInicialesDelRemitente(c.de || c.deDireccion)}
                        </AvatarFallback>
                    </Avatar>
                    <span
                        className={cn(
                            "absolute inset-0 flex items-center justify-center rounded-full transition-opacity",
                            modoSeleccion ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                        )}
                    >
                        <span
                            className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
                                seleccionado ? "border-primary bg-primary" : "border-muted-foreground/50 bg-background/80",
                            )}
                        >
                            {seleccionado && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                        </span>
                    </span>
                </button>

                <button
                    type="button"
                    data-abrir-correo
                    onClick={() => (modoSeleccion ? acciones.alAlternarSeleccion(c) : acciones.alAbrir(c))}
                    className="flex min-w-0 flex-1 items-start text-left"
                >
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                                {anclado ? <Pin data-marca-anclado className="h-3.5 w-3.5 shrink-0 fill-current text-amber-500" aria-label="Anclado" /> : null}
                                {c.destacado ? (
                                    <Star data-marca-destacado className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Destacado" />
                                ) : null}
                                <span
                                    className={cn(TIPOGRAFIA_DEL_NOMBRE, "!normal-case min-w-0 truncate", c.sinLeer && "text-foreground")}
                                    title={c.deDireccion}
                                >
                                    {remitente}
                                </span>
                            </div>
                            <span
                                data-hora-de-la-fila
                                className="shrink-0 text-xs text-muted-foreground"
                                suppressHydrationWarning
                                title={c.fecha ? new Date(c.fecha).toLocaleString("es") : undefined}
                            >
                                {hora}
                            </span>
                        </div>

                        <div className="mt-0.5 flex items-center justify-between gap-2">
                            <span className={cn("min-w-0 truncate text-sm", c.sinLeer ? "font-semibold text-foreground" : "text-muted-foreground")}>
                                {c.asunto || "(sin asunto)"}
                                {c.fragmento ? <span className="font-normal text-muted-foreground"> · {c.fragmento}</span> : null}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                                {c.conAdjuntos ? <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Con adjuntos" /> : null}
                                {c.sinLeer ? <span data-sin-leer className="inline-block h-2 w-2 rounded-full bg-primary" aria-label="Sin leer" /> : null}
                            </span>
                        </div>

                        {hayChips ? (
                            <div data-chips-de-la-fila className="mt-1 flex min-w-0 items-center gap-1">
                                {nuevo ? (
                                    <span data-chip-nuevo className={CHIP_NUEVO}>
                                        Nuevo
                                    </span>
                                ) : null}
                                {buzon ? <InsigniaDeLinea clave={buzon.clave} nombre={buzon.nombre} palabra={buzon.palabra} /> : null}
                            </div>
                        ) : null}
                    </div>
                </button>

                {/* Lo de la derecha, EN EL FLUJO (ver arriba). Escondido en modo
                    selección, como en Chats: ahí se actúa desde la barra. */}
                {!modoSeleccion ? (
                    <div data-acciones-de-la-fila className="flex shrink-0 items-center gap-1 has-[[data-state=open]]:[&>*]:ml-0 has-[[data-state=open]]:[&>*]:w-7 has-[[data-state=open]]:[&>*]:opacity-100">
                        {!enArchivo ? (
                            <button
                                type="button"
                                aria-label="Archivar correo"
                                title="Archivar"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    acciones.alArchivar(c);
                                }}
                                className={cn(
                                    "flex h-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-muted-foreground transition-all hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200",
                                    APARECE_AL_PASAR,
                                )}
                            >
                                <Archive className="h-3.5 w-3.5 shrink-0" />
                            </button>
                        ) : null}
                        <button
                            type="button"
                            aria-label="Eliminar correo"
                            title="Eliminar"
                            onClick={(e) => {
                                e.stopPropagation();
                                acciones.alEliminar(c);
                            }}
                            className={cn(
                                "flex h-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-muted-foreground transition-all hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950",
                                APARECE_AL_PASAR,
                            )}
                        >
                            <Trash2 className="h-3.5 w-3.5 shrink-0" />
                        </button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 rounded-full"
                                    aria-label="Más acciones de este correo"
                                    title="Más acciones de este correo"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                                {c.sinLeer ? (
                                    <DropdownMenuItem onSelect={() => acciones.alAbrir(c)}>
                                        <MailOpen className="mr-2 h-4 w-4" />
                                        Abrir y marcar como leído
                                    </DropdownMenuItem>
                                ) : (
                                    <DropdownMenuItem onSelect={() => acciones.alMarcarNoLeido(c)}>
                                        <Mail className="mr-2 h-4 w-4" />
                                        Marcar como no leído
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onSelect={() => acciones.alDestacar(c, !c.destacado)}>
                                    <Star className={cn("mr-2 h-4 w-4", c.destacado && "fill-amber-400 text-amber-500")} />
                                    {c.destacado ? "Quitar destacado" : "Destacar"}
                                </DropdownMenuItem>
                                {!enArchivo ? (
                                    <DropdownMenuItem onSelect={() => acciones.alAnclar(c, !anclado)}>
                                        {anclado ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
                                        {anclado ? "Desanclar" : "Anclar arriba"}
                                    </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem onSelect={() => acciones.alExportar(c)}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Exportar este correo
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => acciones.alAlternarSeleccion(c)}>
                                    <Check className="mr-2 h-4 w-4" />
                                    Seleccionar
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ) : null}
            </div>
        </div>
    );
});
