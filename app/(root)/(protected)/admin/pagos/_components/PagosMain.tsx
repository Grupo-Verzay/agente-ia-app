"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Plus, Pencil, Trash2, ChevronUp, ChevronDown,
} from "lucide-react";
import {
  getAllPaymentMethodConfigs,
  savePaymentMethodConfig,
  deletePaymentMethodConfig,
  reorderPaymentMethods,
  type PaymentMethodConfigItem,
  type AccountField,
} from "@/actions/payment-method-config-actions";

type FormState = {
  id?: string;
  method: string;
  label: string;
  icon: string;
  isActive: boolean;
  instructions: string;
  accountFields: AccountField[];
};

const emptyForm = (): FormState => ({
  method: "",
  label: "",
  icon: "",
  isActive: true,
  instructions: "",
  accountFields: [{ label: "", value: "" }],
});

export function PagosMain() {
  const [methods, setMethods] = useState<PaymentMethodConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PaymentMethodConfigItem | null>(null);
  const [reordering, setReordering] = useState(false);

  const fetchMethods = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllPaymentMethodConfigs();
      if (res.success) setMethods(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchMethods(); }, [fetchMethods]);

  const openCreate = () => setForm(emptyForm());

  const openEdit = (m: PaymentMethodConfigItem) =>
    setForm({
      id: m.id,
      method: m.method,
      label: m.label,
      icon: m.icon ?? "",
      isActive: m.isActive,
      instructions: m.instructions ?? "",
      accountFields: m.accountFields.length ? m.accountFields : [{ label: "", value: "" }],
    });

  const handleSave = async () => {
    if (!form) return;
    if (!form.label.trim()) { toast.error("El nombre es requerido"); return; }
    if (!form.id && !form.method.trim()) { toast.error("El slug es requerido"); return; }
    setSaving(true);
    const res = await savePaymentMethodConfig({
      ...form,
      icon: form.icon || undefined,
      accountFields: form.accountFields.filter((f) => f.label.trim()),
    });
    if (res.success) {
      toast.success(res.message);
      setForm(null);
      void fetchMethods();
    } else {
      toast.error(res.message);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await deletePaymentMethodConfig(deleteTarget.id);
    if (res.success) {
      toast.success("Método eliminado");
      setDeleteTarget(null);
      void fetchMethods();
    } else {
      toast.error("Error al eliminar");
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const newList = [...methods];
    const swapIdx = index + dir;
    if (swapIdx < 0 || swapIdx >= newList.length) return;
    [newList[index], newList[swapIdx]] = [newList[swapIdx], newList[index]];
    setMethods(newList);
    setReordering(true);
    await reorderPaymentMethods(newList.map((m) => m.id));
    setReordering(false);
  };

  const updateField = (i: number, patch: Partial<AccountField>) =>
    setForm((prev) =>
      prev
        ? {
            ...prev,
            accountFields: prev.accountFields.map((f, idx) =>
              idx === i ? { ...f, ...patch } : f
            ),
          }
        : prev
    );

  const addField = () =>
    setForm((prev) =>
      prev ? { ...prev, accountFields: [...prev.accountFields, { label: "", value: "" }] } : prev
    );

  const removeField = (i: number) =>
    setForm((prev) =>
      prev
        ? { ...prev, accountFields: prev.accountFields.filter((_, idx) => idx !== i) }
        : prev
    );

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Métodos de Pago</h2>
          <p className="text-xs text-muted-foreground">
            Configura las cuentas que verán los clientes al pagar.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" /> Agregar método
        </Button>
      </div>

      {/* Lista */}
      {methods.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay métodos configurados. Agrega el primero.
        </p>
      ) : (
        <div className="space-y-2">
          {methods.map((m, i) => (
            <Card key={m.id} className="border-border">
              <CardHeader className="p-3">
                <div className="flex items-center gap-3">
                  {/* Flechas de orden */}
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      onClick={() => void move(i, -1)}
                      disabled={i === 0 || reordering}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => void move(i, 1)}
                      disabled={i === methods.length - 1 || reordering}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Emoji/icon */}
                  {m.icon && (
                    <span className="text-xl shrink-0">{m.icon}</span>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{m.label}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{m.method}</span>
                      {!m.isActive && (
                        <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>
                      )}
                    </div>
                    {m.accountFields.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate">
                        {m.accountFields.map((f) => f.value).filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => openEdit(m)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteTarget(m)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog open={!!form} onOpenChange={(v) => !v && setForm(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form?.id ? "Editar método de pago" : "Nuevo método de pago"}
            </DialogTitle>
          </DialogHeader>

          {form && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-[1fr_80px] gap-3">
                <div className="space-y-1">
                  <Label>Nombre *</Label>
                  <Input
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="Nequi, Bancolombia..."
                  />
                </div>
                <div className="space-y-1">
                  <Label>Emoji</Label>
                  <Input
                    value={form.icon}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    placeholder="🟣"
                    className="text-center text-lg"
                  />
                </div>
              </div>

              {!form.id && (
                <div className="space-y-1">
                  <Label>Slug único *</Label>
                  <Input
                    value={form.method}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        method: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                      })
                    }
                    placeholder="nequi, bancolombia, western_union..."
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Identificador interno, solo letras y guiones bajos.
                  </p>
                </div>
              )}

              {/* Datos de la cuenta */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Datos de la cuenta</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs gap-1"
                    onClick={addField}
                  >
                    <Plus className="h-3 w-3" /> Campo
                  </Button>
                </div>
                {form.accountFields.map((field, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1">
                      <Input
                        value={field.label}
                        onChange={(e) => updateField(i, { label: e.target.value })}
                        placeholder="Etiqueta (ej: Número)"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Input
                        value={field.value}
                        onChange={(e) => updateField(i, { value: e.target.value })}
                        placeholder="Valor (ej: 3001234567)"
                        className="h-8 text-xs"
                      />
                    </div>
                    <button
                      onClick={() => removeField(i)}
                      className="mt-1.5 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <Label>Instrucciones para el cliente</Label>
                <Textarea
                  rows={2}
                  value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                  placeholder="Envía el comprobante a nuestro WhatsApp..."
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                />
                Activo (visible para clientes)
              </label>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar método?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deleteTarget?.label}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
