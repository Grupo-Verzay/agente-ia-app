"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Tag as TagIcon } from "lucide-react";
import {
    assignTagToSessionAction,
    removeTagFromSessionAction,
} from "@/actions/tag-actions";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { RELLENO_DEL_MENU } from "@/lib/paneles-flotantes";
import {
    CHULITO_AL_FINAL,
    FILA_DEL_MENU,
    FILA_PUESTA,
    GRUPO_SIN_SANGRIA,
    MARCA_DE_LA_FILA,
    NOMBRE_EN_LA_FILA,
    ROTULO_EN_EL_GRUPO,
} from "@/lib/filas-de-los-menus";
import { usePanelFlotante, type ClaseDePanel } from "@/hooks/usePanelFlotante";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { enGrupos, type Grupo } from "@/lib/personales";

type SimpleTag = {
    id: number;
    name: string;
    slug?: string;
    color?: string | null;
    sessionCount?: number | null;
    /** De la cuenta, de quien mira o de otro asesor. Lo decide el servidor. */
    grupo?: Grupo;
};

interface SessionTagsComboboxProps {
    userId: string;
    sessionId: number;
    allTags: SimpleTag[];
    initialSelectedIds: number[];
    onSelectedIdsChange?: (selectedIds: number[]) => void;
    /**
     * Dónde nace el panel cuando lo pinta la cabecera de Chats.
     *
     * Va con su valor de siempre por defecto (`undefined`) porque este
     * combobox lo pintan además el CRM y la tabla de `/sessions`, y allí no hay
     * ninguna cabecera de conversación contra la que medir: unificar Chats no
     * puede moverles el panel a dos pantallas que nadie pidió tocar.
     *
     * Y es además lo que marca «esta es la de la cabecera» para lo de DENTRO
     * —el nombre en mayúscula y el sangrado que lo cuadra con el menú de
     * Etapas, en `lib/filas-de-los-menus.ts`—, para que no haya una segunda
     * condición que decida lo mismo por otro lado. Fuera de Chats las filas se
     * quedan exactamente como estaban.
     */
    panel?: ClaseDePanel;
}

