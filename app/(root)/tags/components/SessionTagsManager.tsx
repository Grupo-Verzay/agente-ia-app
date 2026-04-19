"use client";

import { useState, useTransition } from "react";
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
import { Tag as TagIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SortableTagList } from "./SortableTagList";
import { GenericDeleteDialog } from "@/components/shared/GenericDeleteDialog";

interface SessionTagsManagerProps {
    userId: string;
    sessionId: number;
    allTags: SimpleTag[];
    initialSelectedTagIds: number[];
}

const COLOR_PRESETS = [
    "#3B82F6", // azul
    "#22C55E", // verde
    "#F97316", // naranja
    "#EC4899", // rosa
    "#A855F7", // morado
    "#F59E0B", // amarillo
];

export const SessionTagsManager = ({
    userId,
    sessionId,
    allTags,
    initialSelectedTagIds,
}: SessionTagsManagerProps) => {
    const [isPending, startTransition] = useTransition();

    const [tags, setTags] = useState<SimpleTag[]>(allTags);
    const [selectedIds, setSelectedIds] = useState<number[]>(initialSelectedTagIds);

    const [newTagName, setNewTagName] = useState("");
    const [newTagColor, setNewTagColor] = useState<string | null>(null);

    // Edición de tag
    const [editingTagId, setEditingTagId] = useState<number | null>(null);
    const [editName, setEditName] = useState("");
    const [editColor, setEditColor] = useState<string | null>(null);

    // Eliminación con confirmación
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [tagToDelete, setTagToDelete] = useState<SimpleTag | null>(null);

    const isSelected = (id: number) => selectedIds.includes(id);

    const handleToggleTag = (tagId: number) => {
        const currentlySelected = isSelected(tagId);

        // Optimista
        setSelectedIds((prev) =>
            currentlySelected ? prev.filter((id) => id !== tagId) : [...prev, tagId]
        );

        startTransition(async () => {
            const res = currentlySelected
                ? await removeTagFromSessionAction({ userId, sessionId, tagId })
                : await assignTagToSessionAction({ userId, sessionId, tagId });

            if (!res.success) {
                // revertir optimista si falló
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
            const res = await createTagAction({
                userId,
                name: value,
                color: newTagColor,
            });

            if (!res.success || !res.data) {
                toast.error(res.message || "No se pudo crear la etiqueta.");
                return;
            }

            const newTag: SimpleTag = {
                id: res.data.id,
                name: res.data.name,
                slug: (res.data as any).slug,
                color: (res.data as any).color ?? null,
                order: (res.data as any).order ?? 0,
            };

            setTags((prev) => [...prev, newTag]);
            setNewTagName("");
            setNewTagColor(null);

            toast.success("Etiqueta creada", {
                description: `Se creó la etiqueta "${newTag.name}".`,
            });
        });
    };

    const startEditTag = (tag: SimpleTag) => {
        setEditingTagId(tag.id);
        setEditName(tag.name);
        setEditColor(tag.color ?? null);
    };

    const handleSaveEditTag = () => {
        if (!editingTagId) return;
        const value = editName.trim();
        if (!value) return;

        const tagId = editingTagId;

        startTransition(async () => {
            const res = await updateTagAction({
                id: tagId,
                userId,
                name: value,
                color: editColor,
            });

            if (!res.success || !res.data) {
                toast.error(res.message || "No se pudo actualizar la etiqueta.");
                return;
            }

            setTags((prev) =>
                prev.map((t) =>
                    t.id === tagId
                        ? {
                            ...t,
                            name: res.data!.name,
                            slug: (res.data as any).slug,
                            color: (res.data as any).color ?? null,
                        }
                        : t
                )
            );

            setEditingTagId(null);
            toast.success("Etiqueta actualizada", {
                description: `Se actualizó la etiqueta "${value}".`,
            });
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
            setTags((prev) => prev.filter((t) => t.id !== tagId));
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

    return (
        <>
            <div className="space-y-4 rounded-lg border bg-card p-4">
                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <TagIcon className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-semibold">Etiquetas de la sesión</h3>
                    </div>
                    {isPending && (
                        <span className="text-muted-foreground">Guardando...</span>
                    )}
                </div>

                {/* Tags asignados */}
                <div className="space-y-1">
                    <p className="font-medium text-muted-foreground">
                        Asignadas a esta sesión
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {tags.filter((t) => selectedIds.includes(t.id)).length === 0 ? (
                            <span className="text-muted-foreground">
                                Sin etiquetas asignadas.
                            </span>
                        ) : (
                            tags
                                .filter((t) => selectedIds.includes(t.id))
                                .map((tag) => (
                                    <Badge
                                        key={tag.id}
                                        className="flex items-center gap-1 rounded-full px-2 py-1"
                                    >
                                        {renderColorDot(tag.color)}
                                        {tag.name}
                                    </Badge>
                                ))
                        )}
                    </div>
                </div>

                <hr className="my-1 border-border/50" />

                {/* Crear nueva etiqueta */}
                <div className="space-y-2">
                    <p className="font-medium text-muted-foreground">
                        Crear nueva etiqueta
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                            placeholder="Nombre (ej: Lead, Prospecto...)"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            className="h-9"
                        />
                        {/* selector de color */}
                        <div className="flex items-center gap-2">
                            <div className="flex gap-1.5">
                                {COLOR_PRESETS.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={() =>
                                            setNewTagColor((current) =>
                                                current === color ? null : color
                                            )
                                        }
                                        className={cn(
                                            "h-6 w-6 rounded-full border border-border/60",
                                            newTagColor === color && "ring-2 ring-primary"
                                        )}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                            <Input
                                type="color"
                                value={newTagColor ?? "#3B82F6"}
                                onChange={(e) => setNewTagColor(e.target.value)}
                                className="h-9 w-12 cursor-pointer p-1"
                                title="Color personalizado"
                            />
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            className="h-9 px-4"
                            disabled={isPending || !newTagName.trim()}
                            onClick={handleCreateTag}
                        >
                            Añadir
                        </Button>
                    </div>
                </div>

                {/* Lista completa de etiquetas */}
                <div className="space-y-1">
                    <p className="font-medium text-muted-foreground">
                        Catálogo de etiquetas
                    </p>
                    {tags.length === 0 ? (
                        <span className="text-muted-foreground">
                            Aún no hay etiquetas creadas.
                        </span>
                    ) : (
                        <SortableTagList
                            tags={tags}
                            onReorder={setTags}
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
                            renderColorDot={renderColorDot}
                        />
                    )}
                </div>
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
        </>
    );
};