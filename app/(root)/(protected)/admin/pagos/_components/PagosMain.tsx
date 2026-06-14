"use client";

import { useCallback, useEffect, useState } from "react";
import { PaymentMethodType } from "@prisma/client";
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
  PAYMENT_METHOD_LABELS,
  type PaymentMethodConfigItem,
} from "@/actions/payment-method-config-actions";

const ALL_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethodType[];

const ACCOUNT_INFO_FIELDS: Record<PaymentMethodType, { key: string; label: string }[]> = {
  WOMPI:       [{ key: "publicKey", label: "Llave pública (pub_test/pub_prod)" }, { key: "redirectUrl", label: "URL de redirección" }],
  NEQUI:       [{ key: "phone", label: "Número Nequi" }, { key: "name", label: "Nombre titular" }],
  BANCOLOMBIA: [{ key: "accountType", label: "Tipo de cuenta" }, { key: "accountNumber", label: "Número de cuenta" }, { key: "name", label: "Nombre titular" }],
  BINANCE:     [{ key: "uid", label: "UID Binance" }, { key: "name", label: "Nombre" }],
  ZELLE:       [{ key: "email", label: "Email Zelle" }, { key: "name", label: "Nombre" }],
  PAGO_MOVIL:  [{ key: "phone", label: "Número" }, { key: "bank", label: "Banco" }, { key: "name", label: "Nombre titular" }],
};

type FormState = {
  label: string;
  isActive: boolean;
  instructions: string;
  accountInfo: Record<string, string>;
};

export function PagosMain() {
  const [configs, setConfigs] = useState<Record<PaymentMethodType, PaymentMethodConfigItem | null>>(
    {} as Record<PaymentMethodType, PaymentMethodConfigItem | null>
  );
  const [forms, setForms] = useState<Record<PaymentMethodType, FormState>>(
    {} as Record<PaymentMethodType, FormState>
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<PaymentMethodType | null>(null);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
    const res = await getAllPaymentMethodConfigs();
    if (res.success) {
      const map = {} as Record<PaymentMethodType, PaymentMethodConfigItem | null>;
      const formMap = {} as Record<PaymentMethodType, FormState>;

      for (const method of ALL_METHODS) {
        const existing = res.data.find((c) => c.method === method) ?? null;
        map[method] = existing;
        formMap[method] = {
          label: existing?.label ?? PAYMENT_METHOD_LABELS[method],
          isActive: existing?.isActive ?? false,
          instructions: existing?.instructions ?? "",
          accountInfo: existing?.accountInfo ?? {},
        };
      }
      setConfigs(map);
      setForms(formMap);
    }
    } catch (e) {
      console.error("Error cargando métodos de pago:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchConfigs(); }, [fetchConfigs]);

  const updateForm = (method: PaymentMethodType, patch: Partial<FormState>) =>
    setForms((prev) => ({ ...prev, [method]: { ...prev[method], ...patch } }));

  const updateAccountInfo = (method: PaymentMethodType, key: string, value: string) =>
    setForms((prev) => ({
      ...prev,
      [method]: { ...prev[method], accountInfo: { ...prev[method].accountInfo, [key]: value } },
    }));

  const handleSave = async (method: PaymentMethodType) => {
    setSaving(method);
    const f = forms[method];
    const res = await upsertPaymentMethodConfig({
      method,
      label: f.label,
      isActive: f.isActive,
      instructions: f.instructions,
      accountInfo: f.accountInfo,
    });
    if (res.success) {
      toast.success(res.message);
      void fetchConfigs();
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
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-lg font-semibold">Métodos de Pago</h2>
        <p className="text-xs text-muted-foreground">
          Configura las cuentas que verán los clientes al pagar manualmente.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {ALL_METHODS.map((method) => {
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
                      value={f?.accountInfo[key] ?? ""}
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
