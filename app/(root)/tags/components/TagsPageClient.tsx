'use client';

import { useEffect, useMemo, useState } from 'react';
import { Kanban, Settings2, TrendingUp, X, Tag } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MetricCard } from '@/components/custom/MetricCard';
import { ModuleToolbar } from '@/components/shared/ModuleToolbar';
import { TagKanbanBoard } from './TagKanbanBoard';
import { SessionTagsManager } from './SessionTagsManager';
import type { SimpleTag } from '@/types/session';

const SCORE_RANGES = [
    { key: 'bajo',     label: 'Bajo',     range: '0–25',   color: '#EF4444' },
    { key: 'medio',    label: 'Medio',    range: '26–50',  color: '#F97316' },
    { key: 'moderado', label: 'Moderado', range: '51–75',  color: '#F59E0B' },
    { key: 'alto',     label: 'Alto',     range: '76–90',  color: '#22C55E' },
    { key: 'listo',    label: 'Listo',    range: '91–100', color: '#16A34A' },
] as const;

type ScoreKey = typeof SCORE_RANGES[number]['key'];
type View = 'kanban' | 'gestionar';

const DEFAULT_TAG_COLOR = '#64748B';

export function TagsPageClient({
    userId,
    allTags,
}: {
    userId: string;
    allTags: SimpleTag[];
}) {
    const [view, setView] = useState<View>('kanban');
    const [tags, setTags] = useState<SimpleTag[]>(allTags);

    // Sincronizar cuando el servidor retorna datos frescos (tras router.refresh())
    const allTagsKey = allTags.map(t => `${t.id}-${t.order}`).join(',');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { setTags(allTags); }, [allTagsKey]);
    const [selectedScoreRanges, setSelectedScoreRanges] = useState<Set<ScoreKey>>(new Set());
    const [scoreCounts, setScoreCounts] = useState<Record<string, number>>({});
    const [tagCounts, setTagCounts] = useState<Record<string, number>>({});

    // Top 4 etiquetas por conteo de contactos (los más relevantes)
    const topMetrics = useMemo(() => {
        const all = [
            { id: 'none', label: 'Sin etiqueta', color: DEFAULT_TAG_COLOR, count: tagCounts['none'] ?? 0 },
            ...tags.map((t) => ({
                id: String(t.id),
                label: t.name,
                color: t.color ?? DEFAULT_TAG_COLOR,
                count: tagCounts[t.id] ?? 0,
            })),
        ];
        return all.sort((a, b) => b.count - a.count).slice(0, 4);
    }, [tags, tagCounts]);

    const toggleScoreRange = (key: ScoreKey) => {
        setSelectedScoreRanges(new Set([key]));
    };

    return (
        <TooltipProvider delayDuration={120}>
            <div data-full-bleed className="flex h-full min-w-0 w-full flex-col gap-2">
                {/* Top 4 metric cards por conteo */}
                {view === 'kanban' && (
                    <div className="flex flex-wrap gap-3">
                        {topMetrics.map((m) => (
                            <div key={m.id} className="flex-1">
                                <MetricCard
                                    icon={<Tag className="h-4 w-4" />}
                                    label={m.label}
                                    value={m.count}
                                    helper={m.id === 'none' ? 'Contactos sin ninguna etiqueta asignada' : `Contactos con etiqueta "${m.label}"`}
                                    color={m.color}
                                />
                            </div>
                        ))}
                    </div>
                )}

                {/* Fila de toggle + score pills — igual que CRM */}
                <ModuleToolbar>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
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

                        {view === 'kanban' && (
                            <div className="flex items-center gap-2">
                                <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-1">
                                    {SCORE_RANGES.map((range) => {
                                        const active = selectedScoreRanges.has(range.key);
                                        const count = scoreCounts[range.key] ?? 0;
                                        return (
                                            <button
                                                key={range.key}
                                                type="button"
                                                title={`Score ${range.range}`}
                                                onClick={() => toggleScoreRange(range.key)}
                                                className="flex items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all"
                                                style={{
                                                    color: active ? range.color : undefined,
                                                    backgroundColor: active ? `${range.color}18` : undefined,
                                                    boxShadow: active ? `inset 0 0 0 1px ${range.color}60` : undefined,
                                                }}
                                            >
                                                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: range.color }} />
                                                {range.label}
                                                {count > 0 && (
                                                    <span
                                                        className="ml-1 rounded-full px-1 py-0 text-[10px] font-bold text-white"
                                                        style={{ backgroundColor: range.color }}
                                                    >
                                                        {count}
                                                    </span>
                                                )}
                                                {active && <X className="ml-0.5 h-2.5 w-2.5 opacity-60" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </ModuleToolbar>

                {/* Content */}
                {view === 'kanban' ? (
                    <div className="flex-1 min-h-0 flex flex-col">
                        <TagKanbanBoard
                            userId={userId}
                            initialTags={tags}
                            selectedScoreRanges={selectedScoreRanges}
                            onScoreCountsChange={setScoreCounts}
                            onTagCountsChange={setTagCounts}
                        />
                    </div>
                ) : (
                    <div
                        style={{ height: 'calc(100dvh - 130px)' }}
                        className="overflow-y-auto pr-1 pb-4"
                    >
                        <SessionTagsManager
                            userId={userId}
                            sessionId={0}
                            allTags={tags}
                            initialSelectedTagIds={[]}
                            hideSessionSection
                            onTagsChanged={setTags}
                        />
                    </div>
                )}
            </div>
        </TooltipProvider>
    );
}
