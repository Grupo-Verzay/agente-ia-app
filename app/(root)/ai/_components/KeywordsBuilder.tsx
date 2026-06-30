"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, Trash2, ArrowRightLeft, ArrowRight, MessageSquare, X, Pencil, GripVertical, MoreVertical, Target, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { KeywordRule } from "@/types/agentAi";
import { useKeywordsAutosave } from "./hooks/useKeywordsAutosave";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
    sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
    promptId: string;
    version: number;
    onVersionChange: (v: number) => void;
    onConflict?: (serverState: any) => void;
    initialRules?: KeywordRule[];
    registerSaveHandler?: (fn: () => Promise<void>) => void;
}

const EMPTY_FORM = { keywords: [] as string[], response: "", action: "responder" as "responder" | "escalar", matchType: "contains" as "exact" | "contains" };

function SortableRule({
    rule,
    onEdit,
    onDelete,
}: {
    rule: KeywordRule;
    onEdit: (r: KeywordRule) => void;
    onDelete: (id: string) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const isEscalar = rule.action === "escalar";

    return (
        <div ref={setNodeRef} style={style} className={cn("flex items-center gap-1.5", isDragging && "opacity-50 z-10")}>
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted touch-none"
            >
                <GripVertical className="h-4 w-4" />
            </div>
            <div className="flex-1">
                <Card className="rounded-xl border border-border/70 bg-card/90 shadow-sm transition-shadow hover:shadow-md">
                    <CardContent className="flex items-center gap-3 p-3">
                        <div className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm",
                            isEscalar ? "bg-amber-500" : "bg-primary"
                        )}>
                            {isEscalar ? <ArrowRightLeft className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                                {rule.keywords.map((kw) => (
                                    <Badge key={kw} variant="secondary" className="text-xs font-normal">{kw}</Badge>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                                {isEscalar
                                    ? <span className="text-amber-600 font-medium">Escalar a asesor humano</span>
                                    : rule.response
                                }
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEdit(rule)}>
                                <Pencil className="h-3.5 w-3.5" />
                                Editar
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="w-9 px-0">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                        className="text-destructive flex items-center gap-2"
                                        onSelect={() => onDelete(rule.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        Eliminar
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

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

    const stableForce = useCallback(async () => { await forceSave(); }, [forceSave]);
    if (registerSaveHandler) registerSaveHandler(stableForce);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const ruleIds = useMemo(() => rules.map((r) => r.id), [rules]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        setRules((prev) => {
            const oldIndex = prev.findIndex((r) => r.id === active.id);
            const newIndex = prev.findIndex((r) => r.id === over.id);
            return arrayMove(prev, oldIndex, newIndex);
        });
    }, []);

    const openAdd = () => { setForm(EMPTY_FORM); setKwInput(""); setEditId(null); setFormOpen(true); };
    const openEdit = (r: KeywordRule) => { setForm({ keywords: [...r.keywords], response: r.response, action: r.action, matchType: (r as any).matchType ?? "contains" }); setKwInput(""); setEditId(r.id); setFormOpen(true); };
    const closeForm = () => { setFormOpen(false); setEditId(null); };

    const addKw = () => {
        const kw = kwInput.trim().toLowerCase();
        if (!kw || form.keywords.includes(kw)) return;
        setForm((f) => ({ ...f, keywords: [...f.keywords, kw] }));
        setKwInput("");
    };

    const removeKw = (kw: string) => setForm((f) => ({ ...f, keywords: f.keywords.filter((k) => k !== kw) }));

    const saveRule = () => {
        const pendingKw = kwInput.trim().toLowerCase();
        const allKeywords = pendingKw && !form.keywords.includes(pendingKw)
            ? [...form.keywords, pendingKw]
            : form.keywords;
        if (allKeywords.length === 0) return;
        if (form.action === "responder" && !form.response.trim()) return;
        const id = editId ?? crypto.randomUUID();
        const rule: KeywordRule = { id, keywords: allKeywords, response: form.response.trim(), action: form.action, matchType: form.matchType };
        setRules((prev) => editId ? prev.map((r) => r.id === editId ? rule : r) : [...prev, rule]);
        setKwInput("");
        closeForm();
    };

    const deleteRule = (id: string) => setRules((prev) => prev.filter((r) => r.id !== id));

    return (
        <Card className="border-muted/60">
            {/* Header */}
            <CardHeader className="pb-2 flex items-center justify-between gap-2 flex-row">
                <CardTitle className="text-base uppercase">Palabras clave</CardTitle>
                {rules.length === 0 && !formOpen && (
                    <Button size="sm" className="gap-2" onClick={openAdd}>
                        <Plus className="w-4 h-4" />
                        Agregar regla
                    </Button>
                )}
            </CardHeader>

            {/* Content */}
            <CardContent className="space-y-3">
                {rules.length === 0 && !formOpen && (
                    <div className="text-center text-sm text-muted-foreground py-2">
                        No has configurado ninguna regla. Crea tu primera regla con Agregar regla.
                    </div>
                )}

                {rules.length > 0 && (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={ruleIds} strategy={verticalListSortingStrategy}>
                            <div className="space-y-2">
                                {rules.map((r) => (
                                    <SortableRule key={r.id} rule={r} onEdit={openEdit} onDelete={deleteRule} />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}

                {/* Form */}
                {formOpen && (
                    <div className="rounded-lg border bg-card overflow-hidden">
                        <div className="p-4 space-y-4">
                            {/* Tipo de coincidencia + Palabras clave (una sola fila) */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[170px_1fr]">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold">Tipo de coincidencia</label>
                                    <Select
                                        value={form.matchType}
                                        onValueChange={(v) => setForm((f) => ({ ...f, matchType: v as "exact" | "contains" }))}
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="contains">
                                                <span className="flex items-center gap-2"><Search className="h-3.5 w-3.5" /> Contiene</span>
                                            </SelectItem>
                                            <SelectItem value="exact">
                                                <span className="flex items-center gap-2"><Target className="h-3.5 w-3.5" /> Exacta</span>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold">Palabras clave</label>
                                    <div className="flex gap-2">
                                        <div className="flex flex-wrap gap-1 flex-1 min-h-9 rounded-md border bg-background px-2 py-1.5 focus-within:ring-1 focus-within:ring-primary">
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
                                                placeholder={form.keywords.length === 0 ? "Ej.: precio, precios, cuánto cuesta..." : ""}
                                                className="flex-1 min-w-24 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            size="icon"
                                            className="h-9 w-9 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                                            onClick={addKw}
                                            disabled={!kwInput.trim()}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                        {form.matchType === "contains"
                                            ? "Coincide si el mensaje contiene la palabra clave."
                                            : "Coincide solo si el mensaje es exactamente la palabra o frase."}
                                    </p>
                                </div>
                            </div>

                            {/* Acción */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold">Acción</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setForm((f) => ({ ...f, action: "responder" }))}
                                        className={cn(
                                            "flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-xs font-medium transition-all",
                                            form.action === "responder"
                                                ? "border-primary bg-primary/10 text-primary shadow-sm"
                                                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                                        )}
                                    >
                                        <MessageSquare className="h-3.5 w-3.5" />
                                        Responder con texto
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setForm((f) => ({ ...f, action: "escalar" }))}
                                        className={cn(
                                            "flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-xs font-medium transition-all",
                                            form.action === "escalar"
                                                ? "border-amber-400 bg-amber-50 text-amber-700 shadow-sm dark:bg-amber-950/30 dark:text-amber-400"
                                                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                                        )}
                                    >
                                        <ArrowRightLeft className="h-3.5 w-3.5" />
                                        Escalar a asesor
                                    </button>
                                </div>
                            </div>

                            {/* Respuesta exacta */}
                            {form.action === "responder" && (
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold">Respuesta exacta</label>
                                    <Textarea
                                        rows={2}
                                        placeholder="Escribe exactamente lo que el agente debe responder..."
                                        value={form.response}
                                        onChange={(e) => setForm((f) => ({ ...f, response: e.target.value }))}
                                        className="text-sm resize-y min-h-[3rem]"
                                    />
                                </div>
                            )}

                            {/* Info escalar */}
                            {form.action === "escalar" && (
                                <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                                    <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    <span>El agente transferirá la conversación a un asesor humano cuando detecte estas palabras clave.</span>
                                </div>
                            )}

                            {/* Botones — Cancelar izquierda, Guardar derecha */}
                            <div className="flex items-center justify-between gap-2 pt-1 border-t">
                                <Button variant="outline" size="sm" onClick={closeForm}>Cancelar</Button>
                                <Button
                                    size="sm"
                                    disabled={(form.keywords.length === 0 && !kwInput.trim()) || (form.action === "responder" && !form.response.trim())}
                                    onClick={saveRule}
                                >
                                    {editId ? "Guardar cambios" : "Agregar regla"}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>

            {/* Footer — solo cuando hay reglas */}
            {rules.length > 0 && !formOpen && (
                <CardFooter className="pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>Cada regla intercepta mensajes</span>
                        <ArrowRight className="h-3 w-3 shrink-0" />
                        <span>antes de la IA</span>
                    </div>
                    <Button size="sm" className="gap-2" onClick={openAdd}>
                        <Plus className="w-4 h-4" />
                        Agregar regla
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
}
