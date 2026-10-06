"use client";

/**
 * El selector del TIPO de activación de un flujo (Inicio, IA, Flujo o
 * Chatbot) con sus campos: lo usan «Nuevo flujo» y «Cambiar tipo», así el
 * flujo se elige y se cambia con el MISMO selector.
 *
 * Controlado: no guarda nada; lo que se escribe lo decide
 * `lib/tipo-de-activacion.ts`.
 */
import React, { useState } from "react";
import { Bot, Brain, HomeIcon, SaveIcon, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TipoDeFlujo } from "@/lib/flujos-de-la-lista";
import { TOPE_DE_PALABRAS_CLAVE, type Coincidencia } from "@/lib/tipo-de-activacion";

export interface ActivacionEnElSelector {
    tipo: TipoDeFlujo | null;
    palabras: string[];
    coincidencia: Coincidencia;
    condicion: string;
}

export const ACTIVACION_VACIA: ActivacionEnElSelector = {
    tipo: null,
    palabras: [],
    coincidencia: "exacta",
    condicion: "",
};

export const OPCIONES_DE_TIPO: {
    value: TipoDeFlujo;
    label: string;
    subtitle: string;
    icon: React.ElementType;
    bg: string;
    border: string;
    text: string;
    iconColor: string;
    subtitleColor: string;
}[] = [
    {
        value: "inicio",
        label: "Inicio",
        subtitle: "Primera conexión",
        icon: HomeIcon,
        bg: "bg-orange-50 dark:bg-orange-950/30",
        border: "border-orange-200 dark:border-orange-800 hover:border-orange-400",
        text: "text-orange-700 dark:text-orange-300",
        iconColor: "text-orange-500",
        subtitleColor: "text-orange-400 dark:text-orange-500",
    },
    {
        value: "ia",
        label: "IA",
        subtitle: "Detecta intenciones",
        icon: Brain,
        bg: "bg-blue-50 dark:bg-blue-950/30",
        border: "border-blue-200 dark:border-blue-800 hover:border-blue-400",
        text: "text-blue-700 dark:text-blue-300",
        iconColor: "text-blue-500",
        subtitleColor: "text-blue-400 dark:text-blue-500",
    },
    {
        value: "flujo",
        label: "Flujo",
        subtitle: "Manual o encadenado",
        icon: Workflow,
        bg: "bg-violet-50 dark:bg-violet-950/30",
        border: "border-violet-200 dark:border-violet-800 hover:border-violet-400",
        text: "text-violet-700 dark:text-violet-300",
        iconColor: "text-violet-500",
        subtitleColor: "text-violet-400 dark:text-violet-500",
    },
    {
        value: "chatbot",
        label: "Chatbot",
        subtitle: "Por palabras clave",
        icon: Bot,
        bg: "bg-emerald-50 dark:bg-emerald-950/30",
        border: "border-emerald-200 dark:border-emerald-800 hover:border-emerald-400",
        text: "text-emerald-700 dark:text-emerald-300",
        iconColor: "text-emerald-500",
        subtitleColor: "text-emerald-400 dark:text-emerald-500",
    },
];

