'use client';

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Crown, Loader2, Check } from "lucide-react";
import { getOwnerModeStatus, saveOwnerModeConfig } from "@/actions/owner-mode-actions";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  userId: string;
}

export function OwnerModeToggle({ userId }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    const result = await getOwnerModeStatus(userId);
    if (result.success) {
      setEnabled(result.enabled);
      setPhone(result.ownerPhone ?? "");
      setSavedPhone(result.ownerPhone ?? "");
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const persist = async (nextEnabled: boolean, nextPhone: string) => {
    setSaving(true);
    const result = await saveOwnerModeConfig(userId, nextEnabled, nextPhone);
    if (!result.success) {
      toast.error(result.message);
      await fetchStatus(); // revertir al estado real
    } else {
      toast.success(result.message);
      setSavedPhone((nextPhone ?? "").replace(/\D/g, ""));
    }
    setSaving(false);
  };

  const handleToggle = async (val: boolean) => {
    setEnabled(val);
    await persist(val, phone);
  };

  const handleSavePhone = async () => {
    await persist(enabled, phone);
  };

  const phoneDirty = phone.replace(/\D/g, "") !== savedPhone.replace(/\D/g, "");

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
        Escribe aquí el número de WhatsApp del dueño. La IA reconocerá los mensajes de
        ESE número como órdenes y las ejecutará (reportes, tareas, recordatorios, enviar
        mensajes a contactos, mover leads, etiquetar, asignar asesores y ajustar el
        entrenamiento). Cualquier otro número se atiende como cliente normal.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Cargando...
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Número del dueño (ej. 573001234567)"
            inputMode="tel"
            disabled={saving}
            className="h-8 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={handleSavePhone}
            disabled={saving || !phoneDirty}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            <span className="ml-1">Guardar</span>
          </Button>
        </div>
      )}

      {enabled && !savedPhone && !loading && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Escribe y guarda el número del dueño para que el Modo Dueño funcione.
        </p>
      )}
    </div>
  );
}
