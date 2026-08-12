"use client";

import { useRef, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { LayoutTemplate } from "lucide-react";
import { STEP_TEMPLATES } from "./helpers/stepTemplates";

interface Props {
    label: string;
    onApply: (content: string) => void;
    disabled?: boolean;
}

/**
 * El botón "Plantillas" de cada bloque.
 *
 * Antes esto era un catálogo de dos paneles: a la izquierda dieciséis plantillas
 * agrupadas por fase de venta, a la derecha la vista previa de la elegida. Al
 * quedar una sola plantilla, elegir sobra: se muestra directamente lo que se va
 * a aplicar.
 *
 * El texto se muestra tal cual, con su formato: son tablas y condiciones, y
 * reacomodarlo en viñetas haría que en la vista previa se lea distinto de lo que
 * termina pegado en el bloque.
 */
export function StepTemplatePicker({ label, onApply, disabled }: Props) {
    const plantilla = STEP_TEMPLATES[0];

    const [open, setOpen] = useState(false);
    const [popoverWidth, setPopoverWidth] = useState(520);
    const [alignOffset, setAlignOffset] = useState(0);
    const anchorRef = useRef<HTMLDivElement>(null);

    const handleOpenChange = (o: boolean) => {
        if (o && anchorRef.current) {
            const anchorRect = anchorRef.current.getBoundingClientRect();
            let width = anchorRef.current.offsetWidth;
            let leftDiff = 0;
            let el: HTMLElement | null = anchorRef.current.parentElement;
            for (let i = 0; i < 6; i++) {
                if (!el) break;
                if (el.offsetWidth >= width + 30) {
                    const parentRect = el.getBoundingClientRect();
                    leftDiff = anchorRect.left - parentRect.left;
                    width = el.offsetWidth;
                    break;
                }
                el = el.parentElement;
            }
            setPopoverWidth(width);
            setAlignOffset(-leftDiff);
        }
        setOpen(o);
    };

    const handleApply = () => {
        onApply(plantilla.content);
        setOpen(false);
    };

    if (!plantilla) {
        return (
            <div className="flex items-center justify-between">
                <label className="text-sm font-semibold">{label}</label>
            </div>
        );
    }

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverAnchor asChild>
                <div ref={anchorRef} className="flex items-center justify-between">
                    <label className="text-sm font-semibold">{label}</label>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={disabled}
                            className="h-6 gap-1.5 px-2.5 text-xs font-medium text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 hover:border-primary/30 transition-colors rounded-md"
                        >
                            <LayoutTemplate className="h-3.5 w-3.5" />
                            Plantillas
                        </Button>
                    </PopoverTrigger>
                </div>
            </PopoverAnchor>

            <PopoverContent
                className="p-0 overflow-hidden"
                style={{ width: popoverWidth }}
                align="start"
                alignOffset={alignOffset}
                side="bottom"
                sideOffset={4}
            >
                <div className="flex flex-col" style={{ height: 380 }}>

                    <div className="px-4 py-3 border-b bg-muted/10 shrink-0">
                        <p className="text-sm font-semibold">{plantilla.name}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {plantilla.description}
                        </p>
                    </div>

                    <div className="flex-1 overflow-auto px-4 py-3">
                        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/75">
                            {plantilla.content}
                        </pre>
                    </div>

                    <div className="px-4 py-3 border-t bg-muted/10 shrink-0 flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                            Reemplaza el contenido actual del bloque
                        </p>
                        <Button size="sm" onClick={handleApply} className="gap-1.5 shrink-0">
                            <LayoutTemplate className="h-3.5 w-3.5" />
                            Aplicar
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
