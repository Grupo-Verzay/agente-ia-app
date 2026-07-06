'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { DataTable } from './data-table';
import { buildContactsColumns, type FinanceContactRow } from './columns';

import {
  createFinanceContact,
  updateFinanceContact,
  deleteFinanceContact,
} from '@/actions/finance-contacts-actions';
import { searchSessionsByUserId } from '@/actions/session-action';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { ChevronsUpDown, Check, Plus, Trash2, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

type Kind = 'SUPPLIER' | 'CLIENT';
type ContactOption = { id: number; pushName?: string | null; customName?: string | null; remoteJid: string };
type CustomField = { label: string; value: string };

const LABELS: Record<Kind, { singular: string; plural: string; codeLabel: string }> = {
  SUPPLIER: { singular: 'Proveedor', plural: 'Proveedores', codeLabel: 'Proveedor' },
  CLIENT: { singular: 'Cliente', plural: 'Clientes', codeLabel: 'Cliente' },
};

type Props = {
  userId: string;
  kind: Kind;
  contacts: FinanceContactRow[];
  autoOpenCreate?: boolean;
};

type FormState = {
  code: string;
  name: string;
  phone: string;
  email: string;
  department: string;
  city: string;
  address: string;
  notes: string;
  customFields: CustomField[];
  sessionId: number | null;
  contactName: string;
  contactJid: string;
};

const emptyForm: FormState = {
  code: '',
  name: '',
  phone: '',
  email: '',
  department: '',
  city: '',
  address: '',
  notes: '',
  customFields: [],
  sessionId: null,
  contactName: '',
  contactJid: '',
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">{label}</label>
        {hint ? <p className="text-[11px] text-muted-foreground/80">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export default function MainFinanceContacts({ userId, kind, contacts, autoOpenCreate = false }: Props) {
  const router = useRouter();
  const labels = LABELS[kind];
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<FinanceContactRow[]>(contacts ?? []);
  useEffect(() => setRows(contacts ?? []), [contacts]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceContactRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const didAutoOpen = useRef(false);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setContactQuery('');
    setContactOptions([]);
    setOpen(true);
  };

  useEffect(() => {
    if (!autoOpenCreate || didAutoOpen.current) return;
    didAutoOpen.current = true;
    openCreate();
  }, [autoOpenCreate]);

  const openEdit = (row: FinanceContactRow) => {
    setEditing(row);
    setForm({
      code: row.code ?? '',
      name: row.name ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      department: row.department ?? '',
      city: row.city ?? '',
      address: row.address ?? '',
      notes: row.notes ?? '',
      customFields: Array.isArray(row.customFields) ? row.customFields : [],
      sessionId: row.sessionId ?? null,
      contactName: row.session?.customName || row.session?.pushName || '',
      contactJid: row.session?.remoteJid || '',
    });
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

  // ── Campos personalizados ────────────────────────────────────────
  const addCustomField = () =>
    setForm((p) => ({ ...p, customFields: [...p.customFields, { label: '', value: '' }] }));
  const updateCustomField = (i: number, patch: Partial<CustomField>) =>
    setForm((p) => ({
      ...p,
      customFields: p.customFields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
    }));
  const removeCustomField = (i: number) =>
    setForm((p) => ({ ...p, customFields: p.customFields.filter((_, idx) => idx !== i) }));

  const onSave = () => {
    if (!form.name.trim()) return toast.error('El nombre es obligatorio');

    startTransition(() => {
      void (async () => {
        const payload = {
          userId,
          code: form.code.trim() || null,
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          department: form.department.trim() || null,
          city: form.city.trim() || null,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
          customFields: form.customFields,
          sessionId: form.sessionId,
        };

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
    () => buildContactsColumns({ codeLabel: labels.codeLabel, onEdit: openEdit, onDelete, busy: isPending }),
    [isPending], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-3">
      <Card className="border-border flex-1 min-h-0 flex flex-col">
        <CardHeader className="py-3 flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">{labels.plural}</CardTitle>
            <Button
              size="sm"
              onClick={openCreate}
              disabled={isPending}
              className="h-9 bg-blue-600 hover:bg-blue-700 text-white"
            >
              + Nuevo {labels.singular.toLowerCase()}
            </Button>
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
              <Field label="Código" hint="Opcional (se genera automático)">
                <Input
                  value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                  className="h-9 text-sm"
                  placeholder={kind === 'SUPPLIER' ? 'P-1' : 'C-1'}
                />
              </Field>

              <Field label="Nombre y apellido *">
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="h-9 text-sm"
                  placeholder="Nombre del contacto"
                />
              </Field>

              <Field label="Teléfono" hint="Se autovincula con el contacto de WhatsApp">
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  className="h-9 text-sm"
                  placeholder="3001234567"
                />
              </Field>

              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className="h-9 text-sm"
                  placeholder="correo@ejemplo.com"
                />
              </Field>

              <Field label="Departamento">
                <Input
                  value={form.department}
                  onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                  className="h-9 text-sm"
                  placeholder="Valle del Cauca"
                />
              </Field>

              <Field label="Ciudad">
                <Input
                  value={form.city}
                  onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  className="h-9 text-sm"
                  placeholder="Cali"
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Dirección de entrega">
                  <Input
                    value={form.address}
                    onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                    className="h-9 text-sm"
                    placeholder="Carrera 00 # 00-00 B/ Barrio"
                  />
                </Field>
              </div>

              {/* Vínculo con Session (contacto de WhatsApp) */}
              <div className="sm:col-span-2">
                <Field label="Contacto de WhatsApp (opcional)" hint="Vincula con una conversación existente">
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
                            {form.contactName || form.contactJid
                              ? `${form.contactName || 'Contacto'}${form.contactJid ? ` · ${form.contactJid}` : ''}`
                              : 'Buscar contacto...'}
                          </span>
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>

                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Buscar por nombre o número..."
                          value={contactQuery}
                          onValueChange={setContactQuery}
                        />
                        <CommandEmpty>{contactLoading ? 'Buscando...' : 'Sin resultados.'}</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="__clear__"
                            onSelect={() => {
                              setForm((prev) => ({ ...prev, sessionId: null, contactName: '', contactJid: '' }));
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
                                setForm((prev) => ({
                                  ...prev,
                                  sessionId: s.id,
                                  contactName: s.customName || s.pushName || '',
                                  contactJid: s.remoteJid ?? '',
                                  // Prefill nombre/teléfono si están vacíos
                                  name: prev.name.trim() || s.customName || s.pushName || prev.name,
                                  phone: prev.phone.trim() || (s.remoteJid ? s.remoteJid.replace(/@.*/, '') : prev.phone),
                                }));
                                setContactOpen(false);
                              }}
                            >
                              <Check
                                className={cn('mr-2 h-4 w-4', form.sessionId === s.id ? 'opacity-100' : 'opacity-0')}
                              />
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
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field label="Notas" hint="Opcional">
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    className="min-h-[64px] resize-y text-sm"
                    placeholder="Observaciones..."
                  />
                </Field>
              </div>

              {/* Campos personalizables por negocio */}
              <div className="sm:col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Campos personalizados</p>
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={addCustomField}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Agregar campo
                  </Button>
                </div>

                {form.customFields.length ? (
                  <div className="space-y-2">
                    {form.customFields.map((f, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={f.label}
                          onChange={(e) => updateCustomField(i, { label: e.target.value })}
                          className="h-9 flex-1 text-sm"
                          placeholder="Etiqueta (ej. NIT)"
                        />
                        <Input
                          value={f.value}
                          onChange={(e) => updateCustomField(i, { value: e.target.value })}
                          className="h-9 flex-1 text-sm"
                          placeholder="Valor"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => removeCustomField(i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Agrega campos propios de tu negocio (ej. NIT, cupo, condiciones de pago…).
                  </p>
                )}
              </div>
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
    </div>
  );
}
