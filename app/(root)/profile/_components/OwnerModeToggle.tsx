'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Crown, Loader2, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  getOwnerModeStatus,
  setOwnerModeEnabled,
  saveOwnerPeople,
} from "@/actions/owner-mode-actions";
import type { OwnerPerson } from "@/lib/owner-contacts";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
}

const MAX_OWNERS = 5;

export function OwnerModeToggle({ userId }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [savingEnabled, setSavingEnabled] = useState(false);

  const [people, setPeople] = useState<OwnerPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState("");
  const addNameRef = useRef<HTMLInputElement>(null);

  // Edición inline (índice dentro de la lista).
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("");

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    const result = await getOwnerModeStatus(userId);
    if (result.success) {
      setEnabled(result.enabled);
      setPeople(result.people);
      // Compacto por defecto: el botón "Agregar persona" abre el formulario y
      // se cierra al guardar/cancelar.
      setShowAddForm(false);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    if (showAddForm) setTimeout(() => addNameRef.current?.focus(), 50);
  }, [showAddForm]);

  const persist = async (next: OwnerPerson[], okMsg: string) => {
    setSaving(true);
    const result = await saveOwnerPeople(userId, next);
    if (result.success) {
      setPeople(result.people);
      toast.success(okMsg);
    } else {
      toast.error(result.message);
      await fetchStatus();
    }
    setSaving(false);
    return result.success;
  };

  const handleToggleEnabled = async (val: boolean) => {
    setSavingEnabled(true);
    setEnabled(val);
    const result = await setOwnerModeEnabled(userId, val);
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
    const next = [...people, { name: newName.trim(), phone: newPhone.trim(), role: newRole.trim() || "Dueño" }];
    const ok = await persist(next, "Persona agregada");
    if (ok) {
      setNewName(""); setNewPhone(""); setNewRole("");
      setShowAddForm(false);
    }
  };

  const handleCancelAdd = () => {
    setShowAddForm(false);
    setNewName(""); setNewPhone(""); setNewRole("");
  };

  const startEdit = (idx: number) => {
    setShowAddForm(false);
    const p = people[idx];
    setEditingIdx(idx);
    setEditName(p.name);
    setEditPhone(p.phone);
    setEditRole(p.role);
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setEditName(""); setEditPhone(""); setEditRole("");
  };

  const handleSaveEdit = async () => {
    if (editingIdx === null || !editName.trim() || !editPhone.trim()) return;
    const next = people.map((p, i) =>
      i === editingIdx ? { name: editName.trim(), phone: editPhone.trim(), role: editRole.trim() || "Dueño" } : p,
    );
    const ok = await persist(next, "Persona actualizada");
    if (ok) cancelEdit();
  };

  const handleRemove = async (idx: number) => {
    const next = people.filter((_, i) => i !== idx);
    await persist(next, "Persona eliminada");
  };

  const canAddMore = people.length < MAX_OWNERS;

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
        <Switch checked={enabled} onCheckedChange={handleToggleEnabled} disabled={savingEnabled || loading} />
      </div>

      <p className="text-xs text-muted-foreground">
        Los mensajes de este número se toman como órdenes de la IA.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Cargando...
        </div>
      ) : (
        <div className={cn("space-y-2", !enabled && "opacity-60 pointer-events-none")}>
          {people.map((p, idx) =>
            editingIdx === idx ? (
              <div key={idx} className="flex flex-col gap-2 px-3 py-2.5 rounded-lg border border-dashed border-primary/40 bg-primary/5">
                <div className="flex items-center gap-1.5">
                  <Pencil className="w-3 h-3 text-primary" />
                  <span className="text-xs font-medium text-primary">Editar persona</span>
                </div>
                <Input placeholder="Nombre (ej. Juan)" value={editName} onChange={(e) => setEditName(e.target.value)} disabled={saving} className="h-8 text-sm" onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }} />
                <Input placeholder="WhatsApp (ej. 573001234567)" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} disabled={saving} className="h-8 text-sm" onKeyDown={(e) => { if (e.key === "Enter") void handleSaveEdit(); if (e.key === "Escape") cancelEdit(); }} />
                <Input placeholder="Cargo (ej. Dueño, Socio, Administrador)" value={editRole} onChange={(e) => setEditRole(e.target.value)} disabled={saving} className="h-8 text-sm" onKeyDown={(e) => { if (e.key === "Enter") void handleSaveEdit(); if (e.key === "Escape") cancelEdit(); }} />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs flex-1" onClick={handleSaveEdit} disabled={saving || !editName.trim() || !editPhone.trim()}>
                    {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                    Guardar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit} disabled={saving}>
                    <X className="w-3 h-3 mr-1" />
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30">
                <Crown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.phone}</p>
                  {p.role && <p className="text-[11px] text-primary/80 truncate">{p.role}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground hover:text-primary" onClick={() => startEdit(idx)} title="Editar">
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground hover:text-destructive" onClick={() => handleRemove(idx)} disabled={saving} title="Eliminar">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ),
          )}

          {/* Add form */}
          {showAddForm ? (
            <div className="flex flex-col gap-2 px-3 py-2.5 rounded-lg border border-dashed border-primary/40 bg-primary/5">
              <div className="flex items-center gap-1.5">
                <Plus className="w-3 h-3 text-primary" />
                <span className="text-xs font-medium text-primary">Nueva persona</span>
              </div>
              <Input ref={addNameRef} placeholder="Nombre (ej. Juan)" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={saving} className="h-8 text-sm" onKeyDown={(e) => { if (e.key === "Escape") handleCancelAdd(); }} />
              <Input placeholder="WhatsApp (ej. 573001234567)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} disabled={saving} className="h-8 text-sm" onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); if (e.key === "Escape") handleCancelAdd(); }} />
              <Input placeholder="Cargo (ej. Dueño, Socio, Administrador)" value={newRole} onChange={(e) => setNewRole(e.target.value)} disabled={saving} className="h-8 text-sm" onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); if (e.key === "Escape") handleCancelAdd(); }} />
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs flex-1" onClick={handleAdd} disabled={saving || !newName.trim() || !newPhone.trim()}>
                  {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                  Guardar
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleCancelAdd} disabled={saving}>
                  <X className="w-3 h-3 mr-1" />
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            canAddMore && (
              <Button variant="outline" size="sm" className="w-full h-8 text-xs border-dashed" onClick={() => setShowAddForm(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Agregar persona
              </Button>
            )
          )}

          {!canAddMore && (
            <p className="text-xs text-muted-foreground text-center py-1">
              Límite alcanzado ({MAX_OWNERS} personas máximo).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
