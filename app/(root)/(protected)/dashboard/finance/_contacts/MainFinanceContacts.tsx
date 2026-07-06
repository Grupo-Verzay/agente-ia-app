'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { DataTable } from './data-table';
import { buildContactsColumns, type FinanceContactRow } from './columns';
import { FieldBuilderDialog } from './FieldBuilderDialog';

import {
  createFinanceContact,
  updateFinanceContact,
  deleteFinanceContact,
} from '@/actions/finance-contacts-actions';
import { searchSessionsByUserId } from '@/actions/session-action';
import {
  CONTACT_LINK_KEY,
  readContactValue,
  type FinanceContactKind,
  type FinanceFieldDef,
} from '@/lib/finance-contact-fields';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { ChevronsUpDown, Check, UserRound, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

type ContactOption = { id: number; pushName?: string | null; customName?: string | null; remoteJid: string };

const LABELS: Record<FinanceContactKind, { singular: string; plural: string }> = {
  SUPPLIER: { singular: 'Proveedor', plural: 'Proveedores' },
  CLIENT: { singular: 'Cliente', plural: 'Clientes' },
};

type Props = {
  userId: string;
  kind: FinanceContactKind;
  contacts: FinanceContactRow[];
  fields: FinanceFieldDef[];
  autoOpenCreate?: boolean;
};

function FieldWrap({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label>{label}</Label>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export default function MainFinanceContacts({ userId, kind, contacts, fields, autoOpenCreate = false }: Props) {
  const router = useRouter();
  const labels = LABELS[kind];
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<FinanceContactRow[]>(contacts ?? []);
  useEffect(() => setRows(contacts ?? []), [contacts]);

  const [config, setConfig] = useState<FinanceFieldDef[]>(fields);
  useEffect(() => setConfig(fields), [fields]);

  const [builderOpen, setBuilderOpen] = useState(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceContactRow | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactJid, setContactJid] = useState('');
  const didAutoOpen = useRef(false);

  const setValue = (key: string, v: string) => setValues((p) => ({ ...p, [key]: v }));

  const blankValues = useMemo(() => {
    const o: Record<string, string> = {};
    for (const f of config) if (f.key !== CONTACT_LINK_KEY) o[f.key] = '';
    return o;
  }, [config]);

  const openCreate = () => {
    setEditing(null);
    setValues(blankValues);
    setSessionId(null);
    setContactName('');
    setContactJid('');
    setContactQuery('');
    setContactOptions([]);
    setOpen(true);
  };

  useEffect(() => {
    if (!autoOpenCreate || didAutoOpen.current) return;
    didAutoOpen.current = true;
    openCreate();
  }, [autoOpenCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  const openEdit = (row: FinanceContactRow) => {
    setEditing(row);
    const v: Record<string, string> = {};
    for (const f of config) if (f.key !== CONTACT_LINK_KEY) v[f.key] = readContactValue(row as Record<string, unknown>, f.key);
    setValues(v);
    setSessionId(row.sessionId ?? null);
    setContactName(row.session?.customName || row.session?.pushName || '');
    setContactJid(row.session?.remoteJid || '');
    setContactQuery('');
    setContactOptions([]);
    setOpen(true);
  };

  // ── Búsqueda de contactos (Sessions) ─────────────────────────────
  const [contactOpen, setContactOpen] = useState(false);
  const [contactQuery, setContactQuery] = useState('');
  const [contactLoading, setContactLoading] = useState(false);
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);

  useEffect(() => {
    if (!contactOpen) return;
    const t = setTimeout(() => {
      void (async () => {
        setContactLoading(true);
        try {
          const res = await searchSessionsByUserId(userId, contactQuery.trim());
          if (!res?.success) return toast.error(res?.message || 'No se pudieron cargar contactos');
          setContactOptions((res.data as ContactOption[]) || []);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Error buscando contactos');
        } finally {
          setContactLoading(false);
        }
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [contactOpen, contactQuery, userId]);

  const onSave = () => {
    // Validación de requeridos visibles
    for (const f of config) {
      if (f.hidden || f.key === CONTACT_LINK_KEY) continue;
      if (f.required && !(values[f.key] ?? '').trim()) {
        return toast.error(`El campo "${f.label}" es obligatorio`);
      }
    }
    if (!(values.name ?? '').trim()) return toast.error('El nombre es obligatorio');

    startTransition(() => {
      void (async () => {
        // Incluye TODOS los campos (también ocultos) para no perder datos
        const payloadValues: Record<string, string> = {};
        for (const f of config) if (f.key !== CONTACT_LINK_KEY) payloadValues[f.key] = values[f.key] ?? '';

        const payload = { userId, values: payloadValues, sessionId };
        const res = editing
          ? await updateFinanceContact(editing.id, kind, payload)
          : await createFinanceContact(kind, payload);

        if (!res.success) return toast.error(res.message);
        toast.success(editing ? `${labels.singular} actualizado` : `${labels.singular} creado`);
        setOpen(false);
        setEditing(null);
        router.refresh();
      })();
    });
  };

  const onDelete = (id: string) => {
    startTransition(() => {
      void (async () => {
        const res = await deleteFinanceContact(id, userId);
        if (!res.success) return toast.error(res.message);
        setRows((prev) => prev.filter((r) => r.id !== id));
        toast.success(`${labels.singular} eliminado`);
        router.refresh();
      })();
    });
  };

  const columns = useMemo(
    () => buildContactsColumns({ fields: config, onEdit: openEdit, onDelete, busy: isPending }),
    [config, isPending], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const visibleFields = useMemo(() => config.filter((f) => !f.hidden), [config]);

  const renderField = (f: FinanceFieldDef) => {
    if (f.key === CONTACT_LINK_KEY) {
      return (
        <Popover open={contactOpen} onOpenChange={setContactOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              className="h-9 w-full justify-between text-sm"
              disabled={isPending}
            >
              <span className="inline-flex min-w-0 items-center gap-2 truncate">
                <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {contactName || contactJid
                    ? `${contactName || 'Contacto'}${contactJid ? ` · ${contactJid}` : ''}`
                    : 'Buscar contacto...'}
                </span>
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput placeholder="Buscar por nombre o número..." value={contactQuery} onValueChange={setContactQuery} />
              <CommandEmpty>{contactLoading ? 'Buscando...' : 'Sin resultados.'}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    setSessionId(null);
                    setContactName('');
                    setContactJid('');
                    setContactOpen(false);
                  }}
                >
                  <span className="text-xs text-muted-foreground">Quitar vínculo</span>
                </CommandItem>
                {contactOptions.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`${s.pushName ?? ''} ${s.remoteJid ?? ''}`}
                    onSelect={() => {
                      setSessionId(s.id);
                      setContactName(s.customName || s.pushName || '');
                      setContactJid(s.remoteJid ?? '');
                      setValues((prev) => ({
                        ...prev,
                        name: (prev.name ?? '').trim() || s.customName || s.pushName || prev.name || '',
                        phone: (prev.phone ?? '').trim() || (s.remoteJid ? s.remoteJid.replace(/@.*/, '') : prev.phone || ''),
                      }));
                      setContactOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', sessionId === s.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{s.customName || s.pushName || 'Sin nombre'}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{s.remoteJid}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
      );
    }

    const val = values[f.key] ?? '';
    if (f.type === 'textarea') {
      return (
        <Textarea
          value={val}
          onChange={(e) => setValue(f.key, e.target.value)}
          className="min-h-[64px] resize-y text-sm"
          placeholder="Observaciones..."
        />
      );
    }
    if (f.type === 'select') {
      const opts = f.options ?? [];
      return (
        <Select value={val || '__none__'} onValueChange={(v) => setValue(f.key, v === '__none__' ? '' : v)}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Selecciona" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-sm">
              Sin selección
            </SelectItem>
            {opts.map((o) => (
              <SelectItem key={o} value={o} className="text-sm">
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    const inputType = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text';
    return (
      <Input
        type={inputType}
        value={val}
        onChange={(e) => setValue(f.key, e.target.value)}
        className="h-9 text-sm"
        placeholder={f.key === 'code' ? (kind === 'SUPPLIER' ? 'P-1 (automático)' : 'C-1 (automático)') : undefined}
      />
    );
  };

  const isFullWidth = (f: FinanceFieldDef) =>
    f.type === 'textarea' || f.type === 'contact' || f.key === 'address';

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-3">
      <Card className="border-border flex-1 min-h-0 flex flex-col">
        <CardHeader className="py-3 flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">{labels.plural}</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBuilderOpen(true)}
                disabled={isPending}
                className="h-9"
              >
                <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Configurar campos
              </Button>
              <Button
                size="sm"
                onClick={openCreate}
                disabled={isPending}
                className="h-9 bg-blue-600 hover:bg-blue-700 text-white"
              >
                + Nuevo {labels.singular.toLowerCase()}
              </Button>
            </div>
          </div>

          <div className="mt-2 flex-1 min-h-0">
            <DataTable
              columns={columns}
              data={rows}
              searchKey="name"
              searchPlaceholder={`Buscar ${labels.plural.toLowerCase()}...`}
              onRowClick={openEdit}
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0" />
      </Card>

      {/* Modal Crear/Editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[585px] flex-col overflow-hidden rounded-2xl sm:max-w-[720px]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-base">
              {editing ? `Editar ${labels.singular.toLowerCase()}` : `Nuevo ${labels.singular.toLowerCase()}`}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visibleFields.map((f) => (
                <div key={f.key} className={isFullWidth(f) ? 'sm:col-span-2' : ''}>
                  <FieldWrap
                    label={`${f.label}${f.required ? ' *' : ''}`}
                    hint={
                      f.key === 'code'
                        ? 'Opcional (se genera automático)'
                        : f.key === 'phone'
                          ? 'Se autovincula con el contacto de WhatsApp'
                          : f.key === CONTACT_LINK_KEY
                            ? 'Vincula con una conversación existente'
                            : undefined
                    }
                  >
                    {renderField(f)}
                  </FieldWrap>
                </div>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t pt-3">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isPending} className="h-9">
              Cancelar
            </Button>
            <Button variant="save" size="sm" onClick={onSave} disabled={isPending} className="h-9">
              {editing ? 'Guardar cambios' : `Guardar ${labels.singular.toLowerCase()}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <FieldBuilderDialog
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        userId={userId}
        kind={kind}
        fields={config}
        onSaved={(next) => {
          setConfig(next);
          router.refresh();
        }}
      />
    </div>
  );
}