export function SessionTagsCombobox({
    userId,
    sessionId,
    allTags,
    initialSelectedIds,
    onSelectedIdsChange,
    panel,
}: SessionTagsComboboxProps) {
    const [open, setOpen] = useState(false);
    const colocacion = usePanelFlotante(panel ?? "columnaDerecha", "popover");
    const [selectedIds, setSelectedIds] = useState<number[]>(initialSelectedIds);
    const [isPending, startTransition] = useTransition();
    const normalizedInitialSelectedIds = useMemo(
        () => [...initialSelectedIds].sort((a, b) => a - b),
        [initialSelectedIds]
    );

    useEffect(() => {
        setSelectedIds(normalizedInitialSelectedIds);
    }, [normalizedInitialSelectedIds]);

    const isSelected = (id: number) => selectedIds.includes(id);

    const handleToggleTag = (tagId: number) => {
        const currentlySelected = isSelected(tagId);
        const nextSelectedIds = currentlySelected
            ? selectedIds.filter((id) => id !== tagId)
            : [...selectedIds, tagId];

        setSelectedIds(nextSelectedIds);
        onSelectedIdsChange?.(nextSelectedIds);

        startTransition(async () => {
            const res = currentlySelected
                ? await removeTagFromSessionAction({ userId, sessionId, tagId })
                : await assignTagToSessionAction({ userId, sessionId, tagId });

            if (!res.success) {
                const revertedSelectedIds = currentlySelected
                    ? [...nextSelectedIds, tagId]
                    : nextSelectedIds.filter((id) => id !== tagId);

                setSelectedIds(revertedSelectedIds);
                onSelectedIdsChange?.(revertedSelectedIds);
                toast.error(res.message || "No se pudo actualizar las etiquetas.");
                return;
            }

            toast.success(res.message || "Etiquetas actualizadas.");
        });
    };

    const summaryLabel = (): React.ReactNode => {
        if (selectedIds.length === 0) {
            return (
                <span className="flex items-center gap-1 truncate">
                    <TagIcon className="h-3 w-3 opacity-70" />
                </span>
            );
        }

        const selectedTags = allTags.filter((tag) => selectedIds.includes(tag.id));
        if (selectedTags.length === 0) {
            return (
                <span className="flex items-center gap-1 truncate">
                    <TagIcon className="h-3 w-3 opacity-70" />
                </span>
            );
        }

        const maxVisible = 5;
        const visible = selectedTags.slice(0, maxVisible);
        const remaining = selectedTags.length - visible.length;

        return (
            <span className="flex items-center truncate">
                {visible.map((tag) => (
                    <span
                        key={tag.id}
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background/60"
                    >
                        <TagIcon
                            className="h-2.5 w-2.5"
                            style={tag.color ? { color: tag.color } : undefined}
                        />
                        <span className="sr-only">{tag.name}</span>
                    </span>
                ))}

                {remaining > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                        +{remaining}
                    </span>
                )}
            </span>
        );
    };

    return (
        <Popover
            open={open}
            onOpenChange={(v) => {
                setOpen(v);
                if (panel) colocacion.alAbrir(v);
            }}
        >
            <PopoverTrigger asChild ref={panel ? colocacion.disparador : undefined}>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="h-7 justify-between px-2 text-xs border-indigo-300 bg-indigo-100 text-indigo-800 hover:bg-indigo-200 hover:text-indigo-900"
                    // En Chats se abre aunque la linea no tenga etiquetas: un
                    // boton apagado no dice por que, y el panel vacio si.
                    disabled={isPending || (allTags.length === 0 && !panel)}
                >
                    <span className="flex items-center gap-1 truncate">
                        <span className="truncate">{summaryLabel()}</span>
                    </span>
                </Button>
            </PopoverTrigger>

            {/* En Chats va al filo derecho del área de conversación y a la
                misma altura que los otros cinco paneles de la fila. Fuera de
                Chats se queda EXACTAMENTE como estaba: `align="start"`. */}
            <PopoverContent
                className={panel ? `w-60 ${RELLENO_DEL_MENU}` : "w-60 p-0"}
                {...(panel ? colocacion.props : { align: "start" as const })}
            >
                <Command>
                    <CommandInput placeholder="Buscar etiqueta..." className="h-8 text-xs" />
                    <CommandList>
                        <CommandEmpty className="text-xs">
                            {allTags.length === 0
                                ? "Esta línea no tiene etiquetas creadas."
                                : "No se encontraron etiquetas."}
                        </CommandEmpty>
                        <div className="max-h-64 overflow-auto">
                        {enGrupos(allTags).map((grupo) => (
                        <CommandGroup
                            key={grupo.grupo}
                            heading={grupo.titulo ?? undefined}
                            className={panel ? cn(GRUPO_SIN_SANGRIA, ROTULO_EN_EL_GRUPO) : undefined}
                        >
                            {grupo.filas.map((tag) => {
                                const active = isSelected(tag.id);
                                const count = tag.sessionCount ?? 0;

                                return (
                                    <CommandItem
                                        key={tag.id}
                                        onSelect={() => handleToggleTag(tag.id)}
                                        className={cn(
                                            "flex items-center justify-between gap-2 text-xs",
                                            panel && FILA_DEL_MENU,
                                            // El gris suave, el mismo con el que el
                                            // menu de Etapas marca la suya. Va
                                            // DESPUES del `hover`, que es ese mismo
                                            // gris: apuntar a una puesta no le
                                            // cambia nada.
                                            panel && active && FILA_PUESTA,
                                        )}
                                    >
                                        <div className="flex min-w-0 items-center gap-2">
                                            {/* La marca de color abre la fila, y es
                                                lo PRIMERO que se ve: el chulito
                                                invisible que iba aqui reservaba su
                                                hueco igual (`opacity-0` no libera
                                                sitio) y metia 24 px de sangria que
                                                el menu de Etapas no tiene. Fuera de
                                                Chats —el CRM, /sessions— la fila se
                                                queda EXACTAMENTE como estaba. */}
                                            {panel ? (
                                                <span
                                                    className={MARCA_DE_LA_FILA}
                                                    style={tag.color ? { backgroundColor: tag.color } : undefined}
                                                />
                                            ) : (
                                                <>
                                                    <Check
                                                        className={cn(
                                                            "h-3 w-3",
                                                            active ? "opacity-100" : "opacity-0",
                                                        )}
                                                    />

                                                    <TagIcon
                                                        className="h-3 w-3 shrink-0"
                                                        style={tag.color ? { color: tag.color } : undefined}
                                                    />
                                                </>
                                            )}

                                            <span
                                                className={panel ? NOMBRE_EN_LA_FILA : "truncate"}
                                                title={panel ? tag.name : undefined}
                                            >
                                                {tag.name}
                                            </span>
                                        </div>

                                        {panel ? (
                                            <div className="flex shrink-0 items-center gap-1.5">
                                                <Badge
                                                    variant="outline"
                                                    className="shrink-0 px-1.5 py-0.5 text-[10px] leading-none"
                                                >
                                                    {count}
                                                </Badge>
                                                {/* Al FINAL, donde un hueco reservado
                                                    no mueve nada de la izquierda: con
                                                    varias etiquetas puestas a la vez
                                                    es lo que deja recorrer la lista y
                                                    ver cuales. */}
                                                <Check
                                                    className={cn(
                                                        CHULITO_AL_FINAL,
                                                        active ? "opacity-100" : "opacity-0",
                                                    )}
                                                />
                                            </div>
                                        ) : (
                                            <Badge
                                                variant="outline"
                                                className="shrink-0 px-1.5 py-0.5 text-[10px] leading-none"
                                            >
                                                {count}
                                            </Badge>
                                        )}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                        ))}
                        </div>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
