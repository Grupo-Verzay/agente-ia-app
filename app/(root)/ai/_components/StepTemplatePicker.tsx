"use client";

import { useRef, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    LayoutTemplate,
    Handshake,
    ScanSearch,
    Stethoscope,
    Gem,
    Scale,
    BadgeCheck,
    PackageCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    STEP_TEMPLATES,
    TEMPLATE_CATEGORIES,
    StepTemplate,
    TemplateCategory,
} from "./helpers/stepTemplates";

/* ── Metadatos por fase CADENA ── */
const CATEGORY_META: Record<TemplateCategory, { icon: React.ReactNode; color: string }> = {
    Conexión:     { icon: <Handshake className="h-3.5 w-3.5" />,    color: "text-blue-500" },
    Averiguación: { icon: <ScanSearch className="h-3.5 w-3.5" />,   color: "text-violet-500" },
    Diagnóstico:  { icon: <Stethoscope className="h-3.5 w-3.5" />,  color: "text-amber-500" },
    Exposición:   { icon: <Gem className="h-3.5 w-3.5" />,          color: "text-pink-500" },
    Negociación:  { icon: <Scale className="h-3.5 w-3.5" />,        color: "text-orange-500" },
    Acuerdo:      { icon: <BadgeCheck className="h-3.5 w-3.5" />,   color: "text-emerald-500" },
    Postventa:    { icon: <PackageCheck className="h-3.5 w-3.5" />, color: "text-sky-500" },
};

/* ── Convierte el texto con guiones en nodos legibles ── */
function renderContent(text: string) {
    const parts = text.split("\n");
    const nodes: React.ReactNode[] = [];
    let bullets: string[] = [];

    const flushBullets = () => {
        if (!bullets.length) return;
        nodes.push(
            <ul key={nodes.length} className="space-y-1 pl-1">
                {bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-foreground/75">
                        <span className="mt-0.5 shrink-0 text-muted-foreground">•</span>
                        <span>{b}</span>
                    </li>
                ))}
            </ul>
        );
        bullets = [];
    };

    parts.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("- ")) {
            bullets.push(trimmed.slice(2));
        } else {
            flushBullets();
            if (trimmed) {
                nodes.push(
                    <p key={nodes.length} className="text-sm text-foreground/75 leading-relaxed">
                        {trimmed}
                    </p>
                );
            }
        }
    });
    flushBullets();
    return nodes;
}

interface Props {
    label: string;
    onApply: (content: string) => void;
    disabled?: boolean;
    filterCategories?: TemplateCategory[];
}

export function StepTemplatePicker({ label, onApply, disabled, filterCategories }: Props) {
    const visibleCategories = filterCategories
        ? TEMPLATE_CATEGORIES.filter((c) => filterCategories.includes(c))
        : TEMPLATE_CATEGORIES;
    const visibleTemplates = filterCategories
        ? STEP_TEMPLATES.filter((t) => filterCategories.includes(t.category))
        : STEP_TEMPLATES;

    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<StepTemplate>(() => visibleTemplates[0] ?? STEP_TEMPLATES[0]);
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
        onApply(selected.content);
        setOpen(false);
    };

    const meta = CATEGORY_META[selected.category];

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
                <div className="flex" style={{ height: 380 }}>

                    {/* ── Lista izquierda ── */}
                    <div className="w-52 shrink-0 border-r overflow-y-auto bg-muted/20">
                        {visibleCategories.map((cat) => {
                            const group = visibleTemplates.filter((t) => t.category === cat);
                            if (!group.length) return null;
                            const catMeta = CATEGORY_META[cat];
                            return (
                                <div key={cat}>
                                    {/* Cabecera de categoría */}
                                    <div className={cn(
                                        "flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-widest sticky top-0 bg-muted/60 border-b",
                                        catMeta.color
                                    )}>
                                        {catMeta.icon}
                                        {cat}
                                    </div>

                                    {/* Items */}
                                    {group.map((t) => {
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
                                                <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                                                    {t.description}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Preview derecha ── */}
                    <div className="flex flex-col flex-1 min-w-0">

                        {/* Header */}
                        <div className="px-4 py-3 border-b bg-muted/10 shrink-0">
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold">{selected.name}</p>
                                <Badge
                                    variant="secondary"
                                    className={cn("text-xs gap-1 px-1.5", meta.color)}
                                >
                                    {meta.icon}
                                    {selected.category}
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                                {selected.description}
                            </p>
                        </div>

                        {/* Contenido con bullets formateados */}
                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                            {renderContent(selected.content)}
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-3 border-t bg-muted/10 shrink-0 flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                                Reemplaza el contenido actual del paso
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
