"use client";

import { ChevronDown, Check } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { usePanelFlotante } from "@/hooks/usePanelFlotante";
import { PANEL_QUE_SE_DESPLAZA, RELLENO_DEL_MENU } from "@/lib/paneles-flotantes";

/**
 * El selector de «qué se mira»: el de canales de Chats («Todos ▾») y el de
 * bandejas de Correo («Todas ▾»).
 *
 * Vivía escrito dentro de `ChatSearchBar`, y Correo tenía un `<select>` nativo
 * para la misma pregunta —otro alto, otro borde, y una lista que pinta el
 * sistema operativo—. Ahora lo pintan los dos desde aquí: el botón redondo con
 * el rótulo y su flecha, y el panel con su título, la fila de «todos», la raya
 * y una fila por opción, con su número y la marca de la elegida.
 *
 * Dónde NACE el panel lo decide `usePanelFlotante("columnaAncha")`, igual que
 * los demás filtros de la columna de Chats: quien lo monte tiene que estar
 * dentro de una caja con `MARCA_DE_LA_COLUMNA`.
 */

export type OpcionDelSelector = {
    valor: string;
    etiqueta: string;
    /** Una segunda línea, en pequeño (la empresa de una línea, el proveedor de un buzón). */
    detalle?: string | null;
    /**
     * El número de la fila. Sin él no se pinta: «sin número» es «no se sabe»,
     * no cero. Un cero de verdad se pasa como `0` y se enseña.
     */
    cuenta?: number;
};

export function SelectorDeCanal({
    titulo,
    todos,
    opciones,
    valor,
    alCambiar,
    ariaLabel,
}: {
    /** El rótulo pequeño de arriba del panel: «Canales», «Bandejas». */
    titulo: string;
    /** La fila de «todos»: su rótulo y, si se sabe, su número. */
    todos: { etiqueta: string; cuenta?: number };
    opciones: OpcionDelSelector[];
    /** `null` = todos. */
    valor: string | null;
    alCambiar: (valor: string | null) => void;
    ariaLabel?: string;
}) {
    const panel = usePanelFlotante("columnaAncha", "menu");
    const activa = opciones.find((o) => o.valor === valor);
    const rotulo = activa ? activa.etiqueta : todos.etiqueta;

    return (
        <DropdownMenu onOpenChange={panel.alAbrir}>
            <DropdownMenuTrigger asChild ref={panel.disparador}>
                <button
                    type="button"
                    title={rotulo}
                    aria-label={ariaLabel ? `${ariaLabel}: ${rotulo}` : undefined}
                    data-selector-de-canal
                    className="inline-flex h-8 min-w-[56px] max-w-[104px] items-center gap-0.5 rounded-full px-2 text-sm font-semibold tracking-tight text-foreground transition-colors hover:bg-accent sm:gap-1 sm:px-2.5"
                >
                    <span className="min-w-0 flex-1 truncate text-left">{rotulo}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
            </DropdownMenuTrigger>
            {/* El ancho común, colgado de su botón y justo DEBAJO de la raya de
                la cabecera: lo decide `usePanelFlotante` (`columnaAncha`). El
                scroll es el de siempre —la lista crece con las opciones— y su
                tope, el hueco de verdad y no `vh`. */}
            <DropdownMenuContent {...panel.props} className={cn(RELLENO_DEL_MENU, PANEL_QUE_SE_DESPLAZA)}>
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {titulo}
                </p>
                <DropdownMenuItem
                    data-opcion-del-selector=""
                    onSelect={() => alCambiar(null)}
                    className="flex items-center justify-between gap-2 cursor-pointer"
                >
                    <span className="text-xs font-medium">{todos.etiqueta}</span>
                    <div className="flex items-center gap-1.5">
                        {todos.cuenta !== undefined && (
                            <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                                {todos.cuenta}
                            </span>
                        )}
                        {valor === null && <Check className="h-3.5 w-3.5 text-primary" />}
                    </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {opciones.map((o) => {
                    const esLa = valor === o.valor;
                    return (
                        <DropdownMenuItem
                            key={o.valor}
                            data-opcion-del-selector={o.valor}
                            onSelect={() => alCambiar(o.valor)}
                            className="flex items-center justify-between gap-2 cursor-pointer"
                        >
                            <div className="flex min-w-0 flex-col">
                                <span className={cn("truncate text-xs", esLa && "font-medium text-primary")}>{o.etiqueta}</span>
                                {o.detalle && o.detalle !== o.etiqueta && (
                                    <span className="truncate text-[10px] text-muted-foreground">{o.detalle}</span>
                                )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                                {o.cuenta !== undefined && (
                                    <span
                                        className={cn(
                                            "rounded-full px-1.5 py-px text-[10px] font-semibold",
                                            esLa ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                                        )}
                                    >
                                        {o.cuenta}
                                    </span>
                                )}
                                {esLa && <Check className="h-3.5 w-3.5 text-primary" />}
                            </div>
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
