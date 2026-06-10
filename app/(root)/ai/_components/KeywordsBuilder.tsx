"use client";

import { useCallback, useState } from "react";
import { Plus, Trash2, ArrowRightLeft, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { KeywordRule } from "@/types/agentAi";
import { useKeywordsAutosave } from "./hooks/useKeywordsAutosave";

interface Props {
    promptId: string;
    version: number;
    onVersionChange: (v: number) => void;
    onConflict?: (serverState: any) => void;
    initialRules?: KeywordRule[];
    registerSaveHandler?: (fn: () => Promise<void>) => void;
}

const EMPTY_FORM = { keywords: [] as string[], response: "", action: "responder" as "responder" | "escalar" };

export function KeywordsBuilder({ promptId, version, onVersionChange, onConflict, initialRules, registerSaveHandler }: Props) {
    const [rules, setRules] = useState<KeywordRule[]>(initialRules ?? []);
    const [formOpen, setFormOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [kwInput, setKwInput] = useState("");

    const { forceSave } = useKeywordsAutosave({
        promptId,
        version,
        rules,
        onVersionChange,
        onConflict,
        mode: "auto",
    });

    // Registrar handler de guardado manual
    const stableForce = useCallback(async () => { await forceSave(); }, [forceSave]);
    if (registerSaveHandler) registerSaveHandler(stableForce);

    const openAdd = () => { setForm(EMPTY_FORM); setKwInput(""); setEditId(null); setFormOpen(true); };
    const openEdit = (r: KeywordRule) => { setForm({ keywords: [...r.keywords], response: r.response, action: r.action }); setKwInput(""); setEditId(r.id); setFormOpen(true); };
    const closeForm = () => { setFormOpen(false); setEditId(null); };

    const addKw = () => {
        const kw = kwInput.trim().toLowerCase();
        if (!kw || form.keywords.includes(kw)) return;
        setForm((f) => ({ ...f, keywords: [...f.keywords, kw] }));
        setKwInput("");
    };

    const removeKw = (kw: string) => setForm((f) => ({ ...f, keywords: f.keywords.filter((k) => k !== kw) }));

    const saveRule = () => {
        if (form.keywords.length === 0) return;
        if (form.action === "responder" && !form.response.trim()) return;
        const id = editId ?? crypto.randomUUID();
        const rule: KeywordRule = { id, keywords: form.keywords, response: form.response.trim(), action: form.action };
        setRules((prev) => editId ? prev.map((r) => r.id === editId ? rule : r) : [...prev, rule]);
        closeForm();
    };

    const deleteRule = (id: string) => setRules((prev) => prev.filter((r) => r.id !== id));

    return (
        <div className="space-y-4 p-4">
            <div className="rounded-md bg-muted/40 border px-4 py-3 text-sm text-muted-foreground">
                Define palabras o frases clave que activan una respuesta directa del agente — sin procesar con IA. Ideal para preguntas muy frecuentes o acciones urgentes.
            </div>

            {rules.length === 0 && !formOpen && (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                    <MessageSquare className="h-8 w-8 opacity-30" />
                    <p>Ninguna regla configurada.</p>
                    <p className="text-xs">Agrega tu primera palabra clave para respuestas automáticas.</p>
                </div>
            )}

            {rules.length > 0 && (
                <div className="space-y-2">
                    {rules.map((r) => (
                        <div key={r.id} className="flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5">
                            <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex flex-wrap gap-1">
                                    {r.keywords.map((kw) => (
                                        <Badge key={kw} variant="secondary" className="text-xs font-normal">{kw}</Badge>
                                    ))}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    {r.action === "escalar" ? (
                                        <><ArrowRightLeft className="h-3 w-3 shrink-0 text-amber-500" /><span className="text-amber-600 font-medium">Escalar a asesor humano</span></>
                                    ) : (
                                        <><MessageSquare className="h-3 w-3 shrink-0 text-primary" /><span className="line-clamp-1">{r.response}</span></>
                                    )}
                                </div>
                            </div>
                            <div className="flex shrink-0 gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}>
                                    <span className="text-xs">✏️</span>
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteRule(r.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!formOpen && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={openAdd}>
                    <Plus className="h-3.5 w-3.5" />
                    Agregar regla
                </Button>
            )}

            {formOpen && (
                <div className="rounded-lg border bg-card p-4 space-y-3">
                    <p className="text-sm font-semibold">{editId ? "Editar regla" : "Nueva regla"}</p>

                    {/* Keywords input */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Palabras clave <span className="text-muted-foreground">(presiona Enter para agregar)</span></label>
                        <div className="flex flex-wrap gap-1 min-h-8 rounded-md border bg-background px-2 py-1.5 focus-within:ring-1 focus-within:ring-primary">
                            {form.keywords.map((kw) => (
                                <Badge key={kw} variant="secondary" className="gap-1 text-xs pr-1">
                                    {kw}
                                    <button type="button" onClick={() => removeKw(kw)} className="rounded-full hover:bg-muted-foreground/20">
                                        <X className="h-2.5 w-2.5" />
                                    </button>
                                </Badge>
                            ))}
                            <input
                                value={kwInput}
                                onChange={(e) => setKwInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addKw(); } }}
                                placeholder={form.keywords.length === 0 ? "Ej: precio, precios, cuánto cuesta..." : ""}
                                className="flex-1 min-w-24 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                            />
                        </div>
                    </div>

                    {/* Acción */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Acción</label>
                        <div className="flex gap-2">
                            {(["responder", "escalar"] as const).map((a) => (
                                <button
                                    key={a}
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, action: a }))}
                                    className={cn(
                                        "flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                                        form.action === a ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                                    )}
                                >
                                    {a === "responder" ? "💬 Responder con texto" : "↗ Escalar a asesor"}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Respuesta (solo si acción = responder) */}
                    {form.action === "responder" && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-foreground">Respuesta exacta</label>
                            <Textarea
                                rows={3}
                                placeholder="Escribe exactamente lo que el agente debe responder..."
                                value={form.response}
                                onChange={(e) => setForm((f) => ({ ...f, response: e.target.value }))}
                                className="text-sm resize-none"
                            />
                        </div>
                    )}

                    <div className="flex gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={closeForm}>Cancelar</Button>
                        <Button
                            size="sm"
                            disabled={form.keywords.length === 0 || (form.action === "responder" && !form.response.trim())}
                            onClick={saveRule}
                        >
                            {editId ? "Guardar cambios" : "Agregar regla"}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
