'use client';

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Crown, Loader2, AlertTriangle } from "lucide-react";
import { getOwnerModeStatus, setOwnerModeEnabled } from "@/actions/owner-mode-actions";
import { Switch } from "@/components/ui/switch";

interface Props {
  userId: string;
}

const DEFAULT_NUMBER = "0000000000";

export function OwnerModeToggle({ userId }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [notificationNumber, setNotificationNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    const result = await getOwnerModeStatus(userId);
    if (result.success) {
      setEnabled(result.enabled);
      setNotificationNumber(result.notificationNumber ?? "");
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleToggle = async (val: boolean) => {
    setSaving(true);
    setEnabled(val);
    const result = await setOwnerModeEnabled(userId, val);
    if (!result.success) {
      setEnabled(!val);
      toast.error(result.message);
    } else {
      toast.success(result.message);
    }
    setSaving(false);
  };

  const numberMissing =
    !notificationNumber.trim() || notificationNumber.replace(/\D/g, "") === DEFAULT_NUMBER;

  return (
    <div className="space-y-3">
      {/* Header + toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Crown className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Modo Dueño por WhatsApp
          </span>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} disabled={saving || loading} />
      </div>

      <p className="text-xs text-muted-foreground">
        Permite que TÚ le des órdenes al agente escribiéndole por WhatsApp desde tu número
        personal: pedir reportes, crear tareas o recordatorios, enviar mensajes a contactos,
        mover leads, etiquetar, asignar asesores y ajustar el entrenamiento del agente.
        Solo se reconoce a quien escribe desde el número de notificación de la cuenta.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Cargando...
        </div>
      ) : (
        enabled && numberMissing && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Configura tu <strong>número de notificación</strong> real (arriba) para que el
              agente te reconozca como dueño. Sin un número válido, el Modo Dueño no funcionará.
            </span>
          </div>
        )
      )}
    </div>
  );
}
