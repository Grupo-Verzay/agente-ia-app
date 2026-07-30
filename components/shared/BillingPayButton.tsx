"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { crearEnlacePagoRenovacion } from "@/actions/billing/wompi-checkout-actions";

/**
 * Botón de pago de la pantalla de bloqueo.
 *
 * Es el único sitio donde el cliente bloqueado puede pagarse solo: el bloqueo
 * cubre toda la app, así que el botón del perfil le queda detrás de la puerta.
 * El enlace se genera aquí, en el momento, porque lleva la cuenta dentro; es lo
 * que permite que el pago se aplique sin que nadie toque nada.
 */
export default function BillingPayButton({ label }: { label: string }) {
  const [pendiente, setPendiente] = useState(false);

  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={async () => {
        setPendiente(true);
        const res = await crearEnlacePagoRenovacion();
        setPendiente(false);
        if (!res.success || !res.url) {
          toast.error(res.message);
          return;
        }
        window.open(res.url, "_blank", "noopener,noreferrer");
      }}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
    >
      {pendiente ? (
        <><Loader2 className="h-4 w-4 animate-spin" />Preparando pago...</>
      ) : (
        <><CreditCard className="h-4 w-4" />{label}</>
      )}
    </button>
  );
}
