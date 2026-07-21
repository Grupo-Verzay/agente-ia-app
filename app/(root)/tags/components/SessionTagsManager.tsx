"use client";

import { useState, useMemo, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
    assignTagToSessionAction,
    removeTagFromSessionAction,
    createTagAction,
    deleteTagAction,
    updateTagAction,
} from "@/actions/tag-actions";
import { SimpleTag } from "@/types/session";
import { Tag as TagIcon, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SortableTagList } from "./SortableTagList";
import { GenericDeleteDialog } from "@/components/shared/GenericDeleteDialog";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";

interface SessionTagsManagerProps {
    userId: string;
    sessionId: number;
    allTags: SimpleTag[];
    initialSelectedTagIds: number[];
    hideSessionSection?: boolean;
    compact?: boolean;
    onTagsChanged?: (tags: SimpleTag[]) => void;
}

const COLOR_PRESETS = [
    "#3B82F6",
    "#22C55E",
    "#F97316",
    "#EC4899",
    "#A855F7",
    "#F59E0B",
];

const DEFAULT_COLOR = "#64748B";

export const SessionTagsManager = ({
    userId,
    sessionId,
    allTags,
    initialSelectedTagIds,
    hideSessionSection = false,
    compact = false,
    onTagsChanged,
}: SessionTagsManagerProps) => {
    const [isPending, startTransition] = useTransition();
    const [tags, setTags] = useState<SimpleTag[]>(allTags);
    const [selectedIds, setSelectedIds] = useState<number[]>(initialSelectedTagIds);

    const [newTagName, setNewTagName] = useState("");
    const [newTagColor, setNewTagColor] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [search, setSearch] = useState("");

    const [editingTagId, setEditingTagId] = useState<number | null>(null);
    const [editName, setEditName] = useState("");
    const [editColor, setEditColor] = useState<string | null>(null);

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [tagToDelete, setTagToDelete] = useState<SimpleTag | null>(null);

    const filteredTags = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;
    }, [tags, search]);

    const isSelected = (id: number) => selectedIds.includes(id);

    const handleToggleTag = (tagId: number) => {
        const currentlySelected = isSelected(tagId);
        setSelectedIds((prev) =>
            currentlySelected ? prev.filter((id) => id !== tagId) : [...prev, tagId]
        );
        startTransition(async () => {
            const res = currentlySelected
                ? await removeTagFromSessionAction({ userId, sessionId, tagId })
                : await assignTagToSessionAction({ userId, sessionId, tagId });
            if (!res.success) {
                setSelectedIds((prev) =>
                    currentlySelected ? [...prev, tagId] : prev.filter((id) => id !== tagId)
                );
                toast.error(res.message || "No se pudo actualizar la etiqueta.");
            } else {
                toast.success(res.message || "Etiquetas actualizadas.");
            }
        });
    };

    const handleCreateTag = () => {
        const value = newTagName.trim();
        if (!value) return;
        startTransition(async () => {
            const res = await createTagAction({ userId, name: value, color: newTagColor });
            if (!res.success || !res.data) {
                toast.error(res.message || "No se pudo crear la etiqueta.");
                return;
            }
            const newTag: SimpleTag = {
                id: res.data.id,
                name: res.data.name,
                slug: res.data.slug,
                color: res.data.color ?? null,
                order: res.data.order ?? 0,
            };
            setTags((prev) => {
                const next = [...prev, newTag];
                onTagsChanged?.(next);
                return next;
            });
            setNewTagName("");
            setNewTagColor(null);
            setIsCreating(false);
            toast.success("Etiqueta creada", { description: `Se creo la etiqueta "${newTag.name}".` });
        });
    };

    const startEditTag = (tag: SimpleTag) => {
        setEditingTagId(tag.id);
        setEditName(tag.name.toUpperCase());
        setEditColor(tag.color ?? null);
    };

    const handleSaveEditTag = () => {
        if (!editingTagId) return;
        const value = editName.trim();
        if (!value) return;
        const tagId = editingTagId;
        startTransition(async () => {
            const res = await updateTagAction({ id: tagId, userId, name: value, color: editColor });
            if (!res.success || !res.data) {
                toast.error(res.message || "No se pudo actualizar la etiqueta.");
                return;
            }
            setTags((prev) => {
                const next = prev.map((t) =>
                    t.id === tagId
                        ? { ...t, name: res.data!.name, slug: res.data!.slug, color: res.data!.color ?? null }
                        : t
                );
                onTagsChanged?.(next);
                return next;
            });
            setEditingTagId(null);
            toast.success("Etiqueta actualizada");
        });
    };

    const openDeleteDialog = (tag: SimpleTag) => {
        setTagToDelete(tag);
        setDeleteDialogOpen(true);
    };

    const deleteTagMutationFn = async (id: string) => {
        const tagId = parseInt(id);
        const res = await deleteTagAction({ id: tagId, userId });
        if (res.success) {
            setTags((prev) => {
                const next = prev.filter((t) => t.id !== tagId);
                onTagsChanged?.(next);
                return next;
            });
            setSelectedIds((prev) => prev.filter((sid) => sid !== tagId));
            setTagToDelete(null);
        }
        return { success: res.success, message: res.message || "" };
    };

    const renderColorDot = (color?: string | null) => (
        <span
            className="inline-block h-2.5 w-2.5 rounded-full border border-border/60"
            style={color ? { backgroundColor: color } : {}}
        />
    );

    // GESTIONAR VIEW
    if (hideSessionSection) {
        return (
            <div className="flex flex-col gap-3">
                {/* Toolbar */}
                <ModuleToolbar>
                    <div className="relative w-full min-w-0 sm:w-72">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Buscar etiqueta..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-9 pl-9 pr-3"
                        />
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                            setIsCreating(true);
                            setNewTagName("");
                            setNewTagColor(null);
                        }}
                    >
                        <Plus className="h-4 w-4" />
                        Crear etiqueta
                    </Button>
                </ModuleToolbar>

                {/* Inline create form */}
                {isCreating && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 px-4 py-3">
                        <div className="flex flex-1 min-w-[180px] items-center gap-2">
                            <div
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                                style={{ backgroundColor: (newTagColor ?? DEFAULT_COLOR) + "25" }}
                            >
                                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: newTagColor ?? DEFAULT_COLOR }} />
                            </div>
                            <Input
                                autoFocus
                                placeholder="Nombre de la etiqueta..."
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value.toUpperCase())}
                                className="h-9"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleCreateTag();
                                    if (e.key === "Escape") setIsCreating(false);
                                }}
                            />
                        </div>
                        <div className="flex items-center gap-1.5">
                            {COLOR_PRESETS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setNewTagColor((prev) => (prev === c ? null : c))}
                                    className={cn(
                                        "h-5 w-5 rounded-full border border-border/60",
                                        newTagColor === c && "ring-2 ring-primary"
                                    )}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                            <Input
                                type="color"
                                value={newTagColor ?? "#3B82F6"}
                                onChange={(e) => setNewTagColor(e.target.value)}
                                className="h-9 w-12 cursor-pointer p-1"
                                title="Color personalizado"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1 px-3"
                                onClick={() => setIsCreating(false)}
                            >
                                <X className="h-3.5 w-3.5" />
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                className="h-8 px-4"
                                disabled={isPending || !newTagName.trim()}
                                onClick={handleCreateTag}
                            >
                                Guardar
                            </Button>
                        </div>
                    </div>
                )}

                {/* Tag list */}
                {filteredTags.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                            <TagIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="font-medium">
                            {search ? "Sin resultados" : "Sin etiquetas"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {search
                                ? `No hay etiquetas que coincidan con "${search}"`
                                : "Crea tu primera etiqueta con el boton de arriba."}
                        </p>
                    </div>
                ) : (
                    <SortableTagList
                        tags={filteredTags}
                        onReorder={(reordered) => {
                            setTags(reordered);
                            onTagsChanged?.(reordered);
                        }}
                        editingTagId={editingTagId}
                        editName={editName}
                        editColor={editColor}
                        isPending={isPending}
                        onEditName={setEditName}
                        onEditColor={setEditColor}
                        onSaveEdit={handleSaveEditTag}
                        onCancelEdit={() => setEditingTagId(null)}
                        onStartEdit={startEditTag}
                        onDelete={openDeleteDialog}
                    />
                )}

                <GenericDeleteDialog
                    open={deleteDialogOpen}
                    setOpen={(open) => {
                        setDeleteDialogOpen(open);
                        if (!open) setTagToDelete(null);
                    }}
                    itemName={tagToDelete?.name}
                    itemId={tagToDelete?.id ?? 0}
                    mutationFn={deleteTagMutationFn}
                    entityLabel="etiqueta"
                />
            </div>
        );
    }

    // SESSION PANEL VIEW
    return (
        <div>
            <div className={cn("overflow-hidden rounded-lg border", compact && "text-sm")}>
                <div className={cn("space-y-3 bg-muted/60 p-4", compact && "p-3")}>
                    <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-3">
                        <div className="flex items-center gap-2">
                            <TagIcon className="h-4 w-4 text-muted-foreground" />
                            <h3 className="font-semibold">Etiquetas de la sesion</h3>
                        </div>
                        {isPending && <span className="text-xs text-muted-foreground">Guardando...</span>}
                    </div>

                    <div>
                        <p className="mb-1.5 text-sm font-medium text-muted-foreground">Asignadas a esta sesion</p>
                        <div className="flex flex-wrap gap-1.5">
                            {tags.filter((t) => selectedIds.includes(t.id)).length === 0 ? (
                                <span className="text-sm text-muted-foreground">Sin etiquetas asignadas.</span>
                            ) : (
                                tags.filter((t) => selectedIds.includes(t.id)).map((tag) => (
                                    <Badge key={tag.id} className="flex items-center gap-1 rounded-full px-2 py-1">
                                        {renderColorDot(tag.color)}
                                        {tag.name}
                                    </Badge>
                                ))
                            )}
                        </div>
                        <hr className="mt-3 border-border/50" />
                    </div>

                    <label className="flex cursor-text items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
                        <Input
                            placeholder="Crear nueva etiqueta (ej: Lead, Prospecto...)"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value.toUpperCase())}
                            className="h-8 flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                        />
                        <div className="flex shrink-0 items-center gap-1.5">
                            {COLOR_PRESETS.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => setNewTagColor((c) => (c === color ? null : color))}
                                    className={cn(
                                        "h-5 w-5 rounded-full border border-border/60",
                                        newTagColor === color && "ring-2 ring-primary"
                                    )}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                            <Input
                                type="color"
                                value={newTagColor ?? "#3B82F6"}
                                onChange={(e) => setNewTagColor(e.target.value)}
                                className="h-8 w-10 cursor-pointer border-0 bg-transparent p-1 shadow-none"
                                title="Color personalizado"
                            />
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            className="h-8 shrink-0 px-4"
                            disabled={isPending || !newTagName.trim()}
                            onClick={handleCreateTag}
                        >
                            Añadir
                        </Button>
                    </label>
                </div>

                {!compact && (
                    <div className="bg-card p-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Todas las etiquetas
                        </p>
                        {tags.length === 0 ? (
                            <span className="text-sm text-muted-foreground">Aun no hay etiquetas creadas.</span>
                        ) : (
                            <div className="flex flex-wrap gap-1.5">
                                {tags.map((tag) => (
                                    <button
                                        key={tag.id}
                                        type="button"
                                        onClick={() => handleToggleTag(tag.id)}
                                        className={cn(
                                            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium transition-all",
                                            isSelected(tag.id)
                                                ? "border-primary/30 bg-primary/10 text-primary"
                                                : "border-border/60 bg-background text-foreground hover:bg-muted"
                                        )}
                                    >
                                        {renderColorDot(tag.color)}
                                        {tag.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <GenericDeleteDialog
                open={deleteDialogOpen}
                setOpen={(open) => {
                    setDeleteDialogOpen(open);
                    if (!open) setTagToDelete(null);
                }}
                itemName={tagToDelete?.name}
                itemId={tagToDelete?.id ?? 0}
                mutationFn={deleteTagMutationFn}
                entityLabel="etiqueta"
            />
        </div>
    );
};
