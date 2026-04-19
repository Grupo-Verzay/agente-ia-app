'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, Check, Loader2, Pencil, Phone, Plus, Shield, Trash2, X } from "lucide-react";
import {
    addNotificationContact,
    getNotificationContacts,
    removeNotificationContact,
    updateNotificationContact,
    type NotificationContact,
} from "@/actions/notification-contacts-actions";
import { updateClientDataByField } from "@/actions/userClientDataActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
    userId: string;
    primaryNumber: string;
}

interface EditingState {
    id: string;
    phone: string;
    label: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_CONTACTS = 5;

function PhoneRow({
    contact,
    isPrimary = false,
    onEdit,
    onRemove,
    removing,
}: {
    contact: NotificationContact;
    isPrimary?: boolean;
    onEdit?: (c: NotificationContact) => void;
    onRemove?: (id: string) => void;
    removing?: boolean;
}) {
    return (
        <div
            className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                isPrimary
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-muted/30 hover:bg-muted/50",
            )}
        >
            <Phone className={cn("w-3.5 h-3.5 shrink-0", isPrimary ? "text-primary" : "text-muted-foreground")} />

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{contact.phone}</p>
                {contact.label && (
                    <p className="text-xs text-muted-foreground truncate">{contact.label}</p>
                )}
            </div>

