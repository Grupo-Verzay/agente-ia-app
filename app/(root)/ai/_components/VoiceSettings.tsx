'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mic } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    getUserVoiceSettings,
    updateUserVoiceSettings,
    getElevenLabsVoices,
} from '@/actions/userClientDataActions';

type VoiceGender = 'masculino' | 'femenino';

const DEFAULT_VOICE_INSTRUCTIONS =
    'Habla con voz cálida, cercana y entusiasta, como un asesor de ventas latinoamericano que genuinamente quiere ayudar. Usa un ritmo natural con pausas breves entre ideas. Transmite confianza y energía positiva sin sonar apresurado. Al mencionar beneficios o precios, enfatiza levemente esas palabras. Evita un tono plano o robótico. Habla en español latinoamericano neutro, fluido y natural.';

const VOICE_TEMPLATES: Record<string, Record<VoiceGender, string>> = {
    ventas: {
        masculino: 'Habla con voz cálida, enérgica y persuasiva, como un asesor de ventas latinoamericano que genuinamente quiere ayudar al cliente a tomar la mejor decisión. Usa un ritmo natural con pausas estratégicas antes de mencionar beneficios o precios. Transmite confianza y entusiasmo sin sonar apresurado. Enfatiza levemente palabras clave como beneficios, ahorro y valor. Evita un tono plano o robótico. Habla en español latinoamericano neutro, fluido y natural.',
        femenino: 'Habla con voz cálida, cercana y entusiasta, como una asesora de ventas latinoamericana que genuinamente quiere ayudar al cliente a tomar la mejor decisión. Usa un ritmo natural con pausas estratégicas antes de mencionar beneficios o precios. Transmite confianza y energía positiva sin sonar apresurada. Enfatiza levemente palabras clave como beneficios, ahorro y valor. Evita un tono plano o robótico. Habla en español latinoamericano neutro, fluido y natural.',
    },
    soporte: {
        masculino: 'Habla con voz tranquila, empática y profesional, como un asesor de soporte latinoamericano comprometido con resolver cada situación. Usa un ritmo pausado y claro, con énfasis en los pasos a seguir. Transmite calma y seguridad en todo momento. Evita sonar apresurado o robótico. Habla en español latinoamericano neutro, fluido y natural.',
        femenino: 'Habla con voz tranquila, empática y amable, como una asesora de soporte latinoamericana comprometida con resolver cada situación. Usa un ritmo pausado y claro, con énfasis en los pasos a seguir. Transmite calma y seguridad en todo momento. Evita sonar apresurada o robótica. Habla en español latinoamericano neutro, fluido y natural.',
    },
    corporativo: {
        masculino: 'Habla con voz clara, segura y profesional, como un ejecutivo latinoamericano. Usa un ritmo moderado con pausas breves entre ideas. Transmite autoridad y confianza sin sonar frío o distante. Cuida la dicción y pronuncia con claridad. Evita un tono informal o robótico. Habla en español latinoamericano neutro, formal y natural.',
        femenino: 'Habla con voz clara, segura y profesional, como una ejecutiva latinoamericana. Usa un ritmo moderado con pausas breves entre ideas. Transmite autoridad y confianza sin sonar fría o distante. Cuida la dicción y pronuncia con claridad. Evita un tono informal o robótico. Habla en español latinoamericano neutro, formal y natural.',
    },
    casual: {
        masculino: 'Habla con voz relajada, cercana y animada, como un amigo latinoamericano que comparte información útil. Usa un ritmo ágil y dinámico con entonación variada. Transmite energía y naturalidad usando expresiones cotidianas. Evita sonar formal o robótico. Habla en español latinoamericano neutro, casual y fluido.',
        femenino: 'Habla con voz relajada, cercana y animada, como una amiga latinoamericana que comparte información útil. Usa un ritmo ágil y dinámico con entonación variada. Transmite energía y naturalidad usando expresiones cotidianas. Evita sonar formal o robótica. Habla en español latinoamericano neutro, casual y fluido.',
    },
};

const TEMPLATE_LABELS: Record<string, string> = {
    ventas: 'Ventas / Persuasivo',
    soporte: 'Atención al cliente',
    corporativo: 'Formal / Corporativo',
    casual: 'Amigable / Casual',
};

const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;

function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:mt-0">
            {children}
        </p>
    );
}

/**
 * Panel de configuración de voz del agente (notas de voz de WhatsApp).
 * Es UNA sola config global por cuenta: aplica a todos los canales de chat.
 * Autocontenido: carga su propia config al montar y guarda en cada cambio.
 */
