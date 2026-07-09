'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Headset, Check, Loader2, Plus, Trash2, X, User as UserIcon } from "lucide-react";
import {
    addOperatorContact,
    getOperatorContacts,
    removeOperatorContact,
    setOperatorBridgeEnabled,
    updateOperatorContact,
    type OperatorContact,
} from "@/actions/operator-contacts-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface Props {
    userId: string;
}

const MAX_OPERATORS = 10;

export function OperatorContactsManager({ userId }: Props) {
    const [enabled, setEnabled] = useState(false);
    const [savingEnabled, setSavingEnabled] = useState(false);

    const [operators, setOperators] = useState<OperatorContact[]>([]);
    const [loading, setLoading] = useState(true);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState("");
    const [newPhone, setNewPhone] = useState("");
    const [saving, setSaving] = useState(false);
    const addNameRef = useRef<HTMLInputElement>(null);

    const fetchOperators = useCallback(async () => {
        setLoading(true);
        const result = await getOperatorContacts(userId);
        if (result.success) {
            setOperators(result.data ?? []);
            setEnabled(!!result.bridgeEnabled);
        }
        setLoading(false);
    }, [userId]);

    useEffect(() => { void fetchOperators(); }, [fetchOperators]);

    useEffect(() => {
        if (showAddForm) setTimeout(() => addNameRef.current?.focus(), 50);
    }, [showAddForm]);

    const handleToggleEnabled = async (val: boolean) => {
        setSavingEnabled(true);
        setEnabled(val);
        const result = await setOperatorBridgeEnabled(userId, val);
        if (!result.success) {
            setEnabled(!val);
            toast.error(result.message);
        } else {
            toast.success(result.message);
        }
        setSavingEnabled(false);
    };

    const handleAdd = async () => {
        if (!newName.trim() || !newPhone.trim()) return;
        setSaving(true);
        const result = await addOperatorContact(userId, newName.trim(), newPhone.trim());
        if (result.success && result.data) {
            setOperators((prev) => [...prev, result.data!]);
            setNewName("");
            setNewPhone("");
            setShowAddForm(false);
            toast.success("Operario agregado");
        } else {
            toast.error(result.message);
        }
        setSaving(false);
    };

    const handleCancelAdd = () => {
        setShowAddForm(false);
        setNewName("");
        setNewPhone("");
    };

    const handleToggleActive = async (op: OperatorContact) => {
        setTogglingId(op.id);
        const next = !op.isActive;
        const result = await updateOperatorContact(op.id, userId, { isActive: next });
        if (result.success) {
            setOperators((prev) => prev.map((o) => (o.id === op.id ? { ...o, isActive: next } : o)));
        } else {
            toast.error(result.message);
        }
        setTogglingId(null);
    };

    const handleRemove = async (id: string) => {
        setRemovingId(id);
        const result = await removeOperatorContact(id, userId);
        if (result.success) {
            setOperators((prev) => prev.filter((o) => o.id !== id));
            toast.success("Operario eliminado");
        } else {
            toast.error(result.message);
        }
        setRemovingId(null);
    };

    const canAddMore = operators.length < MAX_OPERATORS;

    return (
        <div className="space-y-3">
            {/* Header + toggle */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                    <Headset className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Puente con operario
                    </span>
                </div>
                <Switch checked={enabled} onCheckedChange={handleToggleEnabled} disabled={savingEnabled} />
            </div>

            <p className="text-xs text-muted-foreground">
                Cuando la IA no puede resolver, consulta a un operario por WhatsApp (desde la línea del negocio),
                y al recibir su respuesta la reformula y se la envía al cliente.
            </p>

            {/* Lista */}
            {loading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Cargando operarios...
                </div>
            ) : (
                <div className={cn("space-y-2", !enabled && "opacity-60 pointer-events-none")}>
                    {operators.map((op) => (
                        <div
                            key={op.id}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30"
                        >
                            <UserIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{op.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{op.phone}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <Switch
                                    checked={op.isActive}
                                    onCheckedChange={() => handleToggleActive(op)}
                                    disabled={togglingId === op.id}
                                />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-6 h-6 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleRemove(op.id)}
                                    disabled={removingId === op.id}
                                >
                                    {removingId === op.id
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <Trash2 className="w-3 h-3" />}
                                </Button>
                            </div>
                        </div>
                    ))}

                    {operators.length === 0 && !showAddForm && (
                        <p className="text-xs text-muted-foreground text-center py-1">
                            Aún no hay operarios. Agrega al menos uno para activar el puente.
                        </p>
                    )}

                    {/* Add form */}
                    {showAddForm ? (
                        <div className="flex flex-col gap-2 px-3 py-2.5 rounded-lg border border-dashed border-primary/40 bg-primary/5">
                            <div className="flex items-center gap-1.5">
                                <Plus className="w-3 h-3 text-primary" />
                                <span className="text-xs font-medium text-primary">Nuevo operario</span>
                            </div>
                            <Input
                                ref={addNameRef}
                                placeholder="Nombre (ej. Técnico Juan)"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                disabled={saving}
                                className="h-8 text-sm"
                                onKeyDown={(e) => { if (e.key === "Escape") handleCancelAdd(); }}
                            />
                            <Input
                                placeholder="WhatsApp (ej. 573001234567)"
                                value={newPhone}
                                onChange={(e) => setNewPhone(e.target.value)}
                                disabled={saving}
                                className="h-8 text-sm"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") void handleAdd();
                                    if (e.key === "Escape") handleCancelAdd();
                                }}
                            />
                            <div className="flex gap-2">
                                <Button size="sm" className="h-7 text-xs flex-1" onClick={handleAdd} disabled={saving || !newName.trim() || !newPhone.trim()}>
                                    {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                                    Agregar
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleCancelAdd} disabled={saving}>
                                    <X className="w-3 h-3 mr-1" />
                                    Cancelar
                                </Button>
                            </div>
                        </div>
                    ) : (
                        canAddMore && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full h-8 text-xs border-dashed"
                                onClick={() => setShowAddForm(true)}
                            >
                                <Plus className="w-3.5 h-3.5 mr-1" />
                                Agregar operario
                            </Button>
                        )
                    )}

                    {!canAddMore && (
                        <p className="text-xs text-muted-foreground text-center py-1">
                            Límite alcanzado ({MAX_OPERATORS} operarios máximo).
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