export function SelectorDeTipoDeActivacion({
    value,
    onChange,
    palabrasObligatorias = false,
}: {
    value: ActivacionEnElSelector;
    onChange: (siguiente: ActivacionEnElSelector) => void;
    /** Cambiar el tipo a Chatbot exige palabras: sin ellas no se activaría nunca. */
    palabrasObligatorias?: boolean;
}) {
    const [palabraEscrita, setPalabraEscrita] = useState("");
    const { tipo } = value;

    const agregarPalabra = () => {
        const raw = palabraEscrita.trim();
        if (!raw) return;
        if (value.palabras.length >= TOPE_DE_PALABRAS_CLAVE) {
            toast.error(`Máximo ${TOPE_DE_PALABRAS_CLAVE} palabras clave`);
            return;
        }
        if (value.palabras.some((k) => k.toLowerCase() === raw.toLowerCase())) {
            toast.error("Palabra clave ya agregada");
            return;
        }
        onChange({ ...value, palabras: [...value.palabras, raw] });
        setPalabraEscrita("");
    };

    const seleccionada = OPCIONES_DE_TIPO.find((o) => o.value === tipo);

    return (
        <div className="space-y-3" data-selector-de-tipo>
            <div className="space-y-4">
                <Label className="font-bold text-base">Tipo</Label>
                {!tipo && <p className="text-sm text-foreground/70">Define cómo se activa el flujo:</p>}

                <div className="grid grid-cols-2 gap-2">
                    {!seleccionada ? (
                        OPCIONES_DE_TIPO.map((opt) => {
                            const Icon = opt.icon;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    data-tipo={opt.value}
                                    onClick={() => onChange({ ...value, tipo: opt.value })}
                                    className={`h-[72px] flex flex-col items-center justify-center gap-1 rounded-lg border px-2 transition-colors ${opt.bg} ${opt.border}`}
                                >
                                    <div className="flex flex-row items-center gap-1.5">
                                        <Icon className={`h-4 w-4 shrink-0 ${opt.iconColor}`} />
                                        <p className={`text-sm font-semibold leading-none ${opt.text}`}>{opt.label}</p>
                                    </div>
                                    <p className={`text-[10px] leading-none ${opt.subtitleColor}`}>{opt.subtitle}</p>
                                </button>
                            );
                        })
                    ) : (
                        <button
                            type="button"
                            data-tipo-elegido={seleccionada.value}
                            onClick={() => onChange({ ...value, tipo: null })}
                            className="col-span-2 h-10 px-4 flex items-center gap-2 rounded-lg border border-primary bg-primary/5 text-primary transition-colors"
                        >
                            <seleccionada.icon className="h-4 w-4 shrink-0" />
                            <p className="text-sm font-semibold">{seleccionada.label}</p>
                            <span className="ml-auto text-sm text-primary/60">Cambiar</span>
                        </button>
                    )}
                </div>
            </div>

            {tipo === "flujo" && (
                <p className="text-sm text-foreground/70">
                    Se activa cuando el agente IA lo llama por su nombre desde<br />algún paso, o manualmente mediante una respuesta rápida.
                </p>
            )}

            {tipo === "inicio" && (
                <p className="text-sm text-foreground/70">
                    Se ejecuta automáticamente cuando un contacto escribe<br />por primera vez. Solo puede haber un flujo de bienvenida activo.
                </p>
            )}

            {tipo === "ia" && (
                <div className="space-y-1.5">
                    <Label className="font-semibold text-sm">
                        Descripción de la intención <span className="text-xs text-primary font-normal">(obligatorio)</span>
                    </Label>
                    <Textarea
                        value={value.condicion}
                        onChange={(e) => onChange({ ...value, condicion: e.target.value })}
                        placeholder="El usuario quiere comprar o pregunta por precios o disponibilidad"
                        rows={3}
                        className="resize-none text-sm"
                        data-campo="condicion"
                    />
                </div>
            )}

            {tipo === "chatbot" && (
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label className="font-semibold text-sm">Tipo de coincidencia</Label>
                        <select
                            value={value.coincidencia}
                            onChange={(e) => onChange({ ...value, coincidencia: e.target.value as Coincidencia })}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            data-campo="coincidencia"
                        >
                            <option value="exacta">Exacta</option>
                            <option value="contiene">Contiene</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label className="flex gap-1 items-center font-semibold text-sm">
                            Palabras clave{" "}
                            <span className="text-xs text-primary font-normal">
                                ({palabrasObligatorias ? "al menos una" : "opcional"}, hasta {TOPE_DE_PALABRAS_CLAVE})
                            </span>
                        </Label>
                        <div className="flex gap-2">
                            <Input
                                value={palabraEscrita}
                                onChange={(e) => setPalabraEscrita(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        agregarPalabra();
                                    }
                                }}
                                placeholder="Escribe una palabra o frase y presiona Enter"
                                data-campo="palabra"
                            />
                            <Button
                                type="button"
                                onClick={agregarPalabra}
                                aria-label="Agregar palabra clave"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 h-10 shrink-0"
                            >
                                <SaveIcon className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {value.palabras.map((kw) => (
                                <span key={kw} className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground" data-palabra={kw}>
                                    {kw}
                                    <button
                                        type="button"
                                        aria-label={`Quitar ${kw}`}
                                        onClick={() => onChange({ ...value, palabras: value.palabras.filter((k) => k !== kw) })}
                                        className="ml-1 opacity-70 hover:opacity-100"
                                    >
                                        ✕
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
