'use client';

import { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import {
  X, Loader2, Phone, Megaphone, Mail, Building2, MapPin,
  Briefcase, FileText, Check, ChevronDown, Home, CreditCard, Calendar, Flag,
  Sheet, Send, Info, BotIcon, Pencil, CheckCircle2,
  Globe, AtSign, Share2, Linkedin,
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
import { updateLeadPushNameAction } from '@/actions/registro-action';
import { toggleAgentDisabled } from '@/actions/session-action';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { initialFromName } from './chat-message-utils';
import type { Session } from '@/types/session';

/* ── Contact data fields ───────────────────────────────────── */
type ContactFields = {
  email: string;
  empresa: string;
  ciudad: string;
  cargo: string;
  notas: string;
  telefono: string;
  fecha: string;
  pais: string;
  sitioWeb: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  direccion: string;
  documento: string;
};
const EMPTY_FIELDS: ContactFields = { email: '', empresa: '', ciudad: '', cargo: '', notas: '', sitioWeb: '', instagram: '', facebook: '', linkedin: '', direccion: '', documento: '', telefono: '', fecha: '', pais: '' };

type FieldConfig = { field: keyof ContactFields; icon: React.ElementType; label: string; multiline?: boolean };

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
      <label className="text-xs text-foreground/60 font-semibold flex items-center gap-1.5 mb-1 cursor-pointer" onClick={() => ref.current?.focus()}>
        <Icon className="h-3.5 w-3.5" />
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
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
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
  remoteJid?: string;
  notesCount?: number;
  onClose: () => void;
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
  remoteJid,
  notesCount,
  onClose,
  onSessionMutate,
  onSessionRefresh,
}: ContactInfoPanelProps) {
  const [fields, setFields] = useState<ContactFields>(EMPTY_FIELDS);
  const [savedField, setSavedField] = useState<keyof ContactFields | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sheetsUrl, setSheetsUrl] = useState('');
  const [sheetsDraft, setSheetsDraft] = useState('');
  const [sheetsSaved, setSheetsSaved] = useState(false);
  const [editingSheets, setEditingSheets] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(!session.agentDisabled);
  const [isPending, startTransition] = useTransition();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayedContactName);
  const [savingName, setSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
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
          telefono: String(d.telefono ?? ''),
          fecha: String(d.fecha ?? ''),
          pais: String(d.pais ?? ''),
          sitioWeb: String(d.sitioWeb ?? ''),
          instagram: String(d.instagram ?? ''),
          facebook: String(d.facebook ?? ''),
          linkedin: String(d.linkedin ?? ''),
          direccion: String(d.direccion ?? ''),
          documento: String(d.documento ?? ''),
        });
      }
      if (!cancelled) setLoadingData(false);
    });
    return () => { cancelled = true; };
  }, [userId, remoteJid]);

  /* Sync name draft when contact changes */
  useEffect(() => { setNameDraft(displayedContactName); }, [displayedContactName]);

  const handleNameSave = async () => {
    const name = nameDraft.trim();
    if (!name || name === displayedContactName) { setEditingName(false); return; }
    setSavingName(true);
    const res = await updateLeadPushNameAction({ sessionId: session.id, pushName: name });
    setSavingName(false);
    if (res.success) { toast.success('Nombre actualizado'); onSessionRefresh(); }
    else toast.error('No se pudo actualizar');
    setEditingName(false);
  };

  /* Sync agent state */
  useEffect(() => { setAgentEnabled(!session.agentDisabled); }, [session.agentDisabled]);

  const handleToggleAgent = (next: boolean) => {
    const prev = agentEnabled;
    setAgentEnabled(next);
    startTransition(async () => {
      const res = await toggleAgentDisabled(userId, session.id, !next);
      if (!res?.success) { setAgentEnabled(prev); toast.error('No se pudo actualizar'); return; }
      onSessionMutate();
      toast.success(next ? 'Agente habilitado' : 'Agente pausado');
    });
  };

  /* Load Google Sheets config */
  useEffect(() => {
    getGoogleSheetsWebhookUrl(userId).then((url) => {
      setSheetsUrl(url ?? '');
      setSheetsSaved(!!url);
    });
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
    if (!sheetsDraft.trim()) return;
    setSavingUrl(true);
    const res = await saveGoogleSheetsWebhookUrl(userId, sheetsDraft);
    setSavingUrl(false);
    if (res.success) {
      setSheetsUrl(sheetsDraft);
      setSheetsDraft('');
      toast.success('Hoja guardada');
      setSheetsSaved(true);
      setEditingSheets(false);
    } else toast.error('No se pudo guardar la URL');
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

  const SECTIONS_CONFIG: { title: string; icon: React.ElementType; fields: FieldConfig[] }[] = [
    {
      title: 'Datos de negocio', icon: Building2,
      fields: [
        { field: 'empresa',   icon: Building2,  label: 'Empresa' },
        { field: 'cargo',     icon: Briefcase,  label: 'Cargo' },
        { field: 'documento', icon: CreditCard, label: 'Documento' },
      ],
    },
    {
      title: 'Contacto', icon: Phone,
      fields: [
        { field: 'telefono', icon: Phone,    label: 'Teléfono' },
        { field: 'email',    icon: Mail,     label: 'Email' },
        { field: 'fecha',    icon: Calendar, label: 'Fecha' },
      ],
    },
    {
      title: 'Ubicación', icon: MapPin,
      fields: [
        { field: 'pais',      icon: Flag,    label: 'País' },
        { field: 'ciudad',    icon: MapPin,  label: 'Ciudad' },
        { field: 'direccion', icon: Home,    label: 'Dirección' },
      ],
    },
    {
      title: 'Presencia digital', icon: Globe,
      fields: [
        { field: 'sitioWeb',  icon: Globe,    label: 'Sitio web' },
        { field: 'instagram', icon: AtSign,   label: 'Instagram' },
        { field: 'facebook',  icon: Share2,   label: 'Facebook' },
        { field: 'linkedin',  icon: Linkedin, label: 'LinkedIn' },
      ],
    },
    {
      title: 'Libre', icon: FileText,
      fields: [
        { field: 'notas', icon: FileText, label: 'Notas', multiline: true },
      ],
    },
  ];

  return (
    <aside className="hidden md:flex flex-col w-80 shrink-0 border-l bg-background h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30 shrink-0">
        <span className="text-sm font-semibold">Contacto</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={onClose} title="Cerrar">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">

        {/* Contact card */}
        <div className="flex flex-col items-center gap-1 pt-4 pb-2 px-4 border-b">
          <Avatar className="h-16 w-16 ring-2 ring-border">
            <AvatarImage src={avatarSrc || '/default-avatar.png'} />
            <AvatarFallback className="text-lg font-bold">{initialFromName(displayedContactName)}</AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-1 mt-1">
            {editingName ? (
              <input
                ref={nameInputRef}
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleNameSave(); } if (e.key === 'Escape') { setEditingName(false); setNameDraft(displayedContactName); } }}
                className="font-semibold text-sm text-center bg-transparent outline-none w-full px-1"
                disabled={savingName}
              />
            ) : (
              <span className="font-semibold text-sm leading-tight">{displayedContactName}</span>
            )}
            {!editingName && (
              <button
                type="button"
                onClick={() => { setEditingName(true); setTimeout(() => nameInputRef.current?.select(), 50); }}
                title="Editar nombre"
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
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
          <div className="flex items-center justify-between w-full mt-0.5 px-3 py-0.5">
            <div className="flex items-center gap-2">
              <BotIcon className={cn('h-4 w-4 transition-colors', agentEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground')} />
              <p className="text-xs font-medium">Agente IA</p>
            </div>
            <SwitchPrimitive.Root
              checked={agentEnabled}
              onCheckedChange={handleToggleAgent}
              disabled={isPending}
              className={cn(
                'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-300',
                'border-input bg-input/60',
                'data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-500',
                'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              <SwitchPrimitive.Thumb className={cn(
                'pointer-events-none flex h-5 w-5 items-center justify-center rounded-full bg-background shadow-sm',
                'transition-transform duration-300 translate-x-1 data-[state=checked]:translate-x-6',
              )}>
                <BotIcon className={cn('h-3 w-3 transition-colors', agentEnabled ? 'text-blue-500' : 'text-muted-foreground')} />
              </SwitchPrimitive.Thumb>
            </SwitchPrimitive.Root>
          </div>
        </div>

        {/* Datos del cliente — secciones agrupadas */}
        {loadingData ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-3">
            <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
          </div>
        ) : (
          SECTIONS_CONFIG.map(({ title, icon, fields: sectionFields }) => (
            <Section key={title} title={title} icon={icon} defaultOpen={title === 'Datos de negocio' || title === 'Contacto'}>
              <div className="space-y-2 py-1">
                {sectionFields.map(({ field, icon: fieldIcon, label, multiline }) => (
                  <InlineField
                    key={field}
                    icon={fieldIcon}
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
            </Section>
          ))
        )}


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

        {/* Google Sheets — config en scroll */}
        <Section title="Google Sheets" icon={Sheet} defaultOpen={false}>
          <div className="px-4 space-y-2 pb-1">
            {sheetsSaved && !editingSheets ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Hoja conectada
                </span>
                <button type="button" onClick={() => setEditingSheets(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Cambiar hoja
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground">Comparte tu hoja con esta cuenta como <span className="font-medium">Editor</span>:</p>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText('agente-ia@ia-crm-496602.iam.gserviceaccount.com'); toast.success('Email copiado'); }}
                  className="w-full text-left text-[10px] font-mono bg-muted rounded-md px-2 py-1.5 truncate text-muted-foreground hover:bg-muted/80 transition-colors border border-border/50"
                  title="Clic para copiar"
                >
                  agente-ia@ia-crm-496602.iam.gserviceaccount.com
                </button>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={sheetsDraft}
                    onChange={(e) => setSheetsDraft(e.target.value)}
                    placeholder="URL o ID de la hoja…"
                    className="flex-1 text-xs rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 outline-none focus:border-primary/40 focus:bg-background transition-colors"
                  />
                  <Button type="button" size="sm" variant="outline" className="h-8 px-2 shrink-0 text-xs" onClick={handleSaveWebhookUrl} disabled={savingUrl}>
                    {savingUrl ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Guardar'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Section>

      </div>

      {/* ── Sync button fijo al fondo ── */}
      {sheetsSaved && (
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2 py-1.5 sm:px-3 sm:py-2">
          <Button type="button" className="w-full gap-1.5 text-sm h-10 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Sincronizar datos ahora
          </Button>
        </div>
      )}
    </aside>
  );
}