            {isPrimary && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 text-primary border-primary/40">
                    <Shield className="w-2.5 h-2.5 mr-1" />
                    Principal
                </Badge>
            )}

            {!isPrimary && (
                <div className="flex items-center gap-1 shrink-0">
                    <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-6 h-6 text-muted-foreground hover:text-foreground"
                                    onClick={() => onEdit?.(contact)}
                                >
                                    <Pencil className="w-3 h-3" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Editar</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-6 h-6 text-muted-foreground hover:text-destructive"
                                    onClick={() => onRemove?.(contact.id)}
                                    disabled={removing}
                                >
                                    {removing ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                        <Trash2 className="w-3 h-3" />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Eliminar</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            )}
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function NotificationContactsManager({ userId, primaryNumber }: Props) {
    const [primary, setPrimary] = useState(primaryNumber);
    const [primaryInput, setPrimaryInput] = useState(primaryNumber);
    const [savingPrimary, setSavingPrimary] = useState(false);

    const [contacts, setContacts] = useState<NotificationContact[]>([]);
    const [loading, setLoading] = useState(true);
    const [removingId, setRemovingId] = useState<string | null>(null);

    // Add form
    const [showAddForm, setShowAddForm] = useState(false);
    const [newPhone, setNewPhone] = useState("");
    const [newLabel, setNewLabel] = useState("");
    const [saving, setSaving] = useState(false);
    const addPhoneRef = useRef<HTMLInputElement>(null);

    // Edit form
    const [editing, setEditing] = useState<EditingState | null>(null);
    const [savingEdit, setSavingEdit] = useState(false);

    // ── Fetch ──────────────────────────────────────────────────────────────────

    const fetchContacts = useCallback(async () => {
        setLoading(true);
        const result = await getNotificationContacts(userId);
        if (result.success) {
            setContacts(result.data ?? []);
        }
        setLoading(false);
    }, [userId]);

    useEffect(() => { void fetchContacts(); }, [fetchContacts]);

    useEffect(() => {
        if (showAddForm) {
            setTimeout(() => addPhoneRef.current?.focus(), 50);
        }
    }, [showAddForm]);

    // ── Primary number handlers ────────────────────────────────────────────────

    const handlePrimaryBlur = async () => {
        const trimmed = primaryInput.trim();
        if (trimmed === primary) return;

        if (trimmed.length < 7 || trimmed.length > 20) {
            toast.error("Ingresa un número válido (7-20 dígitos).");
            setPrimaryInput(primary);
            return;
        }

        setSavingPrimary(true);
        toast.loading("Guardando...", { id: "primary-phone" });
        try {
            const result = await updateClientDataByField(userId, "notificationNumber", trimmed);
            if (result.success) {
                setPrimary(trimmed);
                toast.success("Número principal actualizado", { id: "primary-phone" });
            } else {
                setPrimaryInput(primary);
                toast.error(result.message ?? "Error al guardar", { id: "primary-phone" });
            }
        } catch {
            setPrimaryInput(primary);
            toast.error("Error al guardar", { id: "primary-phone" });
        } finally {
            setSavingPrimary(false);
        }
    };

    // ── Add handlers ──────────────────────────────────────────────────────────

    const handleAdd = async () => {
        if (!newPhone.trim()) return;
        setSaving(true);
        toast.loading("Agregando...", { id: "add-contact" });
        const result = await addNotificationContact(userId, newPhone.trim(), newLabel.trim() || undefined);
        if (result.success && result.data) {
            setContacts((prev) => [...prev, result.data!]);
            setNewPhone("");
            setNewLabel("");
            setShowAddForm(false);
            toast.success("Número agregado", { id: "add-contact" });
        } else {
            toast.error(result.message, { id: "add-contact" });
        }
        setSaving(false);
    };

    const handleCancelAdd = () => {
        setShowAddForm(false);
        setNewPhone("");
        setNewLabel("");
    };

    // ── Edit handlers ─────────────────────────────────────────────────────────

    const handleStartEdit = (contact: NotificationContact) => {
        setEditing({ id: contact.id, phone: contact.phone, label: contact.label ?? "" });
    };

    const handleSaveEdit = async () => {
        if (!editing) return;
        setSavingEdit(true);
        toast.loading("Guardando...", { id: "edit-contact" });
        const result = await updateNotificationContact(
            editing.id,
            userId,
            editing.phone.trim(),
            editing.label.trim() || undefined,
        );
        if (result.success) {
            setContacts((prev) =>
                prev.map((c) =>
                    c.id === editing.id
                        ? { ...c, phone: editing.phone.trim(), label: editing.label.trim() || null }
                        : c,
                ),
            );
            setEditing(null);
            toast.success("Contacto actualizado", { id: "edit-contact" });
        } else {
            toast.error(result.message, { id: "edit-contact" });
        }
        setSavingEdit(false);
    };

    const handleCancelEdit = () => setEditing(null);

    // ── Remove handler ────────────────────────────────────────────────────────

    const handleRemove = async (id: string) => {
        setRemovingId(id);
        const result = await removeNotificationContact(id, userId);
        if (result.success) {
            setContacts((prev) => prev.filter((c) => c.id !== id));
            toast.success("Número eliminado");
        } else {
            toast.error(result.message);
        }
        setRemovingId(null);
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const totalNumbers = 1 + contacts.length; // 1 primary + additional
    const canAddMore = totalNumbers < MAX_CONTACTS;

    return (
        <div className="space-y-3">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Números de notificación
                    </span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                        {totalNumbers}/{MAX_CONTACTS}
                    </Badge>
                </div>

                {canAddMore && !showAddForm && !editing && (
                    <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-6 h-6 text-muted-foreground hover:text-primary"
                                    onClick={() => setShowAddForm(true)}
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Agregar número</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>

            {/* Description */}
            <p className="text-xs text-muted-foreground">
                Las notificaciones del sistema se envían a todos los números configurados.
            </p>

            {/* Primary number */}
            <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                    <Shield className="w-3 h-3 text-primary" />
                    <span className="text-xs font-medium text-muted-foreground">Principal</span>
                    {savingPrimary && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground ml-auto" />}
                </div>
                <Input
                    placeholder="573233246305"
                    value={primaryInput}
                    onChange={(e) => setPrimaryInput(e.target.value)}
                    onBlur={handlePrimaryBlur}
                    disabled={savingPrimary}
                    className="h-9 text-sm"
                />
            </div>

            {/* Additional contacts list */}
            {loading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Cargando contactos...
                </div>
            ) : (
                <div className="space-y-2">
                    {contacts.map((contact) =>
                        editing?.id === contact.id ? (
                            /* ── Edit inline form ── */
                            <div key={contact.id} className="flex flex-col gap-2 px-3 py-2.5 rounded-lg border border-primary/30 bg-primary/5">
                                <div className="flex items-center gap-1.5">
                                    <Pencil className="w-3 h-3 text-primary" />
                                    <span className="text-xs font-medium text-primary">Editando</span>
                                </div>
                                <Input
                                    placeholder="Número de teléfono"
                                    value={editing.phone}
                                    onChange={(e) => setEditing((s) => s ? { ...s, phone: e.target.value } : s)}
                                    disabled={savingEdit}
                                    className="h-8 text-sm"
                                    autoFocus
                                />
                                <Input
                                    placeholder="Etiqueta (opcional)"
                                    value={editing.label}
                                    onChange={(e) => setEditing((s) => s ? { ...s, label: e.target.value } : s)}
                                    disabled={savingEdit}
                                    className="h-8 text-sm"
                                />
                                <div className="flex gap-2">
                                    <Button size="sm" className="h-7 text-xs flex-1" onClick={handleSaveEdit} disabled={savingEdit || !editing.phone.trim()}>
                                        {savingEdit ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                                        Guardar
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleCancelEdit} disabled={savingEdit}>
                                        <X className="w-3 h-3 mr-1" />
                                        Cancelar
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <PhoneRow
                                key={contact.id}
                                contact={contact}
                                onEdit={handleStartEdit}
                                onRemove={handleRemove}
                                removing={removingId === contact.id}
                            />
                        )
                    )}
                </div>
            )}

            {/* Add form */}
            {showAddForm && (
                <div className="flex flex-col gap-2 px-3 py-2.5 rounded-lg border border-dashed border-primary/40 bg-primary/5">
                    <div className="flex items-center gap-1.5">
                        <Plus className="w-3 h-3 text-primary" />
                        <span className="text-xs font-medium text-primary">Nuevo número</span>
                    </div>
                    <Input
                        ref={addPhoneRef}
                        placeholder="Ej. 573001234567"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        disabled={saving}
                        className="h-8 text-sm"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void handleAdd();
                            if (e.key === "Escape") handleCancelAdd();
                        }}
                    />
                    <Input
                        placeholder="Etiqueta (opcional, ej. Ventas)"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        disabled={saving}
                        className="h-8 text-sm"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void handleAdd();
                            if (e.key === "Escape") handleCancelAdd();
                        }}
                    />
                    <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs flex-1" onClick={handleAdd} disabled={saving || !newPhone.trim()}>
                            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                            Agregar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleCancelAdd} disabled={saving}>
                            <X className="w-3 h-3 mr-1" />
                            Cancelar
                        </Button>
                    </div>
                </div>
            )}

            {/* Max reached hint */}
            {!canAddMore && !editing && (
                <p className="text-xs text-muted-foreground text-center py-1">
                    Límite alcanzado ({MAX_CONTACTS} números máximo).
                </p>
            )}
        </div>
    );
}
