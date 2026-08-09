"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getUsdToCopRate, saveUsdToCopRate } from "@/actions/admin/usd-rate-actions";

/**
 * Tasa con la que se factura lo que aquí está en USD.
 *
 * Los precios se publican en dólares como referencia, pero el cobro entra en
 * pesos. La cuenta tiene que quedar facturada en la misma moneda del
 * comprobante o la validación del pago no cuadra y la renovación no se aplica
 * sola.
 */
export function UsdRateCard() {
  const [valor, setValor] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    getUsdToCopRate()
      .then((r) => setValor(r ? String(r) : ""))
      .finally(() => setCargando(false));
  }, []);

  const numero = Number(valor.replace(/[^\d.]/g, ""));
  const previewValido = Number.isFinite(numero) && numero > 0;

  return (
    <Card className="border-border">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold">Tasa de cobro USD → COP</p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Los precios de abajo son la referencia en dólares. El cobro sale en pesos con esta
            tasa. Vacío = se factura en dólares.
          </p>
          {previewValido && (
            <p className="hidden text-xs text-muted-foreground sm:block">
              Un plan de $50 USD se factura como ${(50 * numero).toLocaleString("es-CO")} COP.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Ej. 4000"
            inputMode="decimal"
            className="h-9 w-36"
            disabled={cargando}
          />
          <Button
            size="sm"
            disabled={cargando || guardando}
            onClick={async () => {
              const limpio = valor.trim();
              if (limpio && !previewValido) {
                toast.error("La tasa debe ser un número mayor que cero.");
                return;
              }
              setGuardando(true);
              const res = await saveUsdToCopRate(limpio ? numero : null);
              setGuardando(false);
              if (res.success) toast.success(res.message);
              else toast.error(res.message);
            }}
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
