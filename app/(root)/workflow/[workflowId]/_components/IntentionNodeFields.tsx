'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import type { WorkflowNodeDB } from '@/types/workflow-node';
import { updateIntentionNodeConfig } from '@/actions/workflow-node-action';

function parseKeywords(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.map(String).map((s) => s.trim()).filter(Boolean) : [];
    } catch {
        // fallback si en algún momento guardaste CSV
        return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
}

function normalizeKeywords(list: string[]) {
    // sin duplicados (case-insensitive)
    const seen = new Set<string>();
    const out: string[] = [];
    for (const k of list) {
        const v = k.trim();
        if (!v) continue;
        const key = v.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
    }
    return out;
}

type Props = {
    node: WorkflowNodeDB;
};

export function IntentionNodeFields({ node }: Props) {
    const router = useRouter();

    const initialKeywords = useMemo(() => parseKeywords(node.keywords), [node.keywords]);

    const [keywords, setKeywords] = useState<string[]>(initialKeywords);
    const [keywordInput, setKeywordInput] = useState('');

    const [miniPrompt, setMiniPrompt] = useState(node.miniPrompt ?? '');
    const [threshold, setThreshold] = useState<number>(node.threshold ?? 0.5);
    const [noMatchMessage, setNoMatchMessage] = useState(node.noMatchMessage ?? '');

    // si router.refresh trae cambios, resetea estado local
    useEffect(() => {
        setKeywords(initialKeywords);
    }, [initialKeywords]);

    useEffect(() => {
        setMiniPrompt(node.miniPrompt ?? '');
        setThreshold(node.threshold ?? 0.5);
        setNoMatchMessage(node.noMatchMessage ?? '');
    }, [node.miniPrompt, node.threshold, node.noMatchMessage]);

    const addKeyword = () => {
        const next = normalizeKeywords([...keywords, keywordInput]);
        if (next.length === keywords.length) {
            if (!keywordInput.trim()) return;
            toast.info('La keyword ya existe');
            setKeywordInput('');
            return;
        }
        if (next.length > 30) {
            toast.error('Máximo 30 palabras clave');
            return;
        }
        setKeywords(next);
        setKeywordInput('');
    };

    const removeKeyword = (k: string) => {
        setKeywords((prev) => prev.filter((x) => x !== k));
    };

    const save = async () => {
        const toastId = toast.loading('Guardando configuración de intención...');
        try {
            const res = await updateIntentionNodeConfig({
                nodeId: node.id,
                keywords,
                miniPrompt: miniPrompt.trim(),
                threshold,
                noMatchMessage: noMatchMessage.trim(),
            });

            if (!res?.success) {
                toast.error(res?.message ?? 'No se pudo guardar', { id: toastId });
                return;
            }

            toast.success('Intención guardada', { id: toastId });
            router.refresh();
        } catch (e: any) {
            toast.error(e?.message ?? 'Error guardando intención', { id: toastId });
        }
    };

    return (
        <div className="space-y-4">
            {/* Keywords */}
            <div className="space-y-2">
                <Label className="text-xs">Palabras clave</Label>

                <div className="flex gap-2">
                    <Input
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        placeholder="Ej: manipulacion de alimentos"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addKeyword();
                            }
                        }}
                    />
                    <Button type="button" onClick={addKeyword} variant="secondary">
                        Agregar
                    </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                    {keywords.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                            Agrega palabras o frases que activan esta intención.
                        </p>
                    ) : (
                        keywords.map((k) => (
                            <button
                                key={k}
                                type="button"
                                className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80"
                                onClick={() => removeKeyword(k)}
                                title="Quitar"
                            >
                                {k} <span className="opacity-70">✕</span>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Mini prompt */}
            <div className="space-y-2">
                <Label className="text-xs">Mini instrucción</Label>
                <Textarea
                    value={miniPrompt}
                    onChange={(e) => setMiniPrompt(e.target.value)}
                    placeholder="Ej: Si el usuario pide info del curso, muestra horarios y precio."
                    className="min-h-[90px]"
                />
                <p className="text-[11px] text-muted-foreground">
                    Recomendación: máximo 1–2 frases (280 caracteres).
                </p>
            </div>

            {/* Threshold */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-xs">Umbral</Label>
                    <span className="text-xs text-muted-foreground">{threshold.toFixed(2)}</span>
                </div>

                <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-full"
                />

                <p className="text-[11px] text-muted-foreground">
                    Más alto = más estricto. Más bajo = se activa más fácil.
                </p>
            </div>

            {/* No match */}
            <div className="space-y-2">
                <Label className="text-xs">Si NO coincide</Label>
                <Textarea
                    value={noMatchMessage}
                    onChange={(e) => setNoMatchMessage(e.target.value)}
                    placeholder="Ej: ¿Te refieres al curso de manipulación de alimentos?"
                    className="min-h-[70px]"
                />
            </div>

            <Button type="button" className="w-full" onClick={save}>
                Guardar configuración
            </Button>
        </div>
    );
}