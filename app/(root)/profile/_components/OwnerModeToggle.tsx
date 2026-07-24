'use client';

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Crown, Loader2, Check, Pencil, X } from "lucide-react";
import { getOwnerModeStatus, saveOwnerModeConfig } from "@/actions/owner-mode-actions";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
}

export function OwnerModeToggle({ userId }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

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
    setEditing(false);
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
        Los mensajes de este número se toman como órdenes de la IA.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Cargando...
        </div>
      ) : savedPhone && !editing ? (
        /* Fila-tarjeta del dueño guardado (mismo estilo que un operario) */
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30">
          <Crown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">Dueño</p>
            <p className="text-xs text-muted-foreground truncate">{savedPhone}</p>
          </div>
          <span className={cn("text-[11px] font-medium shrink-0", enabled ? "text-green-600" : "text-muted-foreground")}>
            {enabled ? "Activo" : "Inactivo"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 shrink-0 text-muted-foreground hover:text-primary"
            onClick={() => setEditing(true)}
            title="Editar número"
          >
            <Pencil className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        /* Formulario enmarcado, igual que el de "Nuevo operario" */
        <div className="flex flex-col gap-2 px-3 py-2.5 rounded-lg border border-dashed border-primary/40 bg-primary/5">
          <div className="flex items-center gap-1.5">
            <Crown className="w-3 h-3 text-primary" />
            <span className="text-xs font-medium text-primary">Número del dueño</span>
          </div>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="WhatsApp del dueño (ej. 573001234567)"
            inputMode="tel"
            disabled={saving}
            className="h-8 text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={handleSavePhone}
              disabled={saving || !phoneDirty}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
              Guardar
            </Button>
            {savedPhone && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => { setPhone(savedPhone); setEditing(false); }}
                disabled={saving}
              >
                <X className="w-3 h-3 mr-1" />
                Cancelar
              </Button>
            )}
          </div>
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
