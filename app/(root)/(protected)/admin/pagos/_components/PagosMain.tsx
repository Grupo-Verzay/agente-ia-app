"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save } from "lucide-react";
import {
  getAllPaymentMethodConfigs,
  upsertPaymentMethodConfig,
  type PaymentMethodConfigItem,
} from "@/actions/payment-method-config-actions";
import {
  PAYMENT_METHOD_LABELS,
  ALL_PAYMENT_METHODS,
  ACCOUNT_INFO_FIELDS,
  type PaymentMethodKey,
} from "@/constants/payment-methods";

type FormState = {
  label: string;
  isActive: boolean;
  instructions: string;
  accountInfo: Record<string, string>;
};

export function PagosMain() {
  const [forms, setForms] = useState<Record<string, FormState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<PaymentMethodKey | null>(null);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllPaymentMethodConfigs();
      const formMap: Record<string, FormState> = {};
      for (const method of ALL_PAYMENT_METHODS) {
        const existing = res.success
          ? res.data.find((c) => c.method === method) ?? null
          : null;
        formMap[method] = {
          label: existing?.label ?? PAYMENT_METHOD_LABELS[method],
          isActive: existing?.isActive ?? false,
          instructions: existing?.instructions ?? "",
          accountInfo: (existing?.accountInfo as Record<string, string>) ?? {},
        };
      }
      setForms(formMap);
    } catch (e) {
      console.error("Error cargando métodos de pago:", e);
      // Inicializar forms con valores vacíos para que las tarjetas rendericen
      const formMap: Record<string, FormState> = {};
      for (const method of ALL_PAYMENT_METHODS) {
        formMap[method] = {
          label: PAYMENT_METHOD_LABELS[method],
          isActive: false,
          instructions: "",
          accountInfo: {},
        };
      }
      setForms(formMap);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchConfigs(); }, [fetchConfigs]);

  const updateForm = (method: string, patch: Partial<FormState>) =>
    setForms((prev) => ({ ...prev, [method]: { ...prev[method], ...patch } }));

  const updateAccountInfo = (method: string, key: string, value: string) =>
    setForms((prev) => ({
      ...prev,
      [method]: { ...prev[method], accountInfo: { ...prev[method]?.accountInfo, [key]: value } },
    }));

  const handleSave = async (method: PaymentMethodKey) => {
    const f = forms[method];
    if (!f) return;
    setSaving(method);
    const res = await upsertPaymentMethodConfig({
      method,
      label: f.label,
      isActive: f.isActive,
      instructions: f.instructions,
      accountInfo: f.accountInfo,
    });
    if (res.success) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
    setSaving(null);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <div>
        <h2 className="text-lg font-semibold">Métodos de Pago</h2>
        <p className="text-xs text-muted-foreground">
          Configura las cuentas que verán los clientes al pagar manualmente.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {ALL_PAYMENT_METHODS.map((method) => {
          const f = forms[method];
          const fields = ACCOUNT_INFO_FIELDS[method];
          const isSaving = saving === method;

          return (
            <Card key={method} className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{PAYMENT_METHOD_LABELS[method]}</CardTitle>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={f?.isActive ?? false}
                      onCheckedChange={(v) => updateForm(method, { isActive: v })}
                    />
                    {f?.isActive ? "Activo" : "Inactivo"}
                  </label>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {fields.map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      value={f?.accountInfo?.[key] ?? ""}
                      onChange={(e) => updateAccountInfo(method, key, e.target.value)}
                      placeholder={label}
                    />
                  </div>
                ))}
                <div className="space-y-1">
                  <Label className="text-xs">Instrucciones para el cliente</Label>
                  <Textarea
                    rows={2}
                    value={f?.instructions ?? ""}
                    onChange={(e) => updateForm(method, { instructions: e.target.value })}
                    placeholder="Envía el comprobante al WhatsApp..."
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={isSaving}
                  onClick={() => void handleSave(method)}
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <Save className="h-3.5 w-3.5 mr-1" />
                  )}
                  Guardar
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