export function VoiceSettings({ userId }: { userId: string }) {
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);

    const [enabled, setEnabled] = useState(false);
    const [voiceId, setVoiceId] = useState('nova');
    const [voiceModel, setVoiceModel] = useState('gpt-4o-mini-tts');
    const [voiceInstructions, setVoiceInstructions] = useState('');
    const [ttsProvider, setTtsProvider] = useState('openai');
    const [elApiKey, setElApiKey] = useState('');
    const [elVoiceId, setElVoiceId] = useState('');
    const [voiceGender, setVoiceGender] = useState<VoiceGender>('femenino');

    const [elVoices, setElVoices] = useState<{ voice_id: string; name: string; category: string }[]>([]);
    const [elVoiceSearch, setElVoiceSearch] = useState('');
    const [loadingElVoices, setLoadingElVoices] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void getUserVoiceSettings(userId).then((res) => {
            if (cancelled) return;
            if (res.success && res.data) {
                setEnabled(res.data.enableVoiceResponses);
                setVoiceId(res.data.voiceId);
                setVoiceModel(res.data.voiceModel);
                setVoiceInstructions(res.data.voiceInstructions || DEFAULT_VOICE_INSTRUCTIONS);
                setTtsProvider(res.data.ttsProvider);
                setElApiKey(res.data.elevenLabsApiKey);
                setElVoiceId(res.data.elevenLabsVoiceId);
            }
            setLoaded(true);
        });
        return () => {
            cancelled = true;
        };
    }, [userId]);

    // Guarda pasando valores explícitos (el estado es async); lo no pasado usa el actual.
    const persist = async (next: {
        enabled?: boolean;
        voice?: string;
        model?: string;
        instructions?: string;
        provider?: string;
        apiKey?: string;
        elId?: string;
    }) => {
        setSaving(true);
        const res = await updateUserVoiceSettings(
            userId,
            next.enabled ?? enabled,
            next.voice ?? voiceId,
            next.model ?? voiceModel,
            next.instructions ?? voiceInstructions,
            next.provider ?? ttsProvider,
            next.apiKey ?? elApiKey,
            next.elId ?? elVoiceId,
        );
        setSaving(false);
        if (res.success) toast.success(res.message);
        else toast.error(res.message);
    };

    const handleLoadElVoices = async () => {
        if (!elApiKey.trim()) {
            toast.error('Ingresa el API key de ElevenLabs primero.');
            return;
        }
        setLoadingElVoices(true);
        const res = await getElevenLabsVoices(elApiKey.trim());
        if (res.success && res.data) setElVoices(res.data);
        else toast.error(res.message);
        setLoadingElVoices(false);
    };

    if (!loaded) {
        return (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando configuración de voz…
            </div>
        );
    }

    const isOpenAI = ttsProvider !== 'elevenlabs';

    return (
        <div className="space-y-1">
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <Mic className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-xs text-muted-foreground">
                    El agente responderá con audios nativos de WhatsApp en lugar de texto.
                    Esta voz es <strong className="text-foreground">única para tu agente</strong> y aplica a
                    todos los canales de chat.
                </p>
                {saving && <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
            </div>

            {/* ── Apartado 1: Motor de voz (2×2) ── */}
            <SectionTitle>Motor de voz</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
                {/* Notas de voz */}
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <Mic className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-semibold">Notas de voz</p>
                            <p className="text-xs text-muted-foreground">Responder con audios en vez de texto</p>
                        </div>
                        <Switch
                            checked={enabled}
                            onCheckedChange={(v) => {
                                setEnabled(v);
                                void persist({ enabled: v });
                            }}
                        />
                    </div>
                </div>

                {/* Proveedor */}
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Proveedor de voz
                    </p>
                    <div className="flex divide-x divide-border overflow-hidden rounded-md border">
                        {([
                            { id: 'openai', label: 'OpenAI TTS', desc: 'GPT-4o / HD' },
                            { id: 'elevenlabs', label: 'ElevenLabs', desc: 'Clonación' },
                        ] as const).map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                    setTtsProvider(p.id);
                                    void persist({ provider: p.id });
                                }}
                                className={cn(
                                    'h-11 flex-1 px-2 text-center text-xs font-medium leading-tight transition-colors',
                                    ttsProvider === p.id ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
                                )}
                            >
                                {p.label}
                                <span className={cn('block text-[10px] font-normal', ttsProvider === p.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                                    {p.desc}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {enabled && isOpenAI && (
                    <>
                        {/* Modelo TTS */}
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modelo TTS</p>
                            <div className="flex divide-x divide-border overflow-hidden rounded-md border">
                                {([
                                    { id: 'gpt-4o-mini-tts', label: '4o Mini', desc: 'Natural' },
                                    { id: 'tts-1-hd', label: 'TTS-1 HD', desc: 'Alta' },
                                    { id: 'tts-1', label: 'TTS-1', desc: 'Estándar' },
                                ] as const).map((m) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => {
                                            setVoiceModel(m.id);
                                            void persist({ model: m.id });
                                        }}
                                        className={cn(
                                            'h-11 flex-1 px-1 text-center text-xs font-medium leading-tight transition-colors',
                                            voiceModel === m.id ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
                                        )}
                                    >
                                        {m.label}
                                        <span className={cn('block text-[10px] font-normal', voiceModel === m.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                                            {m.desc}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Voz */}
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Voz</p>
                            <div className="grid grid-cols-3 gap-1.5">
                                {OPENAI_VOICES.map((v) => (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() => {
                                            setVoiceId(v);
                                            void persist({ voice: v });
                                        }}
                                        className={cn(
                                            'h-9 rounded-md border px-2 text-sm font-medium capitalize transition-colors',
                                            voiceId === v ? 'border-primary bg-primary text-primary-foreground' : 'border-input hover:bg-muted',
                                        )}
                                    >
                                        {v}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {enabled && !isOpenAI && (
                    <>
                        {/* API Key ElevenLabs */}
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">API Key de ElevenLabs</p>
                            <div className="flex gap-2">
                                <Input
                                    type="password"
                                    placeholder="sk_..."
                                    value={elApiKey}
                                    onChange={(e) => setElApiKey(e.target.value)}
                                    onBlur={() => void persist({ apiKey: elApiKey })}
                                    className="h-9 flex-1 text-sm"
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleLoadElVoices}
                                    disabled={loadingElVoices || !elApiKey.trim()}
                                    className="h-9 shrink-0"
                                >
                                    {loadingElVoices ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cargar voces'}
                                </Button>
                            </div>
                        </div>

                        {/* Voz clonada */}
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Voz de ElevenLabs</p>
                            {elVoices.length > 0 ? (
                                <div className="space-y-1.5">
                                    <Input
                                        placeholder="Buscar voz..."
                                        value={elVoiceSearch}
                                        onChange={(e) => setElVoiceSearch(e.target.value)}
                                        className="h-8 text-sm"
                                    />
                                    <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                                        {elVoices
                                            .filter((v) => v.name.toLowerCase().includes(elVoiceSearch.toLowerCase()))
                                            .map((v) => (
                                                <button
                                                    key={v.voice_id}
                                                    type="button"
                                                    onClick={() => {
                                                        setElVoiceId(v.voice_id);
                                                        void persist({ elId: v.voice_id });
                                                    }}
                                                    className={cn(
                                                        'flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-left text-sm font-medium transition-colors',
                                                        elVoiceId === v.voice_id ? 'border-primary bg-primary text-primary-foreground' : 'border-input hover:bg-muted',
                                                    )}
                                                >
                                                    <span className="truncate">{v.name}</span>
                                                    <span className={cn('ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px]', elVoiceId === v.voice_id ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                                                        {v.category === 'cloned' ? '🎤 clonada' : v.category}
                                                    </span>
                                                </button>
                                            ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    {elVoiceId ? 'Voz guardada. Pulsa “Cargar voces” para ver y cambiar.' : 'Carga las voces con tu API key para elegir una.'}
                                </p>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* ── Apartado 2: Estilo y tono (solo OpenAI) ── */}
            {enabled && isOpenAI && (
                <>
                    <SectionTitle>Estilo y tono</SectionTitle>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {/* Género */}
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Género de la voz</p>
                            <div className="flex divide-x divide-border overflow-hidden rounded-md border">
                                {(['masculino', 'femenino'] as const).map((g) => (
                                    <button
                                        key={g}
                                        type="button"
                                        onClick={() => setVoiceGender(g)}
                                        className={cn(
                                            'h-9 flex-1 text-xs font-medium capitalize transition-colors',
                                            voiceGender === g
                                                ? g === 'masculino'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-pink-500 text-white'
                                                : 'text-foreground hover:bg-muted',
                                        )}
                                    >
                                        {g === 'masculino' ? '♂ Masculino' : '♀ Femenino'}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-1.5 text-[11px] text-muted-foreground">Ajusta las plantillas de instrucciones al género elegido.</p>
                        </div>

                        {/* Instrucciones */}
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Instrucciones de voz</p>
                            <div className="mb-1.5 grid grid-cols-2 gap-1.5">
                                {Object.entries(TEMPLATE_LABELS).map(([key, label]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => {
                                            const text = VOICE_TEMPLATES[key][voiceGender];
                                            setVoiceInstructions(text);
                                            void persist({ instructions: text });
                                        }}
                                        className="h-8 truncate rounded-md border border-input px-2 text-xs font-medium transition-colors hover:bg-muted"
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <Textarea
                                placeholder="Selecciona una plantilla o escribe tus propias instrucciones de voz..."
                                value={voiceInstructions}
                                onChange={(e) => setVoiceInstructions(e.target.value)}
                                onBlur={() => void persist({ instructions: voiceInstructions })}
                                rows={3}
                                className="resize-none text-sm"
                            />
                            <p className="mt-1 text-[11px] text-muted-foreground">Solo aplica con GPT-4o Mini. Define el tono y estilo del audio.</p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
