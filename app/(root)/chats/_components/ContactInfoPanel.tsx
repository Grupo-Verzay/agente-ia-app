'use client';

import { useState, useEffect } from 'react';
import {
  X, Brain, TrendingUp, Tag, Bell, Loader2, Sparkles,
  RefreshCw, Phone, Megaphone, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getSessionLatestSummarySnapshot } from '@/actions/crm-follow-up-actions';
import { scoreLeadBySessionId } from '@/actions/lead-score-action';
import { LeadStatusSelect } from './LeadStatusSelect';
import { SessionTagsCombobox } from '../tags/components';
import { initialFromName } from './chat-message-utils';
import type { Session, SimpleTag } from '@/types/session';

/* ── Helpers ───────────────────────────────────────────────── */
function scoreColor(s: number) {
  if (s >= 76) return '#22C55E';
  if (s >= 51) return '#F59E0B';
  if (s >= 26) return '#F97316';
  return '#EF4444';
}

function timeAgo(iso: string | Date | null | undefined) {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

/* ── Types ─────────────────────────────────────────────────── */
interface ContactInfoPanelProps {
  session: Session;
  displayedContactName: string;
  displayedWhatsapp: string;
  avatarSrc?: string;
  userId: string;
  allTags: SimpleTag[];
  remoteJid?: string;
  notesCount?: number;
  onClose: () => void;
  onSessionTagsChange?: (remoteJid: string, selectedIds: number[]) => void;
  onSessionMutate: () => void;
  onSessionRefresh: () => Promise<void>;
}

/* ── Section header ────────────────────────────────────────── */
function SectionLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 mb-2">
      <Icon className="h-3 w-3" />
      {label}
    </h4>
  );
}

