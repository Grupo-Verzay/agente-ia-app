'use client';

import { useState, useEffect, useMemo } from 'react';
import { Session } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Filter, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    getCampaignSegmentData,
    type SegmentTag,
    type SegmentScore,
    type SegmentSessionTag,
} from '@/actions/campaign-segment-action';

const STATUS_OPTIONS = [
    { value: 'FRIO',       label: '❄️ Frío',       cls: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300' },
    { value: 'TIBIO',      label: '🌡️ Tibio',      cls: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300' },
    { value: 'CALIENTE',   label: '🔥 Caliente',   cls: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300' },
    { value: 'FINALIZADO', label: '✅ Finalizado', cls: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300' },
    { value: 'DESCARTADO', label: '🗑️ Descartado', cls: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-400' },
];

interface CampaignSegmentPanelProps {
    leads: Session[];
    onApply: (matching: Session[]) => void;
}

export function CampaignSegmentPanel({ leads, onApply }: CampaignSegmentPanelProps) {
    const [expanded, setExpanded] = useState(false);
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
    const [minScore, setMinScore] = useState(0);
    const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

    const [scoreMap, setScoreMap] = useState<Map<number, number | null>>(new Map());
    const [sessionTagMap, setSessionTagMap] = useState<Map<number, number[]>>(new Map());
    const [tags, setTags] = useState<SegmentTag[]>([]);

    useEffect(() => {
        getCampaignSegmentData().then(({ scores, sessionTags, tags }) => {
            setScoreMap(new Map(scores.map((s: SegmentScore) => [s.id, s.lead_score])));
            const stm = new Map<number, number[]>();
            for (const st of sessionTags as SegmentSessionTag[]) {
                const arr = stm.get(st.sessionId) ?? [];
                arr.push(st.tagId);
                stm.set(st.sessionId, arr);
            }
            setSessionTagMap(stm);
            setTags(tags);
        });
    }, []);

    const hasFilters = selectedStatuses.length > 0 || minScore > 0 || selectedTagIds.length > 0;

    const matching = useMemo(() => {
        return leads.filter(lead => {
            if (selectedStatuses.length > 0) {
                const st = (lead.leadStatus as string | null) ?? 'SIN_CLASIFICAR';
                if (!selectedStatuses.includes(st)) return false;
            }
            if (minScore > 0) {
                const score = scoreMap.get(lead.id);
                if (score == null || score < minScore) return false;
            }
            if (selectedTagIds.length > 0) {
                const leadTags = sessionTagMap.get(lead.id) ?? [];
                if (!selectedTagIds.some(t => leadTags.includes(t))) return false;
            }
            return true;
        });
    }, [leads, selectedStatuses, minScore, selectedTagIds, scoreMap, sessionTagMap]);

    const toggleStatus = (s: string) =>
        setSelectedStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

    const toggleTag = (id: number) =>
        setSelectedTagIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const clearFilters = () => {
        setSelectedStatuses([]);
        setMinScore(0);
        setSelectedTagIds([]);
    };

    return (
        <div className="rounded-lg border border-dashed border-border bg-muted/10 overflow-hidden">

            {/* Collapsible header */}
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
                <span className="flex items-center gap-1.5 uppercase tracking-wide">
                    <Filter className="h-3.5 w-3.5" />
                    Segmentación inteligente
                    {hasFilters && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 normal-case tracking-normal">
                            {matching.length} leads
                        </Badge>
                    )}
                </span>
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {expanded && (
                <div className="px-3 pb-3 space-y-4 border-t border-border/50">

                    {/* Estado del lead */}
                    <div className="pt-3 space-y-2">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Estado del lead</p>
                        <div className="flex flex-wrap gap-1.5">
                            {STATUS_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => toggleStatus(opt.value)}
                                    className={cn(
                                        'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                                        selectedStatuses.includes(opt.value)
                                            ? opt.cls
                                            : 'bg-background border-border text-muted-foreground hover:border-foreground/30'
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Score mínimo */}
                    <div className="space-y-2">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex justify-between items-center">
                            <span>Score mínimo</span>
                            <span className={cn('normal-case tracking-normal text-xs', minScore > 0 ? 'text-foreground font-semibold' : 'text-muted-foreground/60')}>
                                {minScore > 0 ? `≥ ${minScore} / 100` : 'Sin filtro'}
                            </span>
                        </p>
                        <input
                            type="range"
                            min={0} max={100} step={5}
                            value={minScore}
                            onChange={e => setMinScore(Number(e.target.value))}
                            className="w-full h-1.5 accent-primary cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground/50">
                            {[0, 25, 50, 75, 100].map(v => <span key={v}>{v}</span>)}
                        </div>
                    </div>

                    {/* Tags */}
                    {tags.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Tags</p>
                            <div className="flex flex-wrap gap-1.5">
                                {tags.map(tag => {
                                    const isActive = selectedTagIds.includes(tag.id);
                                    return (
                                        <button
                                            key={tag.id}
                                            type="button"
                                            onClick={() => toggleTag(tag.id)}
                                            style={isActive ? { backgroundColor: tag.color ?? '#6366F1', color: '#fff', borderColor: 'transparent' } : {}}
                                            className={cn(
                                                'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                                                !isActive && 'bg-background border-border text-muted-foreground hover:border-foreground/30'
                                            )}
                                        >
                                            {tag.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Footer: contador + botones */}
                    <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5" />
                            <span className="font-semibold text-foreground">{matching.length}</span>
                            <span>{hasFilters ? `de ${leads.length} leads` : 'leads en total'}</span>
                        </span>
                        <div className="flex gap-2">
                            {hasFilters && (
                                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters}>
                                    Limpiar
                                </Button>
                            )}
                            <Button
                                type="button"
                                size="sm"
                                className="h-7 text-xs gap-1.5"
                                disabled={matching.length === 0}
                                onClick={() => { onApply(matching); setExpanded(false); }}
                            >
                                Aplicar segmento
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
