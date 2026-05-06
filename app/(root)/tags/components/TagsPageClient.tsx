'use client';

import { useState } from 'react';
import { Kanban, Settings2 } from 'lucide-react';
import { TagKanbanBoard } from './TagKanbanBoard';
import { SessionTagsManager } from './SessionTagsManager';
import type { SimpleTag } from '@/types/session';

type View = 'kanban' | 'gestionar';

export function TagsPageClient({
    userId,
    allTags,
}: {
    userId: string;
    allTags: SimpleTag[];
}) {
    const [view, setView] = useState<View>('kanban');
    const [tags, setTags] = useState<SimpleTag[]>(allTags);

    return (
        <div className="flex h-full min-w-0 w-full flex-col gap-3">
            {/* View toggle */}
            <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1 w-fit">
                <button
                    type="button"
                    onClick={() => setView('kanban')}
                    className={[
                        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                        view === 'kanban'
                            ? 'bg-background shadow-sm text-foreground'
                            : 'text-muted-foreground hover:text-foreground',
                    ].join(' ')}
                >
                    <Kanban className="h-3.5 w-3.5" />
                    Kanban
                </button>
                <button
                    type="button"
                    onClick={() => setView('gestionar')}
                    className={[
                        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                        view === 'gestionar'
                            ? 'bg-background shadow-sm text-foreground'
                            : 'text-muted-foreground hover:text-foreground',
                    ].join(' ')}
                >
                    <Settings2 className="h-3.5 w-3.5" />
                    Gestionar
                </button>
            </div>

            {/* Content */}
            {view === 'kanban' ? (
                <div className="flex-1 min-h-0 flex flex-col">
                    <TagKanbanBoard userId={userId} initialTags={tags} />
                </div>
            ) : (
                <SessionTagsManager
                    userId={userId}
                    sessionId={0}
                    allTags={tags}
                    initialSelectedTagIds={[]}
                    hideSessionSection
                    onTagsChanged={setTags}
                />
            )}
        </div>
    );
}