/* ── Panel ─────────────────────────────────────────────────── */
export function ContactInfoPanel({
  session,
  displayedContactName,
  displayedWhatsapp,
  avatarSrc,
  userId,
  allTags,
  remoteJid,
  notesCount,
  onClose,
  onSessionTagsChange,
  onSessionMutate,
  onSessionRefresh,
}: ContactInfoPanelProps) {
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [loadingSynth, setLoadingSynth] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [localScore, setLocalScore] = useState<number | null>(session.leadScore ?? null);
  const [localReason, setLocalReason] = useState<string | null>(session.leadScoreReason ?? null);
  const [localStatus, setLocalStatus] = useState(session.leadStatus ?? null);

  const adSource = session.adSource as { title?: string; body?: string; sourceUrl?: string } | null | undefined;
  const adLabel = adSource?.title || (adSource?.sourceUrl ? (() => { try { return new URL(adSource.sourceUrl!).hostname.replace(/^www\./, ''); } catch { return 'Anuncio'; } })() : null);

  useEffect(() => {
    setLocalScore(session.leadScore ?? null);
    setLocalReason(session.leadScoreReason ?? null);
    setLocalStatus(session.leadStatus ?? null);
  }, [session.id, session.leadScore, session.leadScoreReason, session.leadStatus]);

  useEffect(() => {
    let cancelled = false;
    setLoadingSynth(true);
    setSynthesis(null);
    getSessionLatestSummarySnapshot(session.id).then((res) => {
      if (!cancelled && res.success && res.data?.summarySnapshot) {
        setSynthesis(res.data.summarySnapshot);
      }
      if (!cancelled) setLoadingSynth(false);
    });
    return () => { cancelled = true; };
  }, [session.id]);

  const handleScore = async () => {
    setScoring(true);
    const res = await scoreLeadBySessionId(session.id);
    if (res.success && res.score !== undefined) {
      setLocalScore(res.score);
      setLocalReason(res.reason ?? null);
      toast.success(`Lead puntuado: ${res.score}/100`);
      onSessionMutate();
    } else {
      toast.error(res.message ?? 'Error al puntuar');
    }
    setScoring(false);
  };

  const pendingFollowUps = session.crmFollowUpSummary?.pending ?? 0;
  const initialTagIds = session.tags?.map((t) => t.id).filter(Boolean) ?? [];

  return (
    <aside className="hidden md:flex flex-col w-72 shrink-0 border-l bg-background h-full overflow-hidden">
      {/* ── Panel header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
        <span className="text-sm font-semibold">Contacto</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          title="Cerrar panel"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">

        {/* ── Contact card ── */}
        <div className="flex flex-col items-center gap-1.5 py-5 px-4 border-b">
          <Avatar className="h-16 w-16 ring-2 ring-border">
            <AvatarImage src={avatarSrc || '/default-avatar.png'} />
            <AvatarFallback className="text-lg font-bold">
              {initialFromName(displayedContactName)}
            </AvatarFallback>
          </Avatar>
          <p className="font-semibold text-sm text-center leading-tight mt-1">
            {displayedContactName}
          </p>
          {displayedWhatsapp && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3 shrink-0" />
              {displayedWhatsapp}
            </p>
          )}
          {adLabel && (
            <span className="text-[11px] text-blue-500 dark:text-blue-400 flex items-center gap-1 mt-0.5">
              <Megaphone className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[200px]">{adLabel}</span>
            </span>
          )}

          {/* Status pills */}
          <div className="flex flex-wrap justify-center gap-1.5 mt-1">
            <Badge
              variant="outline"
              className={cn('text-[10px] py-0.5 px-1.5', session.status
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                : 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400')}
            >
              {session.status ? 'Activa' : 'Pausada'}
            </Badge>
            {session.agentDisabled && (
              <Badge variant="outline" className="text-[10px] py-0.5 px-1.5 border-gray-300 bg-gray-50 text-gray-500 dark:bg-gray-800/50">
                IA off
              </Badge>
            )}
            {notesCount !== undefined && notesCount > 0 && (
              <Badge variant="outline" className="text-[10px] py-0.5 px-1.5 gap-1">
                <FileText className="h-2.5 w-2.5" />
                {notesCount} nota{notesCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        {/* ── Sections ── */}
        <div className="p-4 space-y-5">

          {/* Lead status */}
          <section>
            <SectionLabel icon={TrendingUp} label="Estado del lead" />
            <LeadStatusSelect
              sessionId={session.id}
              currentStatus={localStatus}
              onUpdated={async (s) => {
                setLocalStatus(s);
                await onSessionRefresh();
              }}
            />
          </section>

          {/* Lead score */}
          <section>
            <SectionLabel icon={TrendingUp} label="Puntuación IA" />
            {localScore !== null ? (
              <div className="rounded-lg border p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-white font-bold text-base"
                    style={{ backgroundColor: scoreColor(localScore) }}
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    {localScore}<span className="text-xs font-normal opacity-80">/100</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleScore}
                    disabled={scoring}
                    className="h-7 gap-1 text-xs px-2"
                  >
                    {scoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Re-puntuar
                  </Button>
                </div>
                {localReason && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{localReason}</p>
                )}
                {session.leadScoredAt && (
                  <p className="text-[10px] text-muted-foreground/60">{timeAgo(session.leadScoredAt)}</p>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-3 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Sin puntuación</p>
                <Button type="button" size="sm" onClick={handleScore} disabled={scoring} className="h-7 gap-1 text-xs px-2">
                  {scoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Puntuar
                </Button>
              </div>
            )}
          </section>

          {/* AI Synthesis */}
          <section>
            <SectionLabel icon={Brain} label="Síntesis IA" />
            {loadingSynth ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
              </div>
            ) : synthesis ? (
              <div className="rounded-lg border p-3 bg-muted/20">
                <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-line">{synthesis}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground rounded-lg border border-dashed p-3">Sin síntesis disponible</p>
            )}
          </section>

          {/* Tags */}
          <section>
            <SectionLabel icon={Tag} label="Etiquetas" />
            {remoteJid ? (
              <SessionTagsCombobox
                userId={userId}
                sessionId={session.id}
                allTags={allTags}
                initialSelectedIds={initialTagIds}
                onSelectedIdsChange={(ids) => onSessionTagsChange?.(remoteJid, ids)}
              />
            ) : session.tags && session.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {session.tags.map((t) => (
                  <Badge
                    key={t.id}
                    variant="outline"
                    className="text-[11px]"
                    style={t.color ? { borderColor: t.color + '60', color: t.color, backgroundColor: t.color + '15' } : undefined}
                  >
                    {t.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sin etiquetas</p>
            )}
          </section>

          {/* Follow-ups */}
          {pendingFollowUps > 0 && (
            <section>
              <SectionLabel icon={Bell} label="Follow-ups" />
              <div className="rounded-lg border p-3 flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="text-sm font-medium text-amber-600">
                  {pendingFollowUps} pendiente{pendingFollowUps > 1 ? 's' : ''}
                </span>
              </div>
            </section>
          )}

          {/* Ad source detail */}
          {adSource && (
            <section>
              <SectionLabel icon={Megaphone} label="Origen del anuncio" />
              <div className="rounded-lg border p-3 space-y-1">
                {adSource.title && <p className="text-xs font-medium">{adSource.title}</p>}
                {adSource.body && <p className="text-xs text-muted-foreground leading-snug">{adSource.body}</p>}
                {adSource.sourceUrl && (
                  <a
                    href={adSource.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-500 hover:underline truncate block"
                  >
                    {adSource.sourceUrl}
                  </a>
                )}
              </div>
            </section>
          )}

        </div>
      </div>
    </aside>
  );
}
