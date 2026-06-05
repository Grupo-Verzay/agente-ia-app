'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Tag, Loader2, Phone, Megaphone, Mail, Building2, MapPin,
  Briefcase, FileText, Check, ChevronDown, ChevronRight,
  Sheet, Send, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  getExternalClientDataByRemoteJid,
  upsertExternalClientData,
} from '@/actions/external-client-data-actions';
import {
  getGoogleSheetsWebhookUrl,
  saveGoogleSheetsWebhookUrl,
  syncContactToGoogleSheets,
} from '@/actions/google-sheets-actions';
import { SwitchAgentDisabled } from '../../sessions/_components';
import { LeadStatusSelect } from './LeadStatusSelect';
import { SessionTagsCombobox } from '../../tags/components';
import { initialFromName } from './chat-message-utils';
import type { Session, SimpleTag } from '@/types/session';

/* ── Contact data fields ───────────────────────────────────── */
type ContactFields = {
  email: string;
  empresa: string;
  ciudad: string;
  cargo: string;
  notas: string;
};
const EMPTY_FIELDS: ContactFields = { email: '', empresa: '', ciudad: '', cargo: '', notas: '' };

/* ── Inline field ──────────────────────────────────────────── */
interface InlineFieldProps {
  icon: React.ElementType;
  label: string;
  field: keyof ContactFields;
  value: string;
  multiline?: boolean;
  saved: boolean;
  onChange: (field: keyof ContactFields, value: string) => void;
  onSave: () => void;
}

function InlineField({ icon: Icon, label, field, value, multiline, saved, onChange, onSave }: InlineFieldProps) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const inputCls = 'flex-1 text-sm bg-transparent outline-none resize-none placeholder:text-muted-foreground/30 border-0 focus:ring-0 p-0 w-full';

  return (
    <div className="px-4 py-1.5">
      <label className="text-[10px] text-muted-foreground/70 font-medium flex items-center gap-1 mb-1 cursor-pointer" onClick={() => ref.current?.focus()}>
        <Icon className="h-3 w-3" />
        {label}
      </label>
      <div
        className="flex items-start gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 focus-within:border-primary/40 focus-within:bg-background transition-colors cursor-text"
        onClick={() => ref.current?.focus()}
      >
        {multiline ? (
          <textarea
            ref={ref as React.RefObject<HTMLTextAreaElement>}
            rows={3}
            className={inputCls + ' leading-snug'}
            value={value}
            placeholder={`Agregar ${label.toLowerCase()}…`}
            onChange={(e) => onChange(field, e.target.value)}
            onBlur={onSave}
          />
        ) : (
          <input
            ref={ref as React.RefObject<HTMLInputElement>}
            type="text"
            className={inputCls}
            value={value}
            placeholder={`Agregar ${label.toLowerCase()}…`}
            onChange={(e) => onChange(field, e.target.value)}
            onBlur={onSave}
          />
        )}
        {saved && <Check className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />}
      </div>
    </div>
  );
}

/* ── Collapsible section ───────────────────────────────────── */
function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t first:border-t-0">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          <Icon className="h-3 w-3" />
          {title}
        </span>
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
      </button>
      {open && <div className="px-2 pb-3">{children}</div>}
    </div>
  );
}

