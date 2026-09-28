"use client";

import type { ReactNode } from "react";
import { AlignLeft, FileText } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FORMATOS_DE_EXPORTACION, type FormatoDeExportacion } from "@/lib/formatos-de-exportacion";
import { PANEL_QUE_SE_DESPLAZA, RELLENO_DEL_MENU, suelto } from "@/lib/paneles-flotantes";
import { cn } from "@/lib/utils";

/**
 * Las opciones de «Exportar»: PDF o texto plano. **Una sola pieza** para los
 * tres sitios que exportan conversaciones —el menú «Acciones» de la cabecera
 * (dentro de su submenú), la barra de acciones en lote y CRM › Calidad—: la
 * lista sale de `FORMATOS_DE_EXPORTACION` y el dibujo de cada opción de aquí.
 * Con una copia en cada sitio, el día que se añada un formato saldría en uno y
 * en los otros no.
 */
const ICONO: Record<FormatoDeExportacion, typeof FileText> = { pdf: FileText, txt: AlignLeft };

export function OpcionesDeExportar({ onElegir }: { onElegir: (formato: FormatoDeExportacion) => void }) {
    return (
        <>
            {FORMATOS_DE_EXPORTACION.map((f) => {
                const Icono = ICONO[f.clave];
                return (
                    <DropdownMenuItem
                        key={f.clave}
                        data-formato-de-exportacion={f.clave}
                        onSelect={() => onElegir(f.clave)}
                        className="flex cursor-pointer items-start gap-2"
                    >
                        <Icono className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="flex min-w-0 flex-col">
                            <span>{f.rotulo}</span>
                            <span className="text-[11px] leading-tight text-muted-foreground">{f.detalle}</span>
                        </span>
                    </DropdownMenuItem>
                );
            })}
        </>
    );
}

/**
 * El mismo menú, suelto: para un botón de exportar que no vive dentro de otro
 * menú. Se coloca como todo lo flotante suelto (`suelto`: mide el hueco y
 * elige el lado donde cabe). El disparador lo pone quien lo usa —cada sitio conserva su botón de
 * siempre— y al pulsarlo se elige el formato en vez de exportar directo.
 */
export function MenuDeExportar({
    children,
    onElegir,
    align = "end",
}: {
    children: ReactNode;
    onElegir: (formato: FormatoDeExportacion) => void;
    align?: "start" | "end";
}) {
    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent {...suelto("menu", "bottom", align)} className={cn("w-60", RELLENO_DEL_MENU, PANEL_QUE_SE_DESPLAZA)} data-menu-de-exportar>
                <OpcionesDeExportar onElegir={onElegir} />
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
