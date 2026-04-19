"use client";

import { SimpleTag } from "@/types/session";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TagFilterBarProps {
    allTags: SimpleTag[];
    selectedTagIds: number[];
    onChangeSelected: (ids: number[]) => void;
}

export const TagFilterBar = ({
    allTags,
    selectedTagIds,
    onChangeSelected,
}: TagFilterBarProps) => {
    const toggleTag = (id: number) => {
        if (selectedTagIds.includes(id)) {
            onChangeSelected(selectedTagIds.filter((tId) => tId !== id));
        } else {
            onChangeSelected([...selectedTagIds, id]);
        }
    };

    const clear = () => onChangeSelected([]);

    if (!allTags.length) return null;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* Botón "Todas" para limpiar filtro */}
            <button
                type="button"
                onClick={clear}
                className={cn(
                    "px-2 py-1 rounded-full border transition text-xs font-semibold",
                    selectedTagIds.length === 0
                        ? "bg-primary text-white border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                )}
            >
                Todas
            </button>

            {allTags.map((tag) => {
                const isActive = selectedTagIds.includes(tag.id);
                return (
                    <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                    >
                        <Badge
                            variant={isActive ? "default" : "outline"}
                            className={cn(
                                "px-2 py-1 rounded-full cursor-pointer flex items-center gap-1"
                            )}
                            style={
                                isActive && tag.color
                                    ? {
                                        backgroundColor: tag.color,
                                        borderColor: tag.color,
                                        color: "#fff",
                                    }
                                    : undefined
                            }
                        >
                            {tag.name}
                        </Badge>
                    </button>
                );
            })}
        </div>
    );
};