/* ── Props ─────────────────────────────────────────────────── */
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
  const [fields, setFields] = useState<ContactFields>(EMPTY_FIELDS);
  const [savedField, setSavedField] = useState<keyof ContactFields | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localStatus, setLocalStatus] = useState(session.leadStatus ?? null);
  const [sheetsUrl, setSheetsUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const adSource = session.adSource as { title?: string; body?: string; sourceUrl?: string } | null | undefined;
  const adLabel = adSource?.title || (adSource?.sourceUrl ? (() => { try { return new URL(adSource.sourceUrl!).hostname.replace(/^www\./, ''); } catch { return 'Anuncio'; } })() : null);

  /* Load external contact data */
  useEffect(() => {
    if (!remoteJid) { setLoadingData(false); return; }
    let cancelled = false;
    setLoadingData(true);
    getExternalClientDataByRemoteJid(userId, remoteJid).then((rec) => {
      if (!cancelled && rec?.data && typeof rec.data === 'object') {
        const d = rec.data as Record<string, unknown>;
        setFields({
          email: String(d.email ?? ''),
          empresa: String(d.empresa ?? ''),
          ciudad: String(d.ciudad ?? ''),
          cargo: String(d.cargo ?? ''),
          notas: String(d.notas ?? ''),
        });
      }
      if (!cancelled) setLoadingData(false);
    });
    return () => { cancelled = true; };
  }, [userId, remoteJid]);

  /* Sync lead status */
  useEffect(() => {
    setLocalStatus(session.leadStatus ?? null);
  }, [session.id, session.leadStatus]);

  /* Load Google Sheets config */
  useEffect(() => {
    getGoogleSheetsWebhookUrl(userId).then((url) => setSheetsUrl(url ?? ''));
  }, [userId]);

  const handleFieldChange = useCallback((field: keyof ContactFields, value: string) => {
    setFields((prev) => ({ ...prev, [field]: value }));
    setSavedField(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!remoteJid) return;
    if (pendingRef.current) clearTimeout(pendingRef.current);
    try {
      await upsertExternalClientData(userId, remoteJid, fields as Record<string, string>, 'manual');
    } catch {
      toast.error('No se pudo guardar');
    }
  }, [userId, remoteJid, fields]);

  const handleSaveWebhookUrl = async () => {
    setSavingUrl(true);
    const res = await saveGoogleSheetsWebhookUrl(userId, sheetsUrl);
    setSavingUrl(false);
    if (res.success) toast.success('URL guardada');
    else toast.error('No se pudo guardar la URL');
  };

  const handleSync = async () => {
    if (!displayedWhatsapp) return;
    setSyncing(true);
    const res = await syncContactToGoogleSheets(userId, {
      phone: displayedWhatsapp,
      name: displayedContactName,
      ...fields,
    });
    setSyncing(false);
    if (res.success) toast.success('Sincronizado con Google Sheets');
    else toast.error(res.error ?? 'Error al sincronizar');
  };

  const initialTagIds = session.tags?.map((t) => t.id).filter(Boolean) ?? [];

  const FIELDS_CONFIG: { field: keyof ContactFields; icon: React.ElementType; label: string; multiline?: boolean }[] = [
    { field: 'email',   icon: Mail,      label: 'Email' },
    { field: 'empresa', icon: Building2, label: 'Empresa' },
    { field: 'ciudad',  icon: MapPin,    label: 'Ciudad' },
    { field: 'cargo',   icon: Briefcase, label: 'Cargo' },
    { field: 'notas',   icon: FileText,  label: 'Notas', multiline: true },
  ];

  return (
    <aside className="hidden md:flex flex-col w-72 shrink-0 border-l bg-background h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30 shrink-0">
        <span className="text-sm font-semibold">Contacto</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={onClose} title="Cerrar">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">

        {/* Contact card */}
        <div className="flex flex-col items-center gap-1.5 py-5 px-4 border-b">
          <Avatar className="h-16 w-16 ring-2 ring-border">
            <AvatarImage src={avatarSrc || '/default-avatar.png'} />
            <AvatarFallback className="text-lg font-bold">{initialFromName(displayedContactName)}</AvatarFallback>
          </Avatar>
          <p className="font-semibold text-sm text-center leading-tight mt-1">{displayedContactName}</p>
          {displayedWhatsapp && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3 shrink-0" />
              {displayedWhatsapp}
            </p>
          )}
          {adLabel && (
            <span className="text-[11px] text-blue-500 dark:text-blue-400 flex items-center gap-1">
              <Megaphone className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[200px]">{adLabel}</span>
            </span>
          )}
          {notesCount !== undefined && notesCount > 0 && (
            <Badge variant="outline" className="text-[10px] py-0.5 px-1.5 gap-1 mt-0.5">
              <FileText className="h-2.5 w-2.5" />{notesCount} nota{notesCount > 1 ? 's' : ''}
            </Badge>
          )}

          {/* Agente IA toggle */}
          <div className="flex items-center justify-between w-full mt-2 px-2 py-2 rounded-lg bg-muted/40 border border-border/50">
            <span className="text-xs text-muted-foreground">Agente IA</span>
            <SwitchAgentDisabled
              agentDisabled={Boolean(session.agentDisabled)}
              userId={userId}
              sessionId={session.id}
              mutateSessions={onSessionMutate}
            />
          </div>
        </div>

        {/* Datos del cliente */}
        <Section title="Datos del cliente" icon={Briefcase}>
          {loadingData ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
            </div>
          ) : (
            <div className="space-y-2 py-1">
              {FIELDS_CONFIG.map(({ field, icon, label, multiline }) => (
                <InlineField
                  key={field}
                  icon={icon}
                  label={label}
                  field={field}
                  value={fields[field]}
                  multiline={multiline}
                  saved={savedField === field}
                  onChange={handleFieldChange}
                  onSave={handleSave}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Estado y etiquetas */}
        <Section title="Clasificación" icon={Tag}>
          <div className="space-y-3 px-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Estado</p>
              <LeadStatusSelect
                sessionId={session.id}
                currentStatus={localStatus}
                onUpdated={async (s) => { setLocalStatus(s); await onSessionRefresh(); }}
              />
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Tag className="h-3 w-3" /> Etiquetas
              </p>
              {remoteJid ? (
                <SessionTagsCombobox
                  userId={userId}
                  sessionId={session.id}
                  allTags={allTags}
                  initialSelectedIds={initialTagIds}
                  onSelectedIdsChange={(ids) => onSessionTagsChange?.(remoteJid, ids)}
                />
              ) : session.tags?.length ? (
                <div className="flex flex-wrap gap-1">
                  {session.tags.map((t) => (
                    <Badge key={t.id} variant="outline" className="text-[11px]"
                      style={t.color ? { borderColor: t.color + '60', color: t.color, backgroundColor: t.color + '15' } : undefined}>
                      {t.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Sin etiquetas</p>
              )}
            </div>
          </div>
        </Section>

        {/* Google Sheets */}
        <Section title="Google Sheets" icon={Sheet} defaultOpen={false}>
          <div className="px-4 space-y-3">
            <p className="text-[10px] text-muted-foreground leading-snug flex items-start gap-1">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              Comparte tu hoja con <span className="font-medium text-foreground select-all">agente-ia@ia-crm-496602.iam.gserviceaccount.com</span> como Editor y pega la URL aquí.
            </p>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={sheetsUrl}
                onChange={(e) => setSheetsUrl(e.target.value)}
                placeholder="URL o ID de la hoja…"
                className="flex-1 text-xs rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 outline-none focus:border-primary/40 focus:bg-background transition-colors"
              />
              <Button type="button" size="sm" variant="outline" className="h-8 px-2 shrink-0 text-xs" onClick={handleSaveWebhookUrl} disabled={savingUrl}>
                {savingUrl ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Guardar'}
              </Button>
            </div>
            <Button type="button" size="sm" className="w-full gap-2 h-8 text-xs" onClick={handleSync} disabled={syncing || !sheetsUrl}>
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Sincronizar ficha ahora
            </Button>
          </div>
        </Section>

        {/* Origen del anuncio */}
        {adSource && (
          <Section title="Origen del anuncio" icon={Megaphone} defaultOpen={false}>
            <div className="px-2">
              <div className="rounded-lg border p-3 space-y-1">
                {adSource.title && <p className="text-xs font-medium">{adSource.title}</p>}
                {adSource.body && <p className="text-xs text-muted-foreground leading-snug">{adSource.body}</p>}
                {adSource.sourceUrl && (
                  <a href={adSource.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-blue-500 hover:underline truncate block">
                    {adSource.sourceUrl}
                  </a>
                )}
              </div>
            </div>
          </Section>
        )}

      </div>
    </aside>
  );
}
