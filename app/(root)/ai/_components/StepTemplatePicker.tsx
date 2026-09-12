"use client";

import { useRef, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEP_TEMPLATES, StepTemplate } from "./helpers/stepTemplates";

interface Props {
    label: string;
    onApply: (plantilla: StepTemplate) => void;
    disabled?: boolean;
}

/**
 * El botón "Plantillas" de cada bloque.
 *
 * Las tres se disparan igual —por el título que el cliente le ponga al bloque— y
 * se diferencian en qué hace al activarse, así que la lista va plana: nombre y
 * una línea de qué hace. Antes estaban agrupadas por fase de venta, con
 * cabeceras e iconos, que era una clasificación que ya no significa nada.
 *
 * El texto se muestra tal cual, con su formato: son tablas y condiciones, y
 * reacomodarlo en viñetas haría que en la vista previa se lea distinto de lo que
 * termina pegado en el bloque.
 */
export function StepTemplatePicker({ label, onApply, disabled }: Props) {
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<StepTemplate>(STEP_TEMPLATES[0]);
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
        onApply(selected);
        setOpen(false);
    };

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

            {/* Siempre hacia abajo.
                Cuando el bloque queda en la parte baja de la pantalla, el panel
                se daba vuelta y se abría hacia arriba, tapando el bloque y
                dejando la lista fuera de vista: se elegía a ciegas. Se prefiere
                que baje aunque haya que bajar la página. */}
            <PopoverContent
                className="p-0 overflow-hidden"
                style={{ width: popoverWidth }}
                align="start"
                alignOffset={alignOffset}
                side="bottom"
                sideOffset={4}
                avoidCollisions={false}
                collisionPadding={12}
            >
                {/* El alto se acota al HUECO REAL que hay debajo del boton, no a
                    `60vh`.
                    `vh` mide la ventana, no lo que queda entre el boton y el
                    borde de abajo. Con el bloque en la parte baja —y sobre todo
                    cuando es el ULTIMO paso, que ya no hay nada mas que
                    desplazar— el panel se salia por debajo y **Aplicar**, que va
                    pegado a su borde inferior, quedaba fuera de la pantalla: se
                    elegia la plantilla y no habia forma de aplicarla.
                    Radix mide ese hueco y lo publica en
                    `--radix-popover-content-available-height`. Es la misma regla
                    que ya siguen los menus de Chats (ver CLAUDE.md).
                    Sin suelo a proposito: si solo caben 150 px, mejor un panel
                    de 150 px con todo dentro —las dos columnas ya se desplazan
                    solas y el pie es `shrink-0`— que uno de 380 con el boton
                    inalcanzable. */}
                <div
                    className="flex"
                    style={{
                        height:
                            "min(380px, var(--radix-popover-content-available-height, 60vh))",
                    }}
                >

                    {/* ── Lista ── */}
                    <div className="w-52 shrink-0 border-r overflow-y-auto bg-muted/20">
                        {STEP_TEMPLATES.map((t) => {
                            const isSelected = selected.id === t.id;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setSelected(t)}
                                    className={cn(
                                        "w-full text-left px-3 py-2.5 border-b border-muted/40 transition-colors",
                                        isSelected
                                            ? "bg-primary/10 border-l-2 border-l-primary"
                                            : "hover:bg-muted/50"
                                    )}
                                >
                                    <p className={cn(
                                        "text-sm leading-snug",
                                        isSelected ? "font-semibold text-primary" : "font-medium"
                                    )}>
                                        {t.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-3">
                                        {t.description}
                                    </p>
                                </button>
                            );
                        })}
                    </div>

                    {/* ── Vista previa ── */}
                    <div className="flex flex-col flex-1 min-w-0">
                        {/* Recortada a proposito: el nombre y la descripcion ya
                            se leen enteros en la lista de la izquierda, asi que
                            aqui repetirlos a tamano completo solo le quitaba
                            sitio a la vista previa —que es lo que se viene a
                            mirar— y empujaba el pie hacia abajo. */}
                        <div className="px-4 py-2 border-b bg-muted/10 shrink-0">
                            <p className="text-sm font-semibold leading-snug">{selected.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                                {selected.description}
                            </p>
                        </div>

                        <div className="flex-1 overflow-auto px-4 py-3">
                            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/75">
                                {selected.content}
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
                </div>
            </PopoverContent>
        </Popover>
    );
}
