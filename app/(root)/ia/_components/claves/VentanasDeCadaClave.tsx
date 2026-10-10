'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mic, Phone, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ApiKeyConfigurator } from '@/app/(root)/profile/_components/ApiKeyConfigurator';
import { VoiceSettings } from '@/app/(root)/ai/_components/VoiceSettings';
import { VENTANA_DE_VOZ } from '@/app/(root)/ai/_components/ai-section-labels';
import {
    actualizarLaLineaDelCanalAction,
    guardarElAvatarDeTavusAction,
    guardarLaClaveDeLlamadasAction,
    quitarElAvatarDeTavusAction,
} from '@/actions/claves-por-canal-actions';
import {
    SECCIONES_DE_CLAVES,
    comoSeEnsenaLaClave,
    esSeccionDeLinea,
    type EstadoDeSeccion,
    type LineaDelCanal,
    type SeccionDeClaves,
} from '@/lib/claves-por-canal';

type PropsDeLaVentana = {
    userId: string;
    estado: EstadoDeSeccion | undefined;
    onOpenChange: (open: boolean) => void;
    /** Tras guardar: el botón «Claves» vuelve a mirar su estado. */
    onGuardado: () => void;
};

/** La ventana específica de una sección: la que se abre al pulsar su tarjeta. */
export function VentanaDeLaSeccion({ seccion, ...props }: PropsDeLaVentana & { seccion: SeccionDeClaves | null }) {
    if (!seccion) return null;
    if (seccion === 'mensajeria') {
        return (
            <ApiKeyConfigurator
                userId={props.userId}
                sinDisparador
                open
                onOpenChange={props.onOpenChange}
                onSaved={props.onGuardado}
            />
        );
    }
    if (seccion === 'voz') return <VentanaDeVoz {...props} />;
    if (seccion === 'llamadas') return <VentanaDeLlamadas {...props} />;
    if (seccion === 'videollamadas') return <VentanaDeTavus {...props} />;
    if (esSeccionDeLinea(seccion)) return <VentanaDeLineas seccion={seccion} {...props} />;
    return null;
}

/* ── Voz: el mismo panel de siempre, ahora bajo «Claves» ───────────────── */

function VentanaDeVoz({ userId, onOpenChange, onGuardado }: PropsDeLaVentana) {
    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[min(585px,92dvh)] w-[min(820px,calc(100vw-1.5rem))] max-w-none flex-col overflow-hidden p-0">
                <DialogHeader className="border-b px-5 py-3">
                    <DialogTitle className="flex items-center gap-2">
                        <Mic className="h-4 w-4 text-primary" />
                        {VENTANA_DE_VOZ}
                    </DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto px-5 py-4">
                    <VoiceSettings userId={userId} onSaved={onGuardado} />
                </div>
            </DialogContent>
        </Dialog>
    );
}

/* ── Selector de proveedor: los que aún no funcionan se ven y no se pulsan ─ */

function ProveedoresDeLaSeccion({ seccion, elegido }: { seccion: SeccionDeClaves; elegido: string }) {
    const proveedores = SECCIONES_DE_CLAVES[seccion].proveedores;
    return (
        <div className="grid gap-2">
            <Label>Proveedor</Label>
            <div className="flex divide-x divide-border overflow-hidden rounded-md border">
                {proveedores.map((p) => (
                    <button
                        key={p.id}
                        type="button"
                        disabled={!p.disponible}
                        aria-pressed={p.id === elegido}
                        className={cn(
                            'h-11 flex-1 px-2 text-center text-xs font-medium leading-tight transition-colors',
                            p.id === elegido ? 'bg-primary text-primary-foreground' : 'text-foreground',
                            !p.disponible && 'cursor-not-allowed text-muted-foreground opacity-60',
                        )}
                    >
                        {p.nombre}
                        {!p.disponible && <span className="block text-[10px] font-normal">Próximamente</span>}
                    </button>
                ))}
            </div>
        </div>
    );
}

