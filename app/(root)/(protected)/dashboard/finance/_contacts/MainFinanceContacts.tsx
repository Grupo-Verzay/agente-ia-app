'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { TablaDeFinanzas } from '../_components/TablaDeFinanzas';
import { elNombreDelContacto, elNumeroDelContacto } from '@/lib/tabla-de-finanzas';
import { buildContactsColumns, type FinanceContactRow } from './columns';
import { SelectorDeCuentas } from '@/components/shared/SelectorDeCuentas';
import { columnaDeCuenta } from '@/components/shared/ColumnaDeCuenta';
import {
  esDeOtraCuenta,
  estaConsolidando,
  lasCuentasElegidas,
  nombresPorCuenta,
  type CuentaDeFinanzas,
} from '@/lib/finanzas-de-la-familia';
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
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { ChevronsUpDown, Check, UserRound, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BotonDeCrear } from '@/components/shared/BarraDeAcciones';
import { AccionesMasivas } from '@/components/shared/AccionesMasivas';
import { eliminarContactosDeFinanzasAction } from '@/actions/borrado-en-bloque-actions';

type ContactOption = { id: number; pushName?: string | null; customName?: string | null; remoteJid: string };

const LABELS: Record<FinanceContactKind, { singular: string; plural: string; articulo: string }> = {
  SUPPLIER: { singular: 'Proveedor', plural: 'Proveedores', articulo: 'el proveedor' },
  CLIENT: { singular: 'Cliente', plural: 'Clientes', articulo: 'el cliente' },
};

type Props = {
  userId: string;
  kind: FinanceContactKind;
  contacts: FinanceContactRow[];
  fields: FinanceFieldDef[];
  autoOpenCreate?: boolean;
  /** Las cuentas de la familia entre las que se puede elegir. Vacía: sin selector. */
  cuentasDisponibles?: CuentaDeFinanzas[];
  /** Las que están puestas ahora mismo, ya resueltas en el servidor. */
  cuentasElegidas?: string[];
};

// El nombre y el número de un contacto de WhatsApp los decide
// `lib/tabla-de-finanzas.ts`: el selector de contacto de Ventas los usa igual.
const cleanPhone = elNumeroDelContacto;
const contactDisplayName = elNombreDelContacto;

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

export default function MainFinanceContacts({
  userId,
  kind,
  contacts,
  fields,
  autoOpenCreate = false,
  cuentasDisponibles = [],
  cuentasElegidas = [],
}: Props) {
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

  const borrarLosMarcados = async (ids: string[]) => {
    const resumen = await eliminarContactosDeFinanzasAction(ids, userId);
    if (!resumen.success) toast.error(resumen.message);
    return { fallaron: resumen.fallaron };
  };

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
    setContactName(contactDisplayName(row.session?.customName || row.session?.pushName, row.session?.remoteJid));
    setContactJid(cleanPhone(row.session?.remoteJid));
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

  // Devuelve si se borró: la confirmación se queda abierta si el servidor dice
  // que no. Antes la papelera borraba sin preguntar.
  const onDelete = async (row: FinanceContactRow): Promise<boolean> => {
    const res = await deleteFinanceContact(row.id, userId);
    if (!res.success) {
      toast.error(res.message);
      return false;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    toast.success(`${labels.singular} eliminado`);
    router.refresh();
    return true;
  };

  const consolidando = estaConsolidando(cuentasElegidas);

  const nombresDeCuenta = useMemo(
    () => nombresPorCuenta(lasCuentasElegidas(cuentasDisponibles, cuentasElegidas)),
    [cuentasDisponibles, cuentasElegidas],
  );

  // Consolidar es para MIRAR, no para editar: las acciones de escritura de
  // Finanzas acotan por la cuenta con la que se llaman, así que el lápiz sobre
  // una fila ajena contestaría «no encontrada». Se ve, y para tocarla se entra
  // a esa cuenta.
  const filaAjena = useCallback(
    (fila: FinanceContactRow) => consolidando && esDeOtraCuenta(fila.userId, userId),
    [consolidando, userId],
  );

  const columns = useMemo(
    () => {
      const propias = buildContactsColumns({
        fields: config,
        queEs: labels.articulo,
        onEdit: openEdit,
        onDelete,
        busy: isPending,
        esDeOtraCuenta: filaAjena,
      });
      return consolidando
        ? [columnaDeCuenta<FinanceContactRow>((f) => f.userId, nombresDeCuenta), ...propias]
        : propias;
    },
    [config, isPending, consolidando, nombresDeCuenta, filaAjena], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const selectorDeCuentas =
    cuentasDisponibles.length > 0 ? (
      <SelectorDeCuentas disponibles={cuentasDisponibles} elegidas={cuentasElegidas} />
    ) : null;

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
                  {contactName
                    ? (contactJid && contactJid !== contactName ? `${contactName} · ${contactJid}` : contactName)
                    : (contactJid || 'Buscar contacto...')}
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
                  <span className="text-sm text-muted-foreground">Quitar vínculo</span>
                </CommandItem>
                {contactOptions.map((s) => {
                  const label = contactDisplayName(s.customName || s.pushName, s.remoteJid);
                  const phone = cleanPhone(s.remoteJid);
                  return (
                    <CommandItem
                      key={s.id}
                      value={`${s.pushName ?? ''} ${phone}`}
                      onSelect={() => {
                        setSessionId(s.id);
                        setContactName(label);
                        setContactJid(phone);
                        setValues((prev) => ({
                          ...prev,
                          name: (prev.name ?? '').trim() || label,
                          phone: (prev.phone ?? '').trim() || phone,
                        }));
                        setContactOpen(false);
                      }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', sessionId === s.id ? 'opacity-100' : 'opacity-0')} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{label}</p>
                        {label !== phone && (
                          <p className="truncate text-xs text-muted-foreground">{phone}</p>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
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
          {/* «Campos» no acota la lista: es lo que se hace sobre la lista entera,
              así que va en `secundarias`, al lado de «Columnas». Estaba metido
              con el azul, en el hueco de crear. */}
          <div className="flex-1 min-h-0">
            <TablaDeFinanzas
              columns={columns}
              data={rows}
              searchKey="name"
              searchPlaceholder={`Buscar ${labels.plural.toLowerCase()}...`}
              onRowClick={(fila) => { if (!filaAjena(fila)) openEdit(fila); }}
              queEs={labels.singular.toLowerCase()}
              vacio={`Todavía no hay ${labels.plural.toLowerCase()}.`}
              filtros={selectorDeCuentas}
              filaEditable={(fila) => !filaAjena(fila)}
              secundarias={
                <Button
                  variant="outline"
                  onClick={() => setBuilderOpen(true)}
                  disabled={isPending}
                  className="h-10 shrink-0 px-3 text-sm"
                  title="Configurar los campos de la ficha"
                  data-boton="campos"
                >
                  <SlidersHorizontal className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Campos</span>
                </Button>
              }
              crear={<BotonDeCrear onClick={openCreate} disabled={isPending}>Nuevo</BotonDeCrear>}
              acciones={(seleccionados, limpiar) => (
                <AccionesMasivas
                  seleccionados={seleccionados}
                  queSon={labels.plural.toLowerCase()}
                  onEliminar={borrarLosMarcados}
                  onTerminar={() => { limpiar(); router.refresh(); }}
                />
              )}
            />
          </div>
        </CardHeader>
      </Card>

      {/* Modal Crear/Editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex flex-col overflow-hidden rounded-2xl sm:max-w-[720px]">
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

          <div className="flex shrink-0 items-center justify-between gap-2 border-t pt-3">
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
