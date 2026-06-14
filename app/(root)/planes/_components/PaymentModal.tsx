"use client";

import { useState } from "react";
import { PaymentMethodType } from "@prisma/client";
import { toast } from "sonner";
import { Plan } from "@prisma/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Upload, ExternalLink, ArrowLeft } from "lucide-react";
import { type SubscriptionPlanItem } from "@/actions/subscription-plan-actions";
import { type PaymentMethodConfigItem, PAYMENT_METHOD_LABELS } from "@/actions/payment-method-config-actions";
import { createUserSubscription } from "@/actions/user-subscription-actions";
import { PLAN_LABELS } from "@/types/plans";
import { cn } from "@/lib/utils";

interface Props {
  plan: SubscriptionPlanItem;
  paymentMethods: PaymentMethodConfigItem[];
  open: boolean;
  onClose: () => void;
}

type Step = "method" | "instructions" | "success";

export function PaymentModal({ plan, paymentMethods, open, onClose }: Props) {
  const [step, setStep] = useState<Step>("method");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodConfigItem | null>(null);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep("method");
    setSelectedMethod(null);
    setReceiptUrl("");
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSelectMethod = (method: PaymentMethodConfigItem) => {
    setSelectedMethod(method);
    setStep("instructions");
  };

  const handleConfirmPayment = async () => {
    if (!selectedMethod) return;
    setSaving(true);
    const res = await createUserSubscription({
      subscriptionPlanId: plan.id,
      paymentMethod: selectedMethod.method,
      amountUSD: plan.priceUSD,
      receiptUrl: receiptUrl || undefined,
    });
    if (res.success) {
      setStep("success");
    } else {
      toast.error("Error al registrar el pago. Intenta de nuevo.");
    }
    setSaving(false);
  };

  const accountInfo = selectedMethod?.accountInfo ?? {};

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "success"
              ? "¡Pago registrado!"
              : `Plan ${PLAN_LABELS[plan.plan as Plan]} — $${plan.priceUSD} USD/mes`}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Elegir método */}
        {step === "method" && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Selecciona tu método de pago preferido:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((m) => (
                <button
                  key={m.method}
                  onClick={() => handleSelectMethod(m)}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-lg border p-4 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5",
                    selectedMethod?.method === m.method && "border-primary bg-primary/5"
                  )}
                >
                  <span className="text-base">{getMethodEmoji(m.method)}</span>
                  <span className="mt-1">{m.label}</span>
                </button>
              ))}
            </div>
            {paymentMethods.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay métodos de pago disponibles en este momento.
              </p>
            )}
          </div>
        )}

        {/* Step 2: Instrucciones de pago */}
        {step === "instructions" && selectedMethod && (
          <div className="space-y-4 py-2">
            <button
              onClick={() => setStep("method")}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Cambiar método
            </button>

            <div className="rounded-lg bg-muted p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{getMethodEmoji(selectedMethod.method)}</span>
                <span className="font-semibold text-sm">{selectedMethod.label}</span>
                <Badge variant="outline" className="ml-auto text-xs">
                  ${plan.priceUSD} USD
                </Badge>
              </div>

              {/* Datos de cuenta */}
              <div className="space-y-1.5">
                {Object.entries(accountInfo)
                  .filter(([, v]) => v)
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between text-xs">
                      <span className="text-muted-foreground capitalize">{formatKey(key)}:</span>
                      <span className="font-medium text-right ml-2">{value}</span>
                    </div>
                  ))}
              </div>

              {selectedMethod.instructions && (
                <p className="text-xs text-muted-foreground border-t pt-2">
                  {selectedMethod.instructions}
                </p>
              )}
            </div>

            {/* URL del comprobante */}
            <div className="space-y-1">
              <Label className="text-xs">
                Enlace del comprobante de pago{" "}
                <span className="text-muted-foreground">(opcional pero recomendado)</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  value={receiptUrl}
                  onChange={(e) => setReceiptUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="text-xs"
                />
                {receiptUrl && (
                  <a
                    href={receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-2 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Pega el link de una imagen subida a Google Drive, Dropbox, etc.
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={handleClose}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleConfirmPayment} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                Ya pagué
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Éxito */}
        {step === "success" && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle2 className="h-14 w-14 text-green-500" />
            <div>
              <p className="font-semibold">¡Pago registrado correctamente!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nuestro equipo revisará tu pago y activará tu plan en breve.
                Te notificaremos cuando esté listo.
              </p>
            </div>
            <Button className="mt-2" onClick={handleClose}>
              Entendido
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getMethodEmoji(method: PaymentMethodType): string {
  const map: Record<PaymentMethodType, string> = {
    WOMPI: "💳",
    NEQUI: "🟣",
    BANCOLOMBIA: "🏦",
    BINANCE: "🟡",
    ZELLE: "💙",
    PAGO_MOVIL: "📱",
  };
  return map[method] ?? "💰";
}

function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}