function LaGuardada({ estado }: { estado: EstadoDeSeccion | undefined }) {
    if (!estado) return null;
    return (
        <p className={cn('text-xs', estado.estado === 'lista' ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400')}>
            {estado.estado === 'lista' ? `Guardada: ${estado.detalle}` : estado.detalle}
        </p>
    );
}

/* ── Llamadas: OpenAI hoy; ElevenLabs con su sitio ya hecho ────────────── */

function VentanaDeLlamadas({ userId, estado, onOpenChange, onGuardado }: PropsDeLaVentana) {
    const [clave, setClave] = useState('');
    const [guardando, setGuardando] = useState(false);
    const hayGuardada = estado?.estado === 'lista';

    const guardar = async () => {
        setGuardando(true);
        const res = await guardarLaClaveDeLlamadasAction(userId, clave);
        setGuardando(false);
        if (!res.success) {
            toast.error(res.message);
            return;
        }
        toast.success(res.message);
        onGuardado();
        onOpenChange(false);
    };

    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-primary" />
                        {SECCIONES_DE_CLAVES.llamadas.titulo}
                    </DialogTitle>
                    <DialogDescription>{SECCIONES_DE_CLAVES.llamadas.descripcion}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <ProveedoresDeLaSeccion seccion="llamadas" elegido="openai" />
                    <div className="grid gap-2">
                        <Label htmlFor="clave-de-llamadas">API key de OpenAI</Label>
                        <Input
                            id="clave-de-llamadas"
                            type="password"
                            autoComplete="off"
                            value={clave}
                            onChange={(e) => setClave(e.target.value)}
                            placeholder={hayGuardada ? 'Déjala vacía para conservar la guardada' : 'sk-****************************'}
                            disabled={guardando}
                        />
                        <LaGuardada estado={estado} />
                        <p className="text-xs text-muted-foreground">
                            Es la clave de OpenAI de tu cuenta: si la mensajería también usa OpenAI, cambia en los dos sitios.
                            Obtén tu key en{' '}
                            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                                platform.openai.com/api-keys
                            </a>
                        </p>
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
                        Cancelar
                    </Button>
                    <Button type="button" variant="save" onClick={guardar} disabled={guardando || (!clave.trim() && !hayGuardada)}>
                        {guardando ? 'Guardando…' : 'Guardar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ── Videollamadas: la clave y el avatar de Tavus de ESTA cuenta ───────── */

function VentanaDeTavus({ userId, estado, onOpenChange, onGuardado }: PropsDeLaVentana) {
    const [clave, setClave] = useState('');
    const [personaId, setPersonaId] = useState(estado?.personaId ?? '');
    const [guardando, setGuardando] = useState(false);
    const hayPropio = estado?.estado === 'lista';

    useEffect(() => {
        if (estado?.personaId) setPersonaId((actual) => actual || estado.personaId!);
    }, [estado?.personaId]);

    const hecho = (res: { success: boolean; message: string }) => {
        if (!res.success) {
            toast.error(res.message);
            return;
        }
        toast.success(res.message);
        onGuardado();
        onOpenChange(false);
    };

    const guardar = async () => {
        setGuardando(true);
        const res = await guardarElAvatarDeTavusAction(userId, { clave, personaId });
        setGuardando(false);
        hecho(res);
    };

    const quitar = async () => {
        setGuardando(true);
        const res = await quitarElAvatarDeTavusAction(userId);
        setGuardando(false);
        hecho(res);
    };

    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Video className="h-4 w-4 text-primary" />
                        {SECCIONES_DE_CLAVES.videollamadas.titulo}
                    </DialogTitle>
                    <DialogDescription>{SECCIONES_DE_CLAVES.videollamadas.descripcion}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <ProveedoresDeLaSeccion seccion="videollamadas" elegido="tavus" />
                    <div className="grid gap-2">
                        <Label htmlFor="clave-de-tavus">API key de Tavus</Label>
                        <Input
                            id="clave-de-tavus"
                            type="password"
                            autoComplete="off"
                            value={clave}
                            onChange={(e) => setClave(e.target.value)}
                            placeholder={hayPropio ? 'Déjala vacía para conservar la guardada' : 'Tu API key de Tavus'}
                            disabled={guardando}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="avatar-de-tavus">ID del avatar (persona_id)</Label>
                        <Input
                            id="avatar-de-tavus"
                            autoComplete="off"
                            value={personaId}
                            onChange={(e) => setPersonaId(e.target.value)}
                            placeholder="p1234abcd"
                            disabled={guardando}
                        />
                        <LaGuardada estado={estado} />
                        <p className="text-xs text-muted-foreground">
                            Los dos están en{' '}
                            <a href="https://platform.tavus.io" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                                platform.tavus.io
                            </a>
                            . Sin clave propia, las videollamadas usan el avatar de la plataforma.
                        </p>
                    </div>
                </div>
                <DialogFooter className="gap-2 sm:justify-between">
                    {hayPropio ? (
                        <Button type="button" variant="ghost" className="text-destructive" onClick={quitar} disabled={guardando}>
                            Usar el de la plataforma
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="save"
                            onClick={guardar}
                            disabled={guardando || !personaId.trim() || (!clave.trim() && !hayPropio)}
                        >
                            {guardando ? 'Guardando…' : 'Guardar'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ── WhatsApp API, Telegram, Facebook, Instagram: el token de cada línea ── */

const ID_DE_LA_LINEA: Partial<Record<SeccionDeClaves, { etiqueta: string; ejemplo: string }>> = {
    'linea-whatsapp-api': { etiqueta: 'Phone Number ID', ejemplo: '123456789012345' },
    'linea-facebook': { etiqueta: 'Page ID', ejemplo: '102938475610293' },
    'linea-instagram': { etiqueta: 'Instagram Account ID', ejemplo: '17841400000000000' },
};

function VentanaDeLineas({ seccion, userId, estado, onOpenChange, onGuardado }: PropsDeLaVentana & { seccion: SeccionDeClaves }) {
    const def = SECCIONES_DE_CLAVES[seccion];
    const lineas = estado?.lineas ?? [];
    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{def.titulo}</DialogTitle>
                    <DialogDescription>{def.descripcion}</DialogDescription>
                </DialogHeader>
                {lineas.length === 0 ? (
                    <div className="grid gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                        <p>Esta cuenta aún no tiene ninguna línea de este canal. Se conecta una vez en Conexión, y aquí podrás cambiar su token.</p>
                        <Button asChild variant="outline" className="w-fit">
                            <Link href="/connection">Ir a Conexión</Link>
                        </Button>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {lineas.map((l) => (
                            <TarjetaDeLinea
                                key={l.instanceName}
                                seccion={seccion}
                                linea={l}
                                userId={userId}
                                onGuardado={onGuardado}
                            />
                        ))}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function TarjetaDeLinea({
    seccion,
    linea,
    userId,
    onGuardado,
}: {
    seccion: SeccionDeClaves;
    linea: LineaDelCanal;
    userId: string;
    onGuardado: () => void;
}) {
    const id = ID_DE_LA_LINEA[seccion];
    const [editando, setEditando] = useState(false);
    const [token, setToken] = useState('');
    const [identificador, setIdentificador] = useState('');
    const [guardando, setGuardando] = useState(false);

    const guardar = async () => {
        setGuardando(true);
        const res = await actualizarLaLineaDelCanalAction(userId, seccion, linea.instanceName, { token, identificador });
        setGuardando(false);
        if (!res.success) {
            toast.error(res.message);
            return;
        }
        toast.success(res.message);
        setToken('');
        setIdentificador('');
        setEditando(false);
        onGuardado();
    };

    return (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{linea.nombre}</p>
                    <p className="truncate text-xs text-muted-foreground">
                        {linea.identificador ?? 'Sin identificador'} · Token {comoSeEnsenaLaClave(linea.clave)}
                    </p>
                </div>
                {!editando && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>
                        Cambiar
                    </Button>
                )}
            </div>
            {editando && (
                <div className="mt-3 grid gap-3">
                    {id && (
                        <div className="grid gap-1.5">
                            <Label htmlFor={`id-${linea.instanceName}`}>{id.etiqueta}</Label>
                            <Input
                                id={`id-${linea.instanceName}`}
                                autoComplete="off"
                                value={identificador}
                                onChange={(e) => setIdentificador(e.target.value)}
                                placeholder={linea.identificador ? `Vacío = conservar ${linea.identificador}` : id.ejemplo}
                                disabled={guardando}
                            />
                        </div>
                    )}
                    <div className="grid gap-1.5">
                        <Label htmlFor={`token-${linea.instanceName}`}>
                            {seccion === 'linea-telegram' ? 'Bot Token' : 'Access Token'}
                        </Label>
                        <Input
                            id={`token-${linea.instanceName}`}
                            type="password"
                            autoComplete="off"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder={linea.clave.tieneClave ? 'Déjalo vacío para conservar el guardado' : 'Pega el token'}
                            disabled={guardando}
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditando(false)} disabled={guardando}>
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="save"
                            onClick={guardar}
                            disabled={guardando || (!token.trim() && !identificador.trim())}
                        >
                            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
