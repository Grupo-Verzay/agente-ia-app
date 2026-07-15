"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
    getGoogleCalendarConfig,
    saveGoogleCalendarConfig,
} from "@/actions/google-calendar-actions";

export const GoogleCalendarSettings = ({ userId }: { userId: string }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const [calendarId, setCalendarId] = useState("");
    const [enabled, setEnabled] = useState(false);
    const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null);
    // Últimos valores guardados, para poder revertir con "Cancelar".
    const [saved, setSaved] = useState<{ calendarId: string; enabled: boolean }>({ calendarId: "", enabled: false });

    useEffect(() => {
        let active = true;
        getGoogleCalendarConfig(userId)
            .then((cfg) => {
                if (!active) return;
                const initial = { calendarId: cfg.calendarId ?? "", enabled: cfg.enabled };
                setCalendarId(initial.calendarId);
                setEnabled(initial.enabled);
                setSaved(initial);
                setServiceAccountEmail(cfg.serviceAccountEmail);
            })
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [userId]);

    const handleCopy = async () => {
        if (!serviceAccountEmail) return;
        try {
            await navigator.clipboard.writeText(serviceAccountEmail);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            toast.error("No se pudo copiar");
        }
    };

    const handleSave = async () => {
        if (enabled && !calendarId.trim()) {
            toast.error("Ingresa el ID de tu calendario para activar la sincronización");
            return;
        }
        setSaving(true);
        try {
            const res = await saveGoogleCalendarConfig(userId, {
                calendarId: calendarId.trim(),
                enabled,
            });
            if (res.success) {
                setSaved({ calendarId: calendarId.trim(), enabled: enabled && !!calendarId.trim() });
                toast.success("Configuración de Google Calendar guardada");
            } else {
                toast.error(res.error ?? "Error al guardar");
            }
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setCalendarId(saved.calendarId);
        setEnabled(saved.enabled);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3 pb-3 border-b">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                    <CalendarClock className="h-4 w-4 text-primary" />
                </div>
                <div>
                    <p className="text-sm font-semibold">Google Calendar</p>
                    <p className="text-xs text-muted-foreground">
                        Cada cita se crea automáticamente en tu calendario
                    </p>
                </div>
            </div>

            <div className="flex flex-1 flex-col">
            <div className="space-y-5">
            {/* Paso 1: compartir calendario con la cuenta de servicio */}
            <div className="space-y-1.5">
                <p className="app-typography-compact text-sm font-semibold text-foreground">
                    1. Comparte tu calendario con este correo
                </p>
                {serviceAccountEmail ? (
                    <div className="flex items-center gap-2">
                        <Input
                            readOnly
                            value={serviceAccountEmail}
                            className="flex-1 text-xs font-mono"
                            onFocus={(e) => e.currentTarget.select()}
                        />
                        <Button type="button" size="sm" variant="secondary" onClick={handleCopy} className="shrink-0">
                            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                    </div>
                ) : (
                    <p className="text-xs text-destructive">
                        No hay cuenta de servicio configurada. Contacta a soporte.
                    </p>
                )}
            </div>

            {/* Paso 2: ID del calendario */}
            <div className="space-y-1.5">
                <p className="app-typography-compact text-sm font-semibold text-foreground">2. ID de tu calendario</p>
                <Input
                    value={calendarId}
                    onChange={(e) => setCalendarId(e.target.value)}
                    placeholder="tucorreo@gmail.com"
                    className="text-sm font-mono"
                />
                <p className="text-xs text-muted-foreground">Normalmente tu mismo correo de Google.</p>
            </div>

            {/* Paso 3: activar */}
            <div className="space-y-1.5">
                <p className="app-typography-compact text-sm font-semibold text-foreground">3. Sincronización activa</p>
                <div className="flex min-h-10 items-center justify-between gap-4">
                    <p className="text-xs text-muted-foreground">
                        Crea, mueve y elimina eventos según cambien las citas
                    </p>
                    <Switch checked={enabled} onCheckedChange={setEnabled} className="shrink-0" />
                </div>
            </div>

            </div>

            <div className="flex items-center justify-between gap-2 pt-4 mt-auto">
                <Button type="button" variant="secondary" onClick={handleCancel} disabled={saving}>
                    Cancelar
                </Button>
                <Button type="button" variant="save" onClick={handleSave} disabled={saving}>
                    {saving ? "Guardando..." : "Guardar"}
                </Button>
            </div>
            </div>
        </div>
    );
};
